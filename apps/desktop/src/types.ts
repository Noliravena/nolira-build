export type MessageRole = 'user' | 'assistant' | 'system';
export type ToolStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskStatus = 'idle' | 'connecting' | 'streaming' | 'waiting_approval' | 'failed';
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  thought: string;
  createdAt: number;
}

export interface ToolActivity {
  id: string;
  title: string;
  kind: string;
  status: ToolStatus;
  input?: string | null;
  output?: string | null;
}

export interface ConversationTask {
  id: string;
  projectId: string;
  title: string;
  providerId: string;
  modelId: string;
  reasoningEffort: ReasoningEffort;
  engineSessionId?: string | null;
  messages: ChatMessage[];
  tools: ToolActivity[];
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  customEnginePath?: string | null;
}

export interface ProviderDescriptor {
  id: string;
  name: string;
  detail: string;
  transport: string;
  capabilities: string[];
  isAvailable: boolean;
}

export interface RuntimeInfo {
  status: string;
  path?: string | null;
  version?: string | null;
}

export interface BootstrapPayload {
  projects: Project[];
  tasks: ConversationTask[];
  settings: AppSettings;
  providers: ProviderDescriptor[];
  runtime: RuntimeInfo;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface AgentEvent {
  kind: string;
  taskId: string;
  data: Record<string, unknown>;
}

export interface PendingPermission {
  taskId: string;
  requestId: string;
  toolName: string;
  summary: string;
  detail?: string | null;
}
