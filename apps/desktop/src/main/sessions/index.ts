import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline'

import type {
  SessionExportResult,
  SessionHistoryPage,
  SessionListParams,
  SessionSummary
} from '../../shared/host-api'
import type { MessagePart, Project } from '../../shared/models'
import type { MessageRecord } from '../store'

type JsonRecord = Record<string, unknown>

type IndexedSession = SessionSummary & {
  directory: string
  historyPath: string
}

interface SessionMetadata {
  title?: string
  archived?: boolean
  pinned?: boolean
  updatedAt: string
}

interface MetadataFile {
  version: 1
  sessions: Record<string, SessionMetadata>
}

export interface SessionIndexOptions {
  metadataPath: string
  grokHome?: string
}

const EMPTY_METADATA: MetadataFile = { version: 1, sessions: {} }
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/

export function resolveGrokHome(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = homedir()
): string {
  return resolve(environment.GROK_HOME || join(homeDirectory, '.grok'))
}

export class SessionIndexService {
  private readonly metadataPath: string
  private readonly sessionsRoot: string
  private metadata: MetadataFile = structuredClone(EMPTY_METADATA)
  private metadataLoaded = false
  private sessions = new Map<string, IndexedSession>()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(options: SessionIndexOptions) {
    this.metadataPath = resolve(options.metadataPath)
    this.sessionsRoot = join(
      resolve(options.grokHome ?? resolveGrokHome()),
      'sessions'
    )
  }

  async refresh(projects: Project[]): Promise<SessionSummary[]> {
    await this.loadMetadata()
    const summaryPaths = await findSummaryFiles(this.sessionsRoot)
    const next = new Map<string, IndexedSession>()

    await Promise.all(
      summaryPaths.map(async (summaryPath) => {
        const session = await this.readSummary(summaryPath, projects)
        if (session) next.set(session.sessionId, session)
      })
    )

    this.sessions = next
    return this.list({})
  }

  list(params: SessionListParams): SessionSummary[] {
    const query = params.query?.trim().toLocaleLowerCase()
    const requestedLimit = params.limit ?? 200
    const limit = Math.max(1, Math.min(1_000, requestedLimit))

    return [...this.sessions.values()]
      .filter((session) => !params.projectId || session.projectId === params.projectId)
      .filter((session) => params.includeArchived || !session.archived)
      .filter((session) => {
        if (!query) return true
        return [session.title, session.cwd, session.model, session.sessionId]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => value.toLocaleLowerCase().includes(query))
      })
      .sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      })
      .slice(0, limit)
      .map(stripPrivateFields)
  }

  get(sessionId: string): SessionSummary | undefined {
    const session = this.sessions.get(sessionId)
    return session ? stripPrivateFields(session) : undefined
  }

  async loadHistory(sessionId: string, taskId = sessionId): Promise<SessionHistoryPage> {
    const session = this.requireSession(sessionId)
    const messages = await parseChatHistory(
      session.historyPath,
      taskId,
      session.createdAt
    )
    return { sessionId, messages, total: messages.length }
  }

  async rename(sessionId: string, title: string): Promise<SessionSummary> {
    const session = this.requireSession(sessionId)
    const normalized = cleanTitle(title, '')
    if (!normalized) throw new Error('Session title cannot be empty.')

    const metadata = this.metadata.sessions[sessionId] ?? {
      updatedAt: new Date().toISOString()
    }
    metadata.title = normalized
    metadata.updatedAt = new Date().toISOString()
    this.metadata.sessions[sessionId] = metadata
    session.title = normalized
    await this.persistMetadata()
    return stripPrivateFields(session)
  }

  async archive(sessionId: string, archived: boolean): Promise<SessionSummary> {
    const session = this.requireSession(sessionId)
    const metadata = this.metadata.sessions[sessionId] ?? {
      updatedAt: new Date().toISOString()
    }
    metadata.archived = archived
    metadata.updatedAt = new Date().toISOString()
    this.metadata.sessions[sessionId] = metadata
    session.archived = archived
    await this.persistMetadata()
    return stripPrivateFields(session)
  }

  async exportMarkdown(sessionId: string): Promise<SessionExportResult> {
    const session = this.requireSession(sessionId)
    const history = await this.loadHistory(sessionId)
    const lines = [
      `# ${session.title}`,
      '',
      `- Workspace: \`${session.cwd}\``,
      `- Session: \`${session.sessionId}\``,
      ...(session.model ? [`- Model: \`${session.model}\``] : []),
      `- Updated: ${session.updatedAt}`,
      ''
    ]

    for (const message of history.messages) {
      lines.push(message.role === 'user' ? '## User' : '## Assistant', '')
      for (const part of message.parts) appendPartMarkdown(lines, part)
      lines.push('')
    }

    return {
      markdown: `${lines.join('\n').trim()}\n`,
      suggestedName: `${fileSafeName(session.title) || 'grok-session'}.md`
    }
  }

  private requireSession(sessionId: string): IndexedSession {
    if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error('Invalid session id.')
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session does not exist in an approved workspace.')
    return session
  }

  private async readSummary(
    summaryPath: string,
    projects: Project[]
  ): Promise<IndexedSession | undefined> {
    try {
      const decoded: unknown = JSON.parse(await readFile(summaryPath, 'utf8'))
      if (!isRecord(decoded)) return undefined
      const info = isRecord(decoded.info) ? decoded.info : {}
      const directory = dirname(summaryPath)
      const directoryId = basename(directory)
      const sessionId = stringValue(info.id) ?? directoryId
      const cwdValue = stringValue(info.cwd)
      if (!SESSION_ID_PATTERN.test(sessionId) || !cwdValue || !isAbsolute(cwdValue)) {
        return undefined
      }

      const cwd = resolve(cwdValue)
      const project = findOwningProject(cwd, projects)
      if (!project) return undefined

      const createdAt = validIsoDate(decoded.created_at) ?? new Date(0).toISOString()
      const updatedAt =
        validIsoDate(decoded.last_active_at) ??
        validIsoDate(decoded.updated_at) ??
        createdAt
      const metadata = this.metadata.sessions[sessionId]
      const generatedTitle = stringValue(decoded.generated_title)
      const summaryTitle = stringValue(decoded.session_summary)

      return {
        sessionId,
        projectId: project.id,
        cwd,
        title:
          metadata?.title ??
          cleanTitle(generatedTitle ?? summaryTitle ?? '', `Session ${sessionId.slice(0, 8)}`),
        model: stringValue(decoded.current_model_id),
        messageCount: finiteInteger(decoded.num_chat_messages),
        createdAt,
        updatedAt,
        archived: metadata?.archived ?? false,
        pinned: metadata?.pinned ?? false,
        source: 'grok',
        directory,
        historyPath: join(directory, 'chat_history.jsonl')
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Unable to index Grok session summary: ${summaryPath}`, error)
      }
      return undefined
    }
  }

  private async loadMetadata(): Promise<void> {
    if (this.metadataLoaded) return
    this.metadataLoaded = true
    try {
      const decoded: unknown = JSON.parse(await readFile(this.metadataPath, 'utf8'))
      if (!isRecord(decoded) || !isRecord(decoded.sessions)) return
      this.metadata = {
        version: 1,
        sessions: decoded.sessions as Record<string, SessionMetadata>
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Unable to load session metadata.', error)
      }
    }
  }

  private async persistMetadata(): Promise<void> {
    const payload = JSON.stringify(this.metadata, null, 2)
    const temporaryPath = `${this.metadataPath}.next`
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.metadataPath), { recursive: true })
      await writeFile(temporaryPath, payload, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.metadataPath)
    })
    return this.writeQueue
  }
}

async function findSummaryFiles(root: string): Promise<string[]> {
  const results: string[] = []

  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > 3) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Unable to scan Grok sessions: ${directory}`, error)
      }
      return
    }

    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isSymbolicLink()) return
        const path = join(directory, entry.name)
        if (entry.isFile() && entry.name === 'summary.json') results.push(path)
        if (entry.isDirectory()) await visit(path, depth + 1)
      })
    )
  }

  await visit(root, 0)
  return results
}

function findOwningProject(cwd: string, projects: Project[]): Project | undefined {
  return projects
    .filter((project) => containsPath(project.path, cwd))
    .sort((left, right) => resolve(right.path).length - resolve(left.path).length)[0]
}

function containsPath(parent: string, candidate: string): boolean {
  const distance = relative(resolve(parent), resolve(candidate))
  return distance === '' || (!distance.startsWith('..') && !isAbsolute(distance))
}

function stripPrivateFields(session: IndexedSession): SessionSummary {
  const { directory: _directory, historyPath: _historyPath, ...summary } = session
  return structuredClone(summary)
}

async function parseChatHistory(
  historyPath: string,
  taskId: string,
  createdAt: string
): Promise<MessageRecord[]> {
  const messages: MessageRecord[] = []
  const toolParts = new Map<string, Extract<MessagePart, { type: 'tool' }>>()
  const baseTime = Number.isFinite(Date.parse(createdAt)) ? Date.parse(createdAt) : 0
  let currentAssistant: MessageRecord | undefined
  let recordIndex = 0

  function timestamp(): string {
    return new Date(baseTime + recordIndex).toISOString()
  }

  function assistantMessage(): MessageRecord {
    if (currentAssistant) return currentAssistant
    currentAssistant = {
      id: `${taskId}:assistant:${recordIndex}`,
      taskId,
      role: 'assistant',
      parts: [],
      createdAt: timestamp()
    }
    messages.push(currentAssistant)
    return currentAssistant
  }

  let input
  try {
    input = createReadStream(historyPath, { encoding: 'utf8' })
    const lines = createInterface({ input, crlfDelay: Infinity })
    for await (const line of lines) {
      recordIndex += 1
      if (!line.trim()) continue
      let decoded: unknown
      try {
        decoded = JSON.parse(line)
      } catch {
        continue
      }
      if (!isRecord(decoded)) continue

      const type = stringValue(decoded.type)
      if (type === 'user') {
        const text = readableContent(decoded.content)
        if (!text) continue
        currentAssistant = undefined
        messages.push({
          id: `${taskId}:user:${recordIndex}`,
          taskId,
          role: 'user',
          parts: [{ id: `${taskId}:text:${recordIndex}`, type: 'text', text }],
          createdAt: timestamp()
        })
        continue
      }

      if (type === 'reasoning') {
        const text = readableContent(decoded.summary)
        if (!text) continue
        assistantMessage().parts.push({
          id: `${taskId}:thinking:${recordIndex}`,
          type: 'thinking',
          text,
          status: 'complete'
        })
        continue
      }

      if (type === 'assistant') {
        const text = readableContent(decoded.content)
        if (text) {
          assistantMessage().parts.push({
            id: `${taskId}:text:${recordIndex}`,
            type: 'text',
            text
          })
        }
        if (Array.isArray(decoded.tool_calls)) {
          for (const value of decoded.tool_calls) {
            if (!isRecord(value)) continue
            const nested = isRecord(value.function) ? value.function : undefined
            const toolId =
              stringValue(value.id) ??
              stringValue(value.tool_call_id) ??
              `${taskId}:tool-call:${recordIndex}:${toolParts.size}`
            const name =
              stringValue(value.name) ??
              stringValue(nested?.name) ??
              'Tool'
            const part: Extract<MessagePart, { type: 'tool' }> = {
              id: `${taskId}:tool:${toolId}`,
              type: 'tool',
              title: humanize(name),
              kind: name,
              status: 'running',
              input: readableToolArguments(value.arguments ?? nested?.arguments)
            }
            const existing = toolParts.get(toolId)
            if (existing) {
              existing.title = part.title
              existing.kind = part.kind
              existing.status = part.status
              existing.input = part.input ?? existing.input
            } else {
              assistantMessage().parts.push(part)
              toolParts.set(toolId, part)
            }
          }
        }
        continue
      }

      if (type === 'backend_tool_call' && isRecord(decoded.kind)) {
        const kind = decoded.kind
        const toolId =
          stringValue(kind.id) ??
          stringValue(kind.call_id) ??
          `${taskId}:tool-call:${recordIndex}`
        const status = toolStatus(kind.status)
        const action = isRecord(kind.action) ? kind.action : undefined
        const title =
          stringValue(kind.name) ??
          stringValue(kind.tool_type) ??
          stringValue(action?.type) ??
          'Tool'
        const part: Extract<MessagePart, { type: 'tool' }> = {
          id: `${taskId}:tool:${toolId}`,
          type: 'tool',
          title: humanize(title),
          kind: stringValue(kind.tool_type) ?? stringValue(kind.name),
          status,
          input: readableToolValue(kind.input ?? kind.action)
        }
        const existing = toolParts.get(toolId)
        if (existing) {
          existing.title = part.title
          existing.kind = part.kind ?? existing.kind
          existing.status = part.status
          existing.input = part.input ?? existing.input
        } else {
          assistantMessage().parts.push(part)
          toolParts.set(toolId, part)
        }
        continue
      }

      if (type === 'tool_result') {
        const toolId = stringValue(decoded.tool_call_id)
        const output = readableToolValue(decoded.content)
        const part = toolId ? toolParts.get(toolId) : undefined
        if (part) {
          part.output = output
          part.status =
            decoded.is_error === true ||
            ['error', 'failed'].includes(
              stringValue(decoded.status)?.toLocaleLowerCase() ?? ''
            )
              ? 'error'
              : 'success'
        } else if (output) {
          assistantMessage().parts.push({
            id: `${taskId}:tool-result:${recordIndex}`,
            type: 'tool',
            title: 'Tool result',
            status: 'success',
            output
          })
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  } finally {
    input?.close()
  }

  return messages.filter((message) => message.parts.length > 0)
}

function appendPartMarkdown(lines: string[], part: MessagePart): void {
  if (part.type === 'text') {
    lines.push(part.text, '')
    return
  }
  if (part.type === 'thinking') {
    lines.push('<details>', '<summary>Reasoning</summary>', '', part.text, '', '</details>', '')
    return
  }
  if (part.type === 'error') {
    lines.push(`> **${part.title ?? 'Error'}:** ${part.text}`, '')
    return
  }

  lines.push(`### ${part.title}`)
  if (part.input) lines.push('', '**Input**', '', fenced(part.input))
  if (part.output) lines.push('', '**Output**', '', fenced(part.output))
  lines.push('')
}

function fenced(value: string): string {
  const fence = value.includes('```') ? '````' : '```'
  return `${fence}\n${value}\n${fence}`
}

function readableContent(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (!isRecord(entry)) return ''
        const text = stringValue(entry.text) ?? stringValue(entry.content)
        if (text) return text
        const type = stringValue(entry.type)
        return type?.includes('image') ? '[Image]' : ''
      })
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }
  if (isRecord(value)) {
    return stringValue(value.text) ?? stringValue(value.content) ?? ''
  }
  return ''
}

function readableToolValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const text = readableContent(value)
  if (text) return truncate(text, 200_000)
  try {
    return truncate(JSON.stringify(value, null, 2), 200_000)
  } catch {
    return String(value)
  }
}

function readableToolArguments(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return truncate(value, 200_000)
  try {
    return truncate(JSON.stringify(value, null, 2), 200_000)
  } catch {
    return truncate(String(value), 200_000)
  }
}

function toolStatus(value: unknown): 'pending' | 'running' | 'success' | 'error' {
  const status = stringValue(value)?.toLocaleLowerCase()
  if (status === 'completed' || status === 'success' || status === 'succeeded') {
    return 'success'
  }
  if (status === 'failed' || status === 'error') return 'error'
  if (status === 'running' || status === 'in_progress') return 'running'
  return 'pending'
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function cleanTitle(value: string, fallback: string): string {
  const [firstLine = ''] = value.trim().split(/\r?\n/, 1)
  const normalized = firstLine.replace(/\s+/g, ' ')
  return normalized ? normalized.slice(0, 160) : fallback
}

function fileSafeName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}\n… truncated …`
}

function finiteInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0
}

function validIsoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return undefined
  return new Date(Date.parse(value)).toISOString()
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
