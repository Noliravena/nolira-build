import type {
  BackgroundTaskState,
  GoalState,
  SubagentState
} from './models'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type GrokPermissionMode = 'ask' | 'auto-approve'
export type GrokReasoningEffort = 'low' | 'medium' | 'high' | 'max'
export type GrokPermissionDecision = 'allow-once' | 'allow-session' | 'deny'

export interface GrokClientInfo {
  name: string
  version: string
}

export interface GrokConnectRequest {
  taskId: string
  cwd: string
  executablePath?: string
  model?: string
  permissionMode?: GrokPermissionMode
  existingSessionId?: string
  clientInfo?: GrokClientInfo
  rules?: string
  systemPromptOverride?: string
  mcpServers?: GrokMcpServerConfig[]
}

export interface GrokMcpServerConfig {
  name: string
  command: string
  args: string[]
}

export interface GrokPromptAttachment {
  path: string
  name?: string
  mimeType?: string
}

export interface GrokPromptRequest {
  taskId: string
  text: string
  attachments?: GrokPromptAttachment[]
  model?: string
  effort?: GrokReasoningEffort
}

export interface GrokCancelRequest {
  taskId: string
}

export interface GrokPermissionResponse {
  taskId?: string
  requestId: string
  decision?: GrokPermissionDecision
  /** Pass an advertised ACP option id verbatim when the UI renders server options. */
  optionId?: string
}

export interface GrokModelOption {
  id: string
  name: string
  description?: string
  contextWindow?: number
  supportsReasoningEffort?: boolean
  reasoningEfforts?: GrokReasoningEffort[]
}

export interface GrokPromptCapabilities {
  image: boolean
  audio: boolean
  embeddedContext: boolean
}

export interface GrokAgentCapabilities {
  loadSession: boolean
  prompt: GrokPromptCapabilities
}

export interface GrokSessionReady {
  taskId: string
  sessionId: string
  cwd: string
  models: GrokModelOption[]
  currentModelId?: string
  capabilities: GrokAgentCapabilities
  agentVersion?: string
}

export type GrokToolStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface GrokToolActivity {
  id: string
  title: string
  kind: string
  status: GrokToolStatus
  input?: JsonValue
  output?: string
}

export interface GrokPermissionOption {
  optionId: string
  name?: string
  kind?: string
}

export interface GrokPermissionRequest {
  requestId: string
  sessionId?: string
  toolCallId?: string
  toolName: string
  summary: string
  detail?: string
  options: GrokPermissionOption[]
}

export interface GrokPromptResult {
  stopReason?: string
  raw: JsonValue
}

export type GrokConnectionStatus =
  | 'starting'
  | 'ready'
  | 'busy'
  | 'waiting-permission'
  | 'stopped'
  | 'error'

interface GrokEventBase<TType extends string, TPayload> {
  type: TType
  taskId: string
  payload: TPayload
  timestamp: number
}

export type GrokAcpEvent =
  | GrokEventBase<
      'status',
      { status: GrokConnectionStatus; detail?: string }
    >
  | GrokEventBase<'ready', GrokSessionReady>
  | GrokEventBase<'message-delta', { text: string }>
  | GrokEventBase<'thought-delta', { text: string }>
  | GrokEventBase<'tool-started', { tool: GrokToolActivity }>
  | GrokEventBase<'tool-updated', { tool: GrokToolActivity }>
  | GrokEventBase<'plan', { steps: string[] }>
  | GrokEventBase<'context-usage', { usedTokens: number }>
  | GrokEventBase<'goal-updated', GoalState>
  | GrokEventBase<'subagent-updated', SubagentState>
  | GrokEventBase<'background-task-updated', BackgroundTaskState>
  | GrokEventBase<'permission-request', GrokPermissionRequest>
  | GrokEventBase<'completed', GrokPromptResult>
  | GrokEventBase<'cancelled', Record<string, never>>
  | GrokEventBase<'stderr', { line: string }>
  | GrokEventBase<'notification', { method: string; params: JsonValue }>
  | GrokEventBase<'error', { message: string; code?: number }>

export type GrokAcpEventListener = (event: GrokAcpEvent) => void
