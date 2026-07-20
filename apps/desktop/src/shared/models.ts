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
export type SessionSource = 'desktop' | 'grok'

export type GoalStatus = 'active' | 'paused' | 'completed' | 'cancelled' | 'error'

export interface GoalState {
  id?: string
  objective: string
  status: GoalStatus
  phase?: string
  elapsedMs?: number
  lastEvent?: string
  message?: string
  updatedAt: string
}

export interface SubagentState {
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
}

export interface BackgroundTaskState {
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
}

export interface InboxItem {
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

export interface McpServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface WorkspaceMemory {
  projectId: string
  enabled: boolean
  content: string
  updatedAt: string
}

export interface AutomationDefinition {
  id: string
  name: string
  projectId: string
  prompt: string
  intervalMinutes: number
  enabled: boolean
  lastRunAt?: string
  nextRunAt?: string
  createdAt: string
  updatedAt: string
}

export interface ProviderSummary {
  id: 'grok-acp'
  name: string
  kind: 'grok-acp'
  authOwner: 'grok-cli'
  state: RuntimeStatus['state']
  version?: string
  binaryPath?: string
  models: string[]
}

export interface Project {
  id: string
  name: string
  path: string
  createdAt?: string
  updatedAt?: string
}

export interface Attachment {
  id?: string
  name: string
  path?: string
  mimeType?: string
  size?: number
  dataUrl?: string
}

export interface TextPart {
  id: string
  type: 'text'
  text: string
}

export interface ThinkingPart {
  id: string
  type: 'thinking'
  text: string
  status?: 'streaming' | 'complete'
}

export interface ToolPart {
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

export interface ErrorPart {
  id: string
  type: 'error'
  title?: string
  text: string
}

export type MessagePart = TextPart | ThinkingPart | ToolPart | ErrorPart

export interface ChatMessage {
  id: string
  taskId: string
  role: MessageRole
  parts: MessagePart[]
  attachments?: Attachment[]
  createdAt: string
  streaming?: boolean
}

export interface Task {
  id: string
  projectId: string
  title: string
  status: TaskStatus
  messages: ChatMessage[]
  sessionId?: string
  sessionSource?: SessionSource
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
  goal?: GoalState
  subagents?: SubagentState[]
  backgroundTasks?: BackgroundTaskState[]
  error?: string
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  grokPath: string
  defaultModel: string
  defaultEffort: EffortLevel
  defaultPermissionMode: PermissionMode
  theme: ThemeMode
  showActivityPanel: boolean
  notifications: boolean
}

export interface RuntimeStatus {
  state: 'checking' | 'ready' | 'offline' | 'error'
  version?: string
  message?: string
  binaryPath?: string
}

export interface PermissionOption {
  id: string
  label: string
  description?: string
  kind?: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
  dangerous?: boolean
}

export interface PermissionRequest {
  id: string
  taskId: string
  title: string
  description?: string
  tool?: string
  command?: string
  options: PermissionOption[]
  createdAt?: string
}

export interface AppSnapshot {
  projects: Project[]
  tasks: Task[]
  settings: AppSettings
  runtime: RuntimeStatus
  models?: string[]
  activeTaskId?: string | null
  inbox?: InboxItem[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  grokPath: '',
  defaultModel: 'grok-4.5',
  defaultEffort: 'high',
  defaultPermissionMode: 'default',
  theme: 'system',
  showActivityPanel: false,
  notifications: true
}
