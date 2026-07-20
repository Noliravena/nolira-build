import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'

import type {
  GrokAcpEvent,
  GrokAcpEventListener,
  GrokAgentCapabilities,
  GrokConnectRequest,
  GrokModelOption,
  GrokPermissionDecision,
  GrokPermissionOption,
  GrokPermissionRequest,
  GrokPermissionResponse,
  GrokPromptRequest,
  GrokPromptResult,
  GrokReasoningEffort,
  GrokSessionReady,
  GrokToolActivity,
  GrokToolStatus,
  JsonValue,
} from '../../shared/acp'
import type {
  BackgroundTaskState,
  GoalState,
  SubagentState
} from '../../shared/models'
import { buildPromptBlocks } from './attachments'
import { GrokAcpError, GrokAcpTimeoutError } from './errors'
import { resolveGrokExecutable } from './executable'
import {
  isJsonRpcRequest,
  isJsonRpcResponse,
  parseJsonRpcLine,
  rpcIdKey,
  type JsonRpcId,
  type JsonRpcMessage,
  type JsonRpcResponse,
} from './jsonrpc'

const DEFAULT_RPC_TIMEOUT_MS = 120_000
const PROMPT_RPC_TIMEOUT_MS = 6 * 60 * 60 * 1_000

interface PendingRpc {
  method: string
  timer: NodeJS.Timeout
  resolve: (result: JsonValue) => void
  reject: (error: Error) => void
}

interface PendingPermission {
  rpcId: JsonRpcId
  options: GrokPermissionOption[]
}

interface PendingPlanApproval {
  rpcId: JsonRpcId
}

interface InitializeState {
  capabilities: GrokAgentCapabilities
  models: GrokModelOption[]
  currentModelId?: string
  agentVersion?: string
  authMethodIds: string[]
}

export class GrokAcpClient {
  readonly taskId: string

  private readonly emitter = new EventEmitter()
  private readonly options: GrokConnectRequest
  private readonly pending = new Map<string, PendingRpc>()
  private readonly pendingPermissions = new Map<string, PendingPermission>()
  private readonly pendingPlanApprovals = new Map<string, PendingPlanApproval>()
  private child?: ChildProcessWithoutNullStreams
  private stdoutLines?: ReadlineInterface
  private stderrLines?: ReadlineInterface
  private nextId = 1
  private closing = false
  private promptInFlight = false
  private cwd: string
  private sessionId?: string
  private models: GrokModelOption[] = []
  private currentModelId?: string
  private agentVersion?: string
  private authMethodIds: string[] = []
  private capabilities: GrokAgentCapabilities = {
    loadSession: false,
    prompt: { image: false, audio: false, embeddedContext: false },
  }

  constructor(options: GrokConnectRequest) {
    if (!options.taskId.trim()) throw new GrokAcpError('taskId is required.')
    if (!options.cwd.trim()) throw new GrokAcpError('A project directory is required.')
    this.options = { ...options }
    this.taskId = options.taskId
    this.cwd = options.cwd
  }

  get ready(): boolean {
    return Boolean(this.child && this.sessionId && !this.closing)
  }

  get engineSessionId(): string | undefined {
    return this.sessionId
  }

  get availableModels(): readonly GrokModelOption[] {
    return this.models
  }

  onEvent(listener: GrokAcpEventListener): () => void {
    this.emitter.on('event', listener)
    return () => this.emitter.off('event', listener)
  }

  async start(): Promise<GrokSessionReady> {
    if (this.child) throw new GrokAcpError('Grok ACP client has already started.')
    this.emitStatus('starting', 'Starting Grok ACP')

    try {
      const executable = await resolveGrokExecutable({
        explicitPath: this.options.executablePath,
      })
      const args = ['agent']
      if (this.options.model) args.push('--model', this.options.model)
      if (this.options.permissionMode === 'auto-approve') args.push('--always-approve')
      args.push('stdio')

      const child = spawn(executable, args, {
        cwd: this.cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
      this.child = child
      this.bindProcess(child)

      const clientInfo = this.options.clientInfo ?? { name: 'Nolira Build', version: '0.1.0' }
      const initializeResult = await this.request('initialize', {
        protocolVersion: 1,
        clientInfo: { name: clientInfo.name, version: clientInfo.version },
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
      })
      const initialized = parseInitializeState(initializeResult)
      this.capabilities = initialized.capabilities
      this.models = initialized.models
      this.currentModelId = initialized.currentModelId ?? this.options.model
      this.agentVersion = initialized.agentVersion
      this.authMethodIds = initialized.authMethodIds

      let sessionResult: JsonValue
      if (this.options.existingSessionId && this.capabilities.loadSession) {
        try {
          sessionResult = await this.loadSession(this.options.existingSessionId, this.cwd, false)
        } catch {
          sessionResult = await this.newSession(this.cwd, false)
        }
      } else {
        sessionResult = await this.newSession(this.cwd, false)
      }

      this.ingestSessionState(sessionResult, this.options.existingSessionId)
      const ready = this.readyPayload()
      this.emit({ type: 'ready', taskId: this.taskId, payload: ready, timestamp: Date.now() })
      this.emitStatus('ready', 'Grok ACP session ready')
      return ready
    } catch (error) {
      const normalized = normalizeError(error)
      this.emitError(normalized)
      await this.shutdown(false)
      throw normalized
    }
  }

  async newSession(cwd = this.cwd, emitReady = true): Promise<JsonValue> {
    this.cwd = cwd
    const params: Record<string, JsonValue> = {
      cwd,
      mcpServers: (this.options.mcpServers ?? []).map((server) => ({
        name: server.name,
        command: server.command,
        args: server.args
      }))
    }
    const metadata: Record<string, JsonValue> = {}
    if (this.options.rules) metadata.rules = this.options.rules
    if (this.options.systemPromptOverride) {
      metadata.systemPromptOverride = this.options.systemPromptOverride
    }
    if (Object.keys(metadata).length > 0) params._meta = metadata

    let result: JsonValue
    try {
      result = await this.request('session/new', params)
    } catch (error) {
      if (!isAuthenticationError(error) || this.authMethodIds.length === 0) throw error
      await this.tryAdvertisedAuthentication()
      result = await this.request('session/new', params)
    }
    this.ingestSessionState(result)
    if (emitReady) this.emitReady()
    return result
  }

  async loadSession(
    sessionId: string,
    cwd = this.cwd,
    emitReady = true,
  ): Promise<JsonValue> {
    if (!sessionId.trim()) throw new GrokAcpError('sessionId is required.')
    this.cwd = cwd
    const result = await this.request('session/load', {
      sessionId,
      cwd,
      mcpServers: (this.options.mcpServers ?? []).map((server) => ({
        name: server.name,
        command: server.command,
        args: server.args
      })),
    })
    this.ingestSessionState(result, sessionId)
    if (emitReady) this.emitReady()
    return result
  }

  async prompt(request: Omit<GrokPromptRequest, 'taskId'> | GrokPromptRequest): Promise<GrokPromptResult> {
    const sessionId = this.requireSessionId()
    if (this.promptInFlight) {
      throw new GrokAcpError('This task already has a Grok turn in progress.')
    }
    this.promptInFlight = true
    this.emitStatus('busy', 'Grok is working')

    try {
      if (request.model && request.model !== this.currentModelId) {
        await this.setModel(request.model)
      }
      const blocks = await buildPromptBlocks(request, {
        imageSupported: this.capabilities.prompt.image,
      })
      const effort = request.effort ?? 'medium'
      const metadata: Record<string, JsonValue> = {
        reasoningEffort: effort,
        'x.ai/effort': effort,
      }
      if (request.model ?? this.currentModelId) {
        metadata.modelId = request.model ?? this.currentModelId ?? ''
      }

      const raw = await this.request(
        'session/prompt',
        { sessionId, prompt: blocks, _meta: metadata },
        PROMPT_RPC_TIMEOUT_MS,
      )
      const rawRecord = asRecord(raw)
      const result: GrokPromptResult = {
        stopReason: readString(rawRecord, 'stopReason') ?? readString(rawRecord, 'stop_reason'),
        raw,
      }
      const finalTokens = findTotalTokens(rawRecord ?? {}, rawRecord)
      if (finalTokens !== undefined) this.emitPayload('context-usage', { usedTokens: finalTokens })
      this.emit({ type: 'completed', taskId: this.taskId, payload: result, timestamp: Date.now() })
      return result
    } catch (error) {
      const normalized = normalizeError(error)
      this.emitError(normalized)
      throw normalized
    } finally {
      this.promptInFlight = false
    }
  }

  async setModel(modelId: string): Promise<void> {
    const sessionId = this.requireSessionId()
    await this.request('session/set_model', { sessionId, modelId })
    this.currentModelId = modelId
  }

  async cancel(): Promise<void> {
    const sessionId = this.sessionId
    if (!sessionId) return
    try {
      await this.request('session/cancel', { sessionId })
    } finally {
      this.promptInFlight = false
      this.emit({
        type: 'cancelled',
        taskId: this.taskId,
        payload: {},
        timestamp: Date.now(),
      })
    }
  }

  async respondPermission(response: GrokPermissionResponse): Promise<void> {
    const parked = this.pendingPermissions.get(response.requestId)
    const planApproval = this.pendingPlanApprovals.get(response.requestId)
    if (planApproval) {
      const outcome = response.optionId === 'plan-abandon'
        ? 'abandoned'
        : response.optionId === 'plan-revise'
          ? 'cancelled'
          : 'approved'
      this.pendingPlanApprovals.delete(response.requestId)
      this.write({
        jsonrpc: '2.0',
        id: planApproval.rpcId,
        result: { outcome }
      })
      this.emitStatus('busy', 'Plan response sent')
      return
    }
    if (!parked) {
      throw new GrokAcpError(`Permission request is no longer pending: ${response.requestId}`)
    }
    const optionId = response.optionId || optionIdForDecision(response.decision, parked.options)
    if (!optionId) throw new GrokAcpError('A permission decision or optionId is required.')

    this.pendingPermissions.delete(response.requestId)
    this.write({
      jsonrpc: '2.0',
      id: parked.rpcId,
      result: { outcome: { outcome: 'selected', optionId } },
    })
    this.emitStatus('busy', 'Permission response sent')
  }

  async shutdown(emitStopped = true): Promise<void> {
    if (this.closing) return
    this.closing = true
    this.stdoutLines?.close()
    this.stderrLines?.close()
    this.failPending(new GrokAcpError('Grok agent stopped.'))
    this.pendingPermissions.clear()
    this.pendingPlanApprovals.clear()

    const child = this.child
    this.child = undefined
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill()
    }
    if (emitStopped) this.emitStatus('stopped', 'Grok ACP stopped')
  }

  private bindProcess(child: ChildProcessWithoutNullStreams): void {
    this.stdoutLines = createInterface({ input: child.stdout })
    this.stderrLines = createInterface({ input: child.stderr })
    this.stdoutLines.on('line', (line) => this.handleLine(line))
    this.stderrLines.on('line', (line) => {
      if (!line.trim()) return
      this.emit({
        type: 'stderr',
        taskId: this.taskId,
        payload: { line },
        timestamp: Date.now(),
      })
    })
    child.once('error', (error) => {
      const normalized = new GrokAcpError(`Failed to start Grok: ${error.message}`, { cause: error })
      this.failPending(normalized)
      this.emitError(normalized)
    })
    child.once('exit', (code, signal) => {
      this.child = undefined
      const detail = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`
      const error = new GrokAcpError(`Grok agent exited (${detail}).`)
      this.failPending(error)
      if (!this.closing) {
        this.emitError(error)
        this.emitStatus('error', detail)
      }
    })
  }

  private handleLine(line: string): void {
    const message = parseJsonRpcLine(line)
    if (!message) {
      if (line.trim()) {
        this.emit({
          type: 'stderr',
          taskId: this.taskId,
          payload: { line },
          timestamp: Date.now(),
        })
      }
      return
    }
    if (isJsonRpcResponse(message)) {
      this.handleResponse(message)
      return
    }
    void this.handleAgentMessage(message)
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pending.get(rpcIdKey(response.id))
    if (!pending) return
    this.pending.delete(rpcIdKey(response.id))
    clearTimeout(pending.timer)

    if (response.error) {
      pending.reject(
        new GrokAcpError(
          `Grok ACP ${pending.method} failed (${response.error.code}): ${response.error.message}`,
          { code: response.error.code, method: pending.method },
        ),
      )
    } else {
      pending.resolve(response.result ?? null)
    }
  }

  private async handleAgentMessage(message: Exclude<JsonRpcMessage, JsonRpcResponse>): Promise<void> {
    const method = message.method.replace(/^_+/, '')
    const params = message.params ?? null
    if (method === 'session/update' || method === 'x.ai/session/update') {
      this.mapSessionUpdate(params)
      return
    }
    if (
      method === 'x.ai/session_notification' ||
      method.endsWith('/session_notification') ||
      method.endsWith('/task_backgrounded') ||
      method.endsWith('/task_completed') ||
      method.endsWith('/monitor_event')
    ) {
      const paramsRecord = asRecord(params)
      const rawUpdate = asRecord(paramsRecord?.update) ?? paramsRecord ?? {}
      const update = { ...rawUpdate }
      if (!update.sessionUpdate && !update.session_update && !update.type) {
        if (method.endsWith('/task_backgrounded')) update.sessionUpdate = 'task_backgrounded'
        if (method.endsWith('/task_completed')) update.sessionUpdate = 'task_completed'
        if (method.endsWith('/monitor_event')) update.sessionUpdate = 'monitor_event'
      }
      const sessionId =
        readString(paramsRecord, 'sessionId') ??
        readString(paramsRecord, 'session_id') ??
        this.sessionId ??
        'unknown'
      for (const mapped of mapExtendedUpdate(update, sessionId)) {
        this.emit({
          type: mapped.type,
          taskId: this.taskId,
          payload: mapped.payload,
          timestamp: Date.now()
        } as GrokAcpEvent)
      }
      if (isJsonRpcRequest(message)) {
        this.write({ jsonrpc: '2.0', id: message.id, result: {} })
      }
      return
    }
    if (method === 'session/request_permission' || method === 'request_permission') {
      if (isJsonRpcRequest(message)) await this.handlePermission(message.id, params)
      return
    }
    if (
      (method === 'x.ai/exit_plan_mode' ||
        method === 'exit_plan_mode' ||
        method.endsWith('/exit_plan_mode')) &&
      isJsonRpcRequest(message)
    ) {
      const record = asRecord(params)
      const requestId = randomUUID()
      this.pendingPlanApprovals.set(requestId, { rpcId: message.id })
      const planContent =
        readString(record, 'planContent') ?? readString(record, 'plan_content')
      this.emit({
        type: 'permission-request',
        taskId: this.taskId,
        payload: {
          requestId,
          sessionId:
            readString(record, 'sessionId') ??
            readString(record, 'session_id') ??
            this.sessionId,
          toolCallId:
            readString(record, 'toolCallId') ?? readString(record, 'tool_call_id'),
          toolName: 'Plan approval',
          summary: 'Grok is ready to implement the plan',
          detail: planContent,
          options: [
            {
              optionId: 'plan-approve',
              name: 'Approve and implement',
              kind: 'allow_once'
            },
            {
              optionId: 'plan-revise',
              name: 'Keep planning',
              kind: 'reject_once'
            },
            {
              optionId: 'plan-abandon',
              name: 'Abandon plan',
              kind: 'reject_always'
            }
          ]
        },
        timestamp: Date.now()
      })
      this.emitStatus('waiting-permission', 'Plan approval required')
      return
    }

    this.emit({
      type: 'notification',
      taskId: this.taskId,
      payload: { method, params },
      timestamp: Date.now(),
    })
    // Unknown server requests must be acknowledged or the agent can block forever.
    if (isJsonRpcRequest(message)) {
      this.write({ jsonrpc: '2.0', id: message.id, result: {} })
    }
  }

  private mapSessionUpdate(params: JsonValue): void {
    const paramsRecord = asRecord(params)
    const update = asRecord(paramsRecord?.update) ?? paramsRecord
    if (!update) return
    const kind = readString(update, 'sessionUpdate') ?? readString(update, 'session_update')

    const extended = mapExtendedUpdate(update, this.sessionId ?? 'unknown')
    if (extended.length > 0) {
      for (const mapped of extended) {
        this.emit({
          type: mapped.type,
          taskId: this.taskId,
          payload: mapped.payload,
          timestamp: Date.now()
        } as GrokAcpEvent)
      }
      return
    }

    switch (kind) {
      case 'agent_message_chunk': {
        const text = extractText(update)
        if (text) this.emitPayload('message-delta', { text })
        break
      }
      case 'agent_thought_chunk': {
        const text = extractText(update)
        if (text) this.emitPayload('thought-delta', { text })
        break
      }
      case 'tool_call':
        this.emitPayload('tool-started', { tool: mapTool(update, false) })
        break
      case 'tool_call_update':
        this.emitPayload('tool-updated', { tool: mapTool(update, true) })
        break
      case 'plan':
        this.emitPayload('plan', { steps: mapPlan(update) })
        break
      default:
        this.emit({
          type: 'notification',
          taskId: this.taskId,
          payload: { method: `session/update:${kind ?? 'unknown'}`, params },
          timestamp: Date.now(),
        })
    }

    const usedTokens = findTotalTokens(update, paramsRecord)
    if (usedTokens !== undefined) this.emitPayload('context-usage', { usedTokens })
  }

  private async handlePermission(rpcId: JsonRpcId, params: JsonValue): Promise<void> {
    const requestId = randomUUID()
    const request = mapPermissionRequest(requestId, params)
    const parked: PendingPermission = { rpcId, options: request.options }

    if (this.options.permissionMode === 'auto-approve') {
      const optionId = optionIdForDecision('allow-once', parked.options) ?? 'allow-once'
      this.write({
        jsonrpc: '2.0',
        id: rpcId,
        result: { outcome: { outcome: 'selected', optionId } },
      })
      return
    }

    this.pendingPermissions.set(requestId, parked)
    this.emit({
      type: 'permission-request',
      taskId: this.taskId,
      payload: request,
      timestamp: Date.now(),
    })
    this.emitStatus('waiting-permission', request.summary)
  }

  private request(method: string, params: JsonValue, timeoutMs = DEFAULT_RPC_TIMEOUT_MS): Promise<JsonValue> {
    if (!this.child || this.closing) {
      return Promise.reject(new GrokAcpError('Grok ACP process is not running.', { method }))
    }
    const id = this.nextId++
    return new Promise<JsonValue>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rpcIdKey(id))
        reject(new GrokAcpTimeoutError(method, timeoutMs))
      }, timeoutMs)
      timer.unref()
      this.pending.set(rpcIdKey(id), { method, timer, resolve, reject })
      try {
        this.write({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(rpcIdKey(id))
        reject(normalizeError(error))
      }
    })
  }

  private write(message: unknown): void {
    const stdin = this.child?.stdin
    if (!stdin || stdin.destroyed) throw new GrokAcpError('Grok ACP stdin is unavailable.')
    stdin.write(`${JSON.stringify(message)}\n`)
  }

  private async tryAdvertisedAuthentication(): Promise<void> {
    for (const methodId of this.authMethodIds) {
      try {
        await this.request('authenticate', { methodId })
      } catch {
        // Try the next advertised method; cached_token normally succeeds silently.
      }
    }
  }

  private ingestSessionState(result: JsonValue, fallbackSessionId?: string): void {
    const resultRecord = asRecord(result)
    const sessionId =
      readString(resultRecord, 'sessionId') ??
      readString(resultRecord, 'session_id') ??
      readPathString(resultRecord, ['_meta', 'sessionId']) ??
      readPathString(resultRecord, ['_meta', 'x.ai/sessionDetail', 'sessionId']) ??
      fallbackSessionId
    if (!sessionId) throw new GrokAcpError('Grok session did not return a session id.')
    this.sessionId = sessionId

    const models = parseModels(result)
    if (models.length > 0) this.models = models
    this.currentModelId =
      readPathString(resultRecord, ['models', 'currentModelId']) ??
      readString(resultRecord, 'currentModelId') ??
      readPathString(resultRecord, ['_meta', 'x.ai/sessionDetail', 'currentModelId']) ??
      this.currentModelId
  }

  private readyPayload(): GrokSessionReady {
    return {
      taskId: this.taskId,
      sessionId: this.requireSessionId(),
      cwd: this.cwd,
      models: this.models,
      currentModelId: this.currentModelId,
      capabilities: this.capabilities,
      agentVersion: this.agentVersion,
    }
  }

  private emitReady(): void {
    this.emit({
      type: 'ready',
      taskId: this.taskId,
      payload: this.readyPayload(),
      timestamp: Date.now(),
    })
    this.emitStatus('ready', 'Grok ACP session ready')
  }

  private emitPayload<TType extends 'message-delta' | 'thought-delta' | 'tool-started' | 'tool-updated' | 'plan' | 'context-usage'>(
    type: TType,
    payload: Extract<GrokAcpEvent, { type: TType }>['payload'],
  ): void {
    this.emit({ type, taskId: this.taskId, payload, timestamp: Date.now() } as GrokAcpEvent)
  }

  private emitStatus(status: Extract<GrokAcpEvent, { type: 'status' }>['payload']['status'], detail?: string): void {
    this.emit({
      type: 'status',
      taskId: this.taskId,
      payload: { status, detail },
      timestamp: Date.now(),
    })
  }

  private emitError(error: GrokAcpError): void {
    this.emit({
      type: 'error',
      taskId: this.taskId,
      payload: { message: error.message, code: error.code },
      timestamp: Date.now(),
    })
  }

  private emit(event: GrokAcpEvent): void {
    this.emitter.emit('event', event)
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private requireSessionId(): string {
    if (!this.sessionId) throw new GrokAcpError('Grok ACP session is not ready.')
    return this.sessionId
  }
}

export type ExtendedUpdateEvent =
  | { type: 'goal-updated'; payload: GoalState }
  | { type: 'subagent-updated'; payload: SubagentState }
  | { type: 'background-task-updated'; payload: BackgroundTaskState }

export function mapExtendedUpdate(
  update: Record<string, unknown>,
  sessionId: string,
  timestamp = Date.now()
): ExtendedUpdateEvent[] {
  const rawKind = firstString(update, 'sessionUpdate', 'session_update', 'type') ?? ''
  const kind = rawKind.replace(/([a-z])([A-Z])/g, '$1_$2').toLocaleLowerCase()
  const updatedAt = new Date(timestamp).toISOString()

  if (kind === 'goal_updated') {
    const objective = firstString(update, 'objective', 'title') ?? ''
    return [{
      type: 'goal-updated',
      payload: {
        id: firstString(update, 'goal_id', 'goalId'),
        objective,
        status: mapGoalStatus(firstString(update, 'status')),
        phase: firstString(update, 'phase'),
        elapsedMs: firstNumber(update, 'elapsed_ms', 'elapsedMs'),
        lastEvent: firstString(update, 'last_event', 'lastEvent'),
        message: firstString(update, 'message'),
        updatedAt
      }
    }]
  }

  if (
    kind === 'subagent_spawned' ||
    kind === 'subagent_progress' ||
    kind === 'subagent_finished'
  ) {
    const id = firstString(update, 'subagent_id', 'subagentId')
    if (!id) return []
    const phase = kind === 'subagent_spawned'
      ? 'spawned'
      : kind === 'subagent_progress'
        ? 'progress'
        : 'finished'
    const durationMs = firstNumber(update, 'duration_ms', 'durationMs')
    const turnCount = firstNumber(update, 'turns', 'turn_count', 'turnCount')
    const toolCallCount = firstNumber(
      update,
      'tool_calls',
      'tool_call_count',
      'toolCallCount'
    )
    const output = firstString(update, 'output')
    const error = firstString(update, 'error')
    const progressDescription = [
      turnCount === undefined ? undefined : `${turnCount} turns`,
      toolCallCount === undefined ? undefined : `${toolCallCount} tools`,
      durationMs === undefined ? undefined : `${Math.round(durationMs / 1_000)}s`
    ].filter(Boolean).join(' · ')
    return [{
      type: 'subagent-updated',
      payload: {
        id,
        parentSessionId:
          firstString(update, 'parent_session_id', 'parentSessionId') ?? sessionId,
        childSessionId:
          firstString(update, 'child_session_id', 'childSessionId') ?? id,
        type: firstString(update, 'subagent_type', 'subagentType'),
        description:
          firstString(update, 'description') ??
          error ??
          (output ? output.slice(0, 240) : undefined) ??
          (progressDescription || undefined),
        phase,
        status: firstString(update, 'status') ?? (phase === 'finished' ? 'completed' : 'working'),
        durationMs,
        turnCount,
        toolCallCount,
        tokensUsed: firstNumber(update, 'tokens_used', 'tokensUsed'),
        error,
        output,
        updatedAt
      }
    }]
  }

  if (kind === 'task_backgrounded') {
    const id = firstString(update, 'task_id', 'taskId')
    if (!id) return []
    const rawCommand = firstString(update, 'command')
    const monitorDescription = firstString(
      update,
      'monitor_description',
      'monitorDescription'
    )
    const isMonitor = Boolean(monitorDescription || rawCommand?.startsWith('[monitor] '))
    const command = isMonitor && rawCommand?.startsWith('[monitor] ')
      ? rawCommand.slice('[monitor] '.length)
      : rawCommand
    return [{
      type: 'background-task-updated',
      payload: {
        id,
        phase: 'backgrounded',
        command,
        description:
          firstString(update, 'description') ?? monitorDescription ?? command,
        cwd: firstString(update, 'cwd'),
        outputFile: firstString(update, 'output_file', 'outputFile'),
        toolCallId: firstString(update, 'tool_call_id', 'toolCallId'),
        isMonitor,
        updatedAt
      }
    }]
  }

  if (kind === 'task_completed') {
    const snapshot =
      asRecord(update.task_snapshot) ?? asRecord(update.taskSnapshot) ?? update
    const id =
      firstString(snapshot, 'task_id', 'taskId') ??
      firstString(update, 'task_id', 'taskId')
    if (!id) return []
    const exitCode = firstNumber(snapshot, 'exit_code', 'exitCode')
    const signal = firstString(snapshot, 'signal') ?? firstString(update, 'signal')
    const start = firstTime(snapshot, 'start_time', 'startTime')
    const end = firstTime(snapshot, 'end_time', 'endTime')
    const durationMs =
      start !== undefined && end !== undefined && end >= start ? end - start : undefined
    const command = firstString(
      snapshot,
      'display_command',
      'displayCommand',
      'command'
    ) ?? firstString(update, 'command')
    const output = firstString(snapshot, 'output')
    return [{
      type: 'background-task-updated',
      payload: {
        id,
        phase: 'completed',
        command,
        description: command,
        cwd: firstString(snapshot, 'cwd'),
        outputFile: firstString(snapshot, 'output_file', 'outputFile'),
        toolCallId: firstString(snapshot, 'tool_call_id', 'toolCallId'),
        isMonitor: firstString(snapshot, 'kind')?.toLocaleLowerCase() === 'monitor',
        exitCode: exitCode ?? null,
        signal,
        success: exitCode === 0 || (exitCode === undefined && !signal),
        willWake: Boolean(update.will_wake ?? update.willWake),
        durationMs,
        output: output?.slice(0, 4_000),
        staleOnLoad: signal === 'session_restart',
        updatedAt
      }
    }]
  }

  if (kind === 'monitor_event') {
    const id = firstString(update, 'task_id', 'taskId')
    if (!id) return []
    return [{
      type: 'background-task-updated',
      payload: {
        id,
        phase: 'monitor',
        description: firstString(update, 'description'),
        eventText: firstString(update, 'event_text', 'eventText'),
        isMonitor: true,
        updatedAt
      }
    }]
  }

  return []
}

function mapGoalStatus(value: string | undefined): GoalState['status'] {
  switch (value?.toLocaleLowerCase()) {
    case 'user_paused':
    case 'paused':
      return 'paused'
    case 'complete':
    case 'completed':
      return 'completed'
    case 'cleared':
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    case 'failed':
    case 'error':
      return 'error'
    default:
      return 'active'
  }
}

function firstString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

function firstNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return undefined
}

function firstTime(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
      return Date.parse(value)
    }
  }
  return undefined
}

function parseInitializeState(result: JsonValue): InitializeState {
  const record = asRecord(result)
  const agentCapabilities = asRecord(record?.agentCapabilities)
  const promptCapabilities = asRecord(agentCapabilities?.promptCapabilities)
  const authMethods = Array.isArray(record?.authMethods) ? record.authMethods : []
  return {
    capabilities: {
      loadSession: agentCapabilities?.loadSession === true,
      prompt: {
        image: promptCapabilities?.image === true,
        audio: promptCapabilities?.audio === true,
        embeddedContext: promptCapabilities?.embeddedContext === true,
      },
    },
    models: parseModels(result),
    currentModelId: readPathString(record, ['_meta', 'modelState', 'currentModelId']),
    agentVersion: readPathString(record, ['_meta', 'agentVersion']),
    authMethodIds: authMethods
      .map((method) => readString(asRecord(method), 'id'))
      .filter((id): id is string => Boolean(id)),
  }
}

export function parseModels(result: JsonValue): GrokModelOption[] {
  const record = asRecord(result)
  const candidates = [
    readPath(record, ['models', 'availableModels']),
    record?.availableModels,
    readPath(record, ['_meta', 'modelState', 'availableModels']),
  ]
  const raw = candidates.find(Array.isArray)
  if (!Array.isArray(raw)) return []

  return raw.flatMap((value): GrokModelOption[] => {
    const model = asRecord(value)
    const id = readString(model, 'modelId') ?? readString(model, 'id')
    if (!id) return []
    const metadata = asRecord(model?._meta)
    const efforts = Array.isArray(metadata?.reasoningEfforts)
      ? metadata.reasoningEfforts
          .map((effort) => readString(asRecord(effort), 'value') ?? readString(asRecord(effort), 'id'))
          .filter(isReasoningEffort)
      : undefined
    return [{
      id,
      name: readString(model, 'name') ?? id,
      description: readString(model, 'description'),
      contextWindow: readNumber(metadata, 'totalContextTokens'),
      supportsReasoningEffort: metadata?.supportsReasoningEffort === true,
      reasoningEfforts: efforts,
    }]
  })
}

export function mapPermissionRequest(requestId: string, params: JsonValue): GrokPermissionRequest {
  const record = asRecord(params)
  const toolCall = asRecord(record?.toolCall)
  const optionsValue = Array.isArray(record?.options)
    ? record.options
    : Array.isArray(record?.permissionOptions)
      ? record.permissionOptions
      : []
  const advertisedOptions = optionsValue.flatMap((value): GrokPermissionOption[] => {
    const option = asRecord(value)
    const optionId = readString(option, 'optionId') ?? readString(option, 'id')
    return optionId
      ? [{ optionId, name: readString(option, 'name'), kind: readString(option, 'kind') }]
      : []
  })
  const options = advertisedOptions.length > 0
    ? advertisedOptions
    : [
        { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'allow-always', name: 'Allow for this session', kind: 'allow_always' },
        { optionId: 'reject-once', name: 'Deny', kind: 'reject_once' },
      ]
  const rawInput = toolCall?.rawInput ?? record?.description
  return {
    requestId,
    sessionId: readString(record, 'sessionId'),
    toolCallId: readString(toolCall, 'toolCallId') ?? readString(toolCall, 'id'),
    toolName:
      readString(toolCall, 'title') ??
      readString(toolCall, 'kind') ??
      readString(record, 'toolName') ??
      'Tool',
    summary:
      readString(toolCall, 'title') ??
      readString(record, 'summary') ??
      'Grok requests permission',
    detail: typeof rawInput === 'string' ? rawInput : rawInput === undefined ? undefined : JSON.stringify(rawInput),
    options,
  }
}

function optionIdForDecision(
  decision: GrokPermissionDecision | undefined,
  options: GrokPermissionOption[],
): string | undefined {
  if (!decision) return undefined
  const preferred = decision === 'allow-once'
    ? ['allow-once', 'allow_once']
    : decision === 'allow-session'
      ? ['allow-always', 'allow-session', 'allow_always']
      : ['reject-once', 'deny', 'reject_once']
  const matching = options.find((option) => {
    const values = [option.optionId, option.kind].filter(Boolean).map((value) => value!.toLowerCase())
    return preferred.some((candidate) => values.includes(candidate))
  })
  return matching?.optionId ?? preferred[0]
}

function mapTool(update: Record<string, unknown>, isUpdate: boolean): GrokToolActivity {
  return {
    id: readString(update, 'toolCallId') ?? readString(update, 'tool_call_id') ?? randomUUID(),
    title: readString(update, 'title') ?? 'Tool',
    kind: readString(update, 'kind') ?? 'other',
    status: mapToolStatus(readString(update, 'status'), isUpdate),
    input: toJsonValue(update.rawInput ?? update.input),
    output: extractToolOutput(update),
  }
}

function mapToolStatus(status: string | undefined, isUpdate: boolean): GrokToolStatus {
  switch (status) {
    case 'pending': return 'pending'
    case 'completed':
    case 'success': return 'completed'
    case 'failed':
    case 'error': return 'failed'
    case 'cancelled':
    case 'canceled': return 'cancelled'
    default: return isUpdate ? 'running' : 'running'
  }
}

function mapPlan(update: Record<string, unknown>): string[] {
  if (!Array.isArray(update.entries)) return []
  return update.entries
    .map((entry) => {
      const record = asRecord(entry)
      return readString(record, 'content') ?? readString(record, 'title')
    })
    .filter((step): step is string => Boolean(step))
}

function extractText(update: Record<string, unknown>): string | undefined {
  if (typeof update.content === 'string') return update.content
  return readString(asRecord(update.content), 'text') ?? readString(update, 'text')
}

function extractToolOutput(update: Record<string, unknown>): string | undefined {
  if (update.rawOutput !== undefined) {
    return typeof update.rawOutput === 'string' ? update.rawOutput : JSON.stringify(update.rawOutput)
  }
  if (!Array.isArray(update.content)) return undefined
  for (const item of update.content) {
    const record = asRecord(item)
    const text = readString(record, 'text') ?? readString(asRecord(record?.content), 'text')
    if (text) return text
  }
  return undefined
}

function findTotalTokens(
  update: Record<string, unknown>,
  params: Record<string, unknown> | undefined,
): number | undefined {
  const metadata = [
    asRecord(update._meta),
    asRecord(update.meta),
    asRecord(params?._meta),
    asRecord(params?.meta),
  ]
  for (const item of metadata) {
    const value = readNumber(item, 'totalTokens') ?? readNumber(item, 'total_tokens')
    if (value !== undefined) return value
  }
  return undefined
}

function isAuthenticationError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('auth')
}

function normalizeError(error: unknown): GrokAcpError {
  return error instanceof GrokAcpError
    ? error
    : new GrokAcpError(error instanceof Error ? error.message : String(error), { cause: error })
}

function isReasoningEffort(value: string | undefined): value is GrokReasoningEffort {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'max'
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

function readNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readPath(record: Record<string, unknown> | undefined, path: string[]): unknown {
  let current: unknown = record
  for (const segment of path) current = asRecord(current)?.[segment]
  return current
}

function readPathString(record: Record<string, unknown> | undefined, path: string[]): string | undefined {
  const value = readPath(record, path)
  return typeof value === 'string' ? value : undefined
}

function toJsonValue(value: unknown): JsonValue | undefined {
  return value === undefined ? undefined : value as JsonValue
}
