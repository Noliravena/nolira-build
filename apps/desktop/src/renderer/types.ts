export type TaskStatus =
  | "idle"
  | "starting"
  | "running"
  | "waiting"
  | "completed"
  | "error"

export type MessageRole = "user" | "assistant" | "system"
export type EffortLevel = "low" | "medium" | "high" | "max"
export type PermissionMode = "default" | "accept-edits" | "full-access"
export type ThemeMode = "system" | "light" | "dark"

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
  type: "text"
  text: string
}

export interface ThinkingPart {
  id: string
  type: "thinking"
  text: string
  status?: "streaming" | "complete"
}

export interface ToolPart {
  id: string
  type: "tool"
  title: string
  kind?: string
  status: "pending" | "running" | "success" | "error"
  description?: string
  input?: string
  output?: string
  startedAt?: string
  completedAt?: string
}

export interface ErrorPart {
  id: string
  type: "error"
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
  model?: string
  effort?: EffortLevel
  permissionMode?: PermissionMode
  plan?: string[]
  contextTokens?: number
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
  state: "checking" | "ready" | "offline" | "error"
  version?: string
  message?: string
  binaryPath?: string
}

export interface PermissionOption {
  id: string
  label: string
  description?: string
  kind?: "allow_once" | "allow_always" | "reject_once" | "reject_always"
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
}

export type AgentEvent =
  | { type: "snapshot"; payload: AppSnapshot }
  | { type: "workspace.updated"; payload: Project[] }
  | { type: "task.updated"; taskId: string; payload: Task }
  | {
      type: "message.updated"
      taskId: string
      payload: ChatMessage
    }
  | {
      type: "message.delta"
      taskId: string
      payload: {
        messageId: string
        partId: string
        partType?: "text" | "thinking"
        delta: string
      }
    }
  | {
      type: "permission.request"
      taskId: string
      payload: PermissionRequest
    }
  | {
      type: "permission.resolved"
      taskId: string
      payload: { requestId: string }
    }
  | { type: "runtime.status"; payload: RuntimeStatus }
  | { type: "models.updated"; payload: string[] }
  | {
      type: "error"
      taskId?: string
      payload: { message: string; detail?: string }
    }

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
  onEvent: (callback: (event: AgentEvent) => void) => () => void
  windowControl?: (
    action: "minimize" | "maximize" | "close",
  ) => Promise<void> | void
}

export const DEFAULT_SETTINGS: AppSettings = {
  grokPath: "",
  defaultModel: "grok-4.5",
  defaultEffort: "high",
  defaultPermissionMode: "default",
  theme: "system",
  showActivityPanel: false,
  notifications: true,
}
