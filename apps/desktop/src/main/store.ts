import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'

import type { SessionSummary } from '../shared/host-api'

export type TaskStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'error'

export type MessageRole = 'user' | 'assistant' | 'system'
export type EffortLevel = 'low' | 'medium' | 'high' | 'max'
export type PermissionMode = 'default' | 'accept-edits' | 'full-access'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface ProjectRecord {
  id: string
  name: string
  path: string
  createdAt: string
  updatedAt: string
}

export interface AttachmentRecord {
  id?: string
  name: string
  path?: string
  mimeType?: string
  size?: number
  dataUrl?: string
}

export type MessagePartRecord =
  | { id: string; type: 'text'; text: string }
  | {
      id: string
      type: 'thinking'
      text: string
      status?: 'streaming' | 'complete'
    }
  | {
      id: string
      type: 'tool'
      title: string
      kind?: string
      status: 'pending' | 'running' | 'success' | 'error'
      description?: string
      input?: string
      output?: string
      startedAt?: string
      completedAt?: string
    }
  | { id: string; type: 'error'; title?: string; text: string }

export interface MessageRecord {
  id: string
  taskId: string
  role: MessageRole
  parts: MessagePartRecord[]
  attachments?: AttachmentRecord[]
  createdAt: string
  streaming?: boolean
}

export interface TaskRecord {
  id: string
  projectId: string
  title: string
  status: TaskStatus
  messages: MessageRecord[]
  sessionId?: string
  sessionSource?: 'desktop' | 'grok'
  sessionDirectory?: string
  parentSessionId?: string
  sessionKind?: string
  automationId?: string
  archived?: boolean
  pinned?: boolean
  model?: string
  effort?: EffortLevel
  permissionMode?: PermissionMode
  plan?: string[]
  contextTokens?: number
  goal?: {
    id?: string
    objective: string
    status: 'active' | 'paused' | 'completed' | 'cancelled' | 'error'
    phase?: string
    elapsedMs?: number
    lastEvent?: string
    message?: string
    updatedAt: string
  }
  subagents?: Array<{
    id: string
    parentSessionId?: string
    childSessionId?: string
    type?: string
    description?: string
    phase: 'spawned' | 'progress' | 'finished'
    status: string
    durationMs?: number
    turnCount?: number
    toolCallCount?: number
    tokensUsed?: number
    error?: string
    output?: string
    updatedAt: string
  }>
  backgroundTasks?: Array<{
    id: string
    phase: 'backgrounded' | 'completed' | 'monitor'
    command?: string
    description?: string
    cwd?: string
    outputFile?: string
    toolCallId?: string
    isMonitor?: boolean
    exitCode?: number | null
    signal?: string
    success?: boolean
    willWake?: boolean
    durationMs?: number
    output?: string
    eventText?: string
    staleOnLoad?: boolean
    updatedAt: string
  }>
  error?: string
  createdAt: string
  updatedAt: string
}

export interface InboxRecord {
  id: string
  sourceId?: string
  taskId?: string
  sessionId?: string
  type: 'permission' | 'background_task' | 'monitor' | 'error' | 'automation'
  title: string
  body?: string
  read: boolean
  createdAt: string
}

export interface AppSettingsRecord {
  grokPath: string
  defaultModel: string
  defaultEffort: EffortLevel
  defaultPermissionMode: PermissionMode
  theme: ThemeMode
  showActivityPanel: boolean
  notifications: boolean
}

interface PersistedState {
  version: 1
  projects: ProjectRecord[]
  tasks: TaskRecord[]
  settings: AppSettingsRecord
  inbox: InboxRecord[]
  selectedTaskId?: string
}

const DEFAULT_SETTINGS: AppSettingsRecord = {
  grokPath: '',
  defaultModel: 'grok-4.5',
  defaultEffort: 'high',
  defaultPermissionMode: 'default',
  theme: 'dark',
  showActivityPanel: false,
  notifications: true
}

const EMPTY_STATE: PersistedState = {
  version: 1,
  projects: [],
  tasks: [],
  inbox: [],
  settings: DEFAULT_SETTINGS
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function cleanText(value: string, fallback: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length > 0 ? normalized.slice(0, 160) : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class DesktopStore {
  private state: PersistedState = clone(EMPTY_STATE)
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })

    try {
      const decoded: unknown = JSON.parse(await readFile(this.filePath, 'utf8'))
      if (!isRecord(decoded)) return

      this.state = {
        version: 1,
        projects: Array.isArray(decoded.projects)
          ? (decoded.projects as ProjectRecord[])
          : [],
        tasks: Array.isArray(decoded.tasks)
          ? (decoded.tasks as TaskRecord[]).map((task) => ({
              ...task,
              messages:
                task.sessionSource === 'grok' || !Array.isArray(task.messages)
                  ? []
                  : task.messages
            }))
          : [],
        settings: {
          ...DEFAULT_SETTINGS,
          ...(isRecord(decoded.settings)
            ? (decoded.settings as Partial<AppSettingsRecord>)
            : {})
        },
        inbox: Array.isArray(decoded.inbox)
          ? (decoded.inbox as InboxRecord[])
          : [],
        selectedTaskId:
          typeof decoded.selectedTaskId === 'string'
            ? decoded.selectedTaskId
            : undefined
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        console.warn('Unable to load desktop state; starting with a clean state.', error)
      }
    }
  }

  snapshot(): Omit<PersistedState, 'version' | 'selectedTaskId'> & {
    activeTaskId?: string
  } {
    return {
      projects: clone(this.state.projects),
      tasks: clone(this.state.tasks),
      settings: clone(this.state.settings),
      inbox: clone(this.state.inbox),
      activeTaskId: this.state.selectedTaskId
    }
  }

  listProjects(): ProjectRecord[] {
    return clone(this.state.projects)
  }

  listTasks(projectId?: string): TaskRecord[] {
    return clone(
      projectId
        ? this.state.tasks.filter((task) => task.projectId === projectId)
        : this.state.tasks
    )
  }

  getProject(projectId: string): ProjectRecord | undefined {
    const project = this.state.projects.find((entry) => entry.id === projectId)
    return project ? clone(project) : undefined
  }

  getTask(taskId: string): TaskRecord | undefined {
    const task = this.state.tasks.find((entry) => entry.id === taskId)
    return task ? clone(task) : undefined
  }

  findTaskBySessionId(sessionId: string): TaskRecord | undefined {
    const task = this.state.tasks.find((entry) => entry.sessionId === sessionId)
    return task ? clone(task) : undefined
  }

  async syncIndexedSessions(sessions: SessionSummary[]): Promise<TaskRecord[]> {
    const indexed: TaskRecord[] = []

    for (const session of sessions) {
      const existing = this.state.tasks.find(
        (entry) => entry.sessionId === session.sessionId
      )
      if (existing) {
        if (existing.sessionSource === 'grok') existing.title = session.title
        existing.sessionSource ??= 'desktop'
        existing.model = session.model ?? existing.model
        existing.archived = session.archived
        existing.pinned = session.pinned
        existing.updatedAt = session.updatedAt
        indexed.push(existing)
        continue
      }

      const task: TaskRecord = {
        id: randomUUID(),
        projectId: session.projectId,
        title: session.title,
        status: 'idle',
        messages: [],
        sessionId: session.sessionId,
        sessionSource: 'grok',
        archived: session.archived,
        pinned: session.pinned,
        model: session.model ?? this.state.settings.defaultModel,
        effort: this.state.settings.defaultEffort,
        permissionMode: this.state.settings.defaultPermissionMode,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
      this.state.tasks.push(task)
      indexed.push(task)
    }

    this.state.tasks.sort((left, right) => {
      if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    })
    await this.persist()
    return clone(indexed)
  }

  async replaceMessages(
    taskId: string,
    messages: MessageRecord[]
  ): Promise<TaskRecord> {
    const task = this.requireTask(taskId)
    task.messages = clone(messages)
    return clone(task)
  }

  async createProject(input: { path: string; name?: string }): Promise<ProjectRecord> {
    const workspacePath = resolve(input.path)
    if (!isAbsolute(workspacePath)) throw new Error('Workspace path must be absolute.')

    const existing = this.state.projects.find(
      (entry) => resolve(entry.path) === workspacePath
    )
    if (existing) return clone(existing)

    const timestamp = new Date().toISOString()
    const project: ProjectRecord = {
      id: randomUUID(),
      name: cleanText(input.name ?? basename(workspacePath), 'Workspace'),
      path: workspacePath,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    this.state.projects.unshift(project)
    await this.persist()
    return clone(project)
  }

  async createTask(input: {
    projectId: string
    title?: string
    select?: boolean
  }): Promise<TaskRecord> {
    if (!this.state.projects.some((project) => project.id === input.projectId)) {
      throw new Error('Project does not exist.')
    }

    const timestamp = new Date().toISOString()
    const task: TaskRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      title: cleanText(input.title ?? '', 'New task'),
      status: 'idle',
      messages: [],
      model: this.state.settings.defaultModel,
      effort: this.state.settings.defaultEffort,
      permissionMode: this.state.settings.defaultPermissionMode,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    this.state.tasks.unshift(task)
    if (input.select !== false) this.state.selectedTaskId = task.id
    await this.persist()
    return clone(task)
  }

  async selectTask(taskId: string): Promise<TaskRecord> {
    const task = this.requireTask(taskId)
    this.state.selectedTaskId = task.id
    await this.persist()
    return clone(task)
  }

  async updateTask(
    taskId: string,
    patch: Partial<Omit<TaskRecord, 'id' | 'projectId' | 'createdAt'>>
  ): Promise<TaskRecord> {
    const task = this.requireTask(taskId)
    Object.assign(task, patch, { updatedAt: new Date().toISOString() })
    await this.persist()
    return clone(task)
  }

  async appendMessage(taskId: string, message: MessageRecord): Promise<TaskRecord> {
    const task = this.requireTask(taskId)
    task.messages.push(clone(message))
    task.updatedAt = new Date().toISOString()
    await this.persist()
    return clone(task)
  }

  async updateMessage(
    taskId: string,
    messageId: string,
    updater: (message: MessageRecord) => void
  ): Promise<MessageRecord> {
    const task = this.requireTask(taskId)
    const message = task.messages.find((entry) => entry.id === messageId)
    if (!message) throw new Error('Message does not exist.')
    updater(message)
    task.updatedAt = new Date().toISOString()
    await this.persist()
    return clone(message)
  }

  getSettings(): AppSettingsRecord {
    return clone(this.state.settings)
  }

  listInbox(): InboxRecord[] {
    return clone(this.state.inbox)
  }

  async addInbox(
    input: Omit<InboxRecord, 'id' | 'read' | 'createdAt'> & {
      createdAt?: string
    }
  ): Promise<InboxRecord[]> {
    const existing = input.sourceId
      ? this.state.inbox.find((item) => item.sourceId === input.sourceId)
      : undefined
    if (existing) {
      Object.assign(existing, input, { read: false })
    } else {
      this.state.inbox.unshift({
        ...input,
        id: randomUUID(),
        read: false,
        createdAt: input.createdAt ?? new Date().toISOString()
      })
      this.state.inbox = this.state.inbox.slice(0, 500)
    }
    await this.persist()
    return this.listInbox()
  }

  async markInboxRead(id: string, read = true): Promise<InboxRecord[]> {
    const item = this.state.inbox.find((entry) => entry.id === id)
    if (!item) throw new Error('Inbox item does not exist.')
    item.read = read
    await this.persist()
    return this.listInbox()
  }

  async markAllInboxRead(): Promise<InboxRecord[]> {
    for (const item of this.state.inbox) item.read = true
    await this.persist()
    return this.listInbox()
  }

  async dismissInbox(id: string): Promise<InboxRecord[]> {
    const index = this.state.inbox.findIndex((entry) => entry.id === id)
    if (index < 0) throw new Error('Inbox item does not exist.')
    this.state.inbox.splice(index, 1)
    await this.persist()
    return this.listInbox()
  }

  async dismissInboxBySource(sourceId: string): Promise<InboxRecord[]> {
    const next = this.state.inbox.filter((entry) => entry.sourceId !== sourceId)
    if (next.length === this.state.inbox.length) return this.listInbox()
    this.state.inbox = next
    await this.persist()
    return this.listInbox()
  }

  async updateSettings(
    patch: Partial<AppSettingsRecord>
  ): Promise<AppSettingsRecord> {
    this.state.settings = { ...this.state.settings, ...patch }
    await this.persist()
    return clone(this.state.settings)
  }

  isAllowedPath(candidate: string): boolean {
    if (!isAbsolute(candidate)) return false
    const target = resolve(candidate)

    return this.state.projects.some((project) => {
      const workspace = resolve(project.path)
      const distance = relative(workspace, target)
      return distance === '' || (!distance.startsWith('..') && !isAbsolute(distance))
    })
  }

  private requireTask(taskId: string): TaskRecord {
    const task = this.state.tasks.find((entry) => entry.id === taskId)
    if (!task) throw new Error('Task does not exist.')
    return task
  }

  private async persist(): Promise<void> {
    const persistedState: PersistedState = {
      ...this.state,
      tasks: this.state.tasks.map((task) =>
        task.sessionSource === 'grok' ? { ...task, messages: [] } : task
      )
    }
    const payload = JSON.stringify(persistedState, null, 2)
    const temporaryPath = `${this.filePath}.next`

    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await writeFile(temporaryPath, payload, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.filePath)
    })

    return this.writeQueue
  }
}
