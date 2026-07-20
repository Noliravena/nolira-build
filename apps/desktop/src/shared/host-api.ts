import type {
  AppSettings,
  AppSnapshot,
  Attachment,
  AutomationDefinition,
  ChatMessage,
  EffortLevel,
  InboxItem,
  McpServerConfig,
  PermissionMode,
  PermissionRequest,
  Project,
  ProviderSummary,
  RuntimeStatus,
  Task,
  WorkspaceMemory
} from './models'

export interface SessionSummary {
  sessionId: string
  taskId?: string
  projectId: string
  cwd: string
  title: string
  model?: string
  messageCount: number
  createdAt: string
  updatedAt: string
  archived: boolean
  pinned: boolean
  source: 'grok'
}

export interface SessionListParams {
  projectId?: string
  query?: string
  includeArchived?: boolean
  limit?: number
}

export interface SessionHistoryPage {
  sessionId: string
  messages: ChatMessage[]
  total: number
}

export interface SessionRefreshResult {
  sessions: SessionSummary[]
  tasks: Task[]
}

export interface SessionExportResult {
  markdown: string
  suggestedName: string
}

export interface WorkspaceFile {
  name: string
  path: string
  relativePath: string
  mimeType: string
  size: number
}

export interface SkillSummary {
  id: string
  name: string
  description?: string
  source: 'project' | 'grok' | 'codex'
  path: string
}

export interface WorkspaceFileContent {
  file: WorkspaceFile
  content: string
  language: string
  mtimeMs: number
}

export interface WorkspaceChange {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked' | 'conflict'
  staged: boolean
  indexStatus: string
  worktreeStatus: string
}

export interface WorkspaceDiff {
  path: string
  diff: string
  staged: boolean
  truncated: boolean
}

export interface HostMethodMap {
  'sessions.list': {
    params: SessionListParams
    result: { sessions: SessionSummary[] }
  }
  'sessions.refresh': {
    params: SessionListParams
    result: SessionRefreshResult
  }
  'sessions.loadHistory': {
    params: { sessionId: string }
    result: SessionHistoryPage
  }
  'sessions.continueRecent': {
    params: { projectId?: string }
    result: { task: Task | null }
  }
  'sessions.rename': {
    params: { sessionId: string; title: string }
    result: { task: Task }
  }
  'sessions.archive': {
    params: { sessionId: string; archived: boolean }
    result: { task: Task }
  }
  'sessions.exportMarkdown': {
    params: { sessionId: string }
    result: SessionExportResult
  }
  'workspace.files': {
    params: { projectId: string; query?: string; limit?: number }
    result: { files: WorkspaceFile[] }
  }
  'workspace.readFile': {
    params: { projectId: string; path: string }
    result: WorkspaceFileContent
  }
  'workspace.writeFile': {
    params: {
      projectId: string
      path: string
      content: string
      expectedMtimeMs: number
    }
    result: WorkspaceFileContent
  }
  'workspace.changes': {
    params: { projectId: string }
    result: { branch?: string; changes: WorkspaceChange[] }
  }
  'workspace.diff': {
    params: { projectId: string; path: string; staged?: boolean }
    result: WorkspaceDiff
  }
  'skills.list': {
    params: { projectId?: string; query?: string }
    result: { skills: SkillSummary[] }
  }
  'attachments.importData': {
    params: { name: string; mimeType: string; dataBase64: string }
    result: { attachment: Attachment }
  }
  'inbox.list': {
    params: Record<string, never>
    result: { items: InboxItem[] }
  }
  'inbox.markRead': {
    params: { id: string; read?: boolean }
    result: { items: InboxItem[] }
  }
  'inbox.markAllRead': {
    params: Record<string, never>
    result: { items: InboxItem[] }
  }
  'inbox.dismiss': {
    params: { id: string }
    result: { items: InboxItem[] }
  }
  'providers.list': {
    params: Record<string, never>
    result: { providers: ProviderSummary[] }
  }
  'mcp.list': {
    params: Record<string, never>
    result: { servers: McpServerConfig[] }
  }
  'mcp.save': {
    params: {
      id?: string
      name: string
      command: string
      args: string[]
      enabled: boolean
    }
    result: { servers: McpServerConfig[] }
  }
  'mcp.remove': {
    params: { id: string }
    result: { servers: McpServerConfig[] }
  }
  'memory.get': {
    params: { projectId: string }
    result: { memory: WorkspaceMemory }
  }
  'memory.set': {
    params: { projectId: string; enabled: boolean; content: string }
    result: { memory: WorkspaceMemory }
  }
  'automations.list': {
    params: Record<string, never>
    result: { automations: AutomationDefinition[] }
  }
  'automations.save': {
    params: {
      id?: string
      name: string
      projectId: string
      prompt: string
      intervalMinutes: number
      enabled: boolean
    }
    result: { automations: AutomationDefinition[] }
  }
  'automations.remove': {
    params: { id: string }
    result: { automations: AutomationDefinition[] }
  }
  'automations.runNow': {
    params: { id: string }
    result: { automation: AutomationDefinition; task: Task }
  }
}

export type HostMethod = keyof HostMethodMap
export type HostParams<M extends HostMethod> = HostMethodMap[M]['params']
export type HostResult<M extends HostMethod> = HostMethodMap[M]['result']

export interface HostError {
  code: string
  message: string
  details?: unknown
}

export type HostResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: HostError }

export type NormalizedEvent =
  | { type: 'snapshot'; payload: AppSnapshot }
  | { type: 'workspace.updated'; payload: Project[] }
  | { type: 'task.updated'; taskId: string; payload: Task }
  | { type: 'message.updated'; taskId: string; payload: ChatMessage }
  | {
      type: 'message.delta'
      taskId: string
      payload: {
        messageId: string
        partId: string
        partType?: 'text' | 'thinking'
        delta: string
      }
    }
  | {
      type: 'permission.request'
      taskId: string
      payload: PermissionRequest
    }
  | {
      type: 'permission.resolved'
      taskId: string
      payload: { requestId: string }
    }
  | { type: 'runtime.status'; payload: RuntimeStatus }
  | { type: 'models.updated'; payload: string[] }
  | { type: 'sessions.indexed'; payload: SessionSummary[] }
  | { type: 'inbox.updated'; payload: InboxItem[] }
  | { type: 'automations.updated'; payload: AutomationDefinition[] }
  | {
      type: 'error'
      taskId?: string
      payload: { message: string; detail?: string }
    }

export type AgentEvent = NormalizedEvent

export interface NoliraAPI {
  platform: string
  bootstrap: () => Promise<AppSnapshot>
  chooseWorkspace: () => Promise<string | null>
  createProject: (input: { path: string; name?: string }) => Promise<Project>
  createTask: (input: { projectId: string; title?: string }) => Promise<Task>
  selectTask: (taskId: string) => Promise<Task | void>
  sendPrompt: (input: {
    taskId: string
    text: string
    attachments: Attachment[]
    model: string
    effort: EffortLevel
    permissionMode: PermissionMode
  }) => Promise<void>
  cancelTask: (taskId: string) => Promise<void>
  respondPermission: (input: {
    requestId: string
    optionId: string
  }) => Promise<void>
  pickAttachments: () => Promise<Attachment[]>
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  openPath: (path: string) => Promise<void>
  invoke: <M extends HostMethod>(
    method: M,
    params: HostParams<M>
  ) => Promise<HostResponse<HostResult<M>>>
  onEvent: (callback: (event: NormalizedEvent) => void) => () => void
  windowControl?: (
    action: 'minimize' | 'maximize' | 'close'
  ) => Promise<void> | void
}
