import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import type {
  AppSettings,
  ApprovalMode,
  BootstrapPayload,
  ConversationTask,
  GitSnapshot,
  Project,
  PromptAttachment,
  ReasoningEffort,
  RuntimeInfo,
  TaskMode,
} from './types';

export const api = {
  bootstrap: () => invoke<BootstrapPayload>('bootstrap'),

  async chooseProject(): Promise<string | null> {
    const selection = await open({
      directory: true,
      multiple: false,
      title: 'Open a project for Grok Build',
    });
    return typeof selection === 'string' ? selection : null;
  },

  async chooseAttachments(): Promise<PromptAttachment[]> {
    const selection = await open({
      directory: false,
      multiple: true,
      title: 'Attach files to this task',
    });
    const paths = typeof selection === 'string' ? [selection] : (selection ?? []);
    return paths.length ? invoke<PromptAttachment[]>('describe_attachments', { paths }) : [];
  },

  addProject: (path: string) => invoke<Project>('add_project', { path }),
  updateProjectContext: (projectId: string, instructions: string, memory: string) =>
    invoke<Project>('update_project_context', { projectId, instructions, memory }),
  createTask: (projectId: string) => invoke<ConversationTask>('create_task', { projectId }),
  renameTask: (taskId: string, title: string) => invoke<void>('rename_task', { taskId, title }),
  updateTaskPreferences: (
    taskId: string,
    modelId: string,
    reasoningEffort: ReasoningEffort,
    mode: TaskMode,
    approvalMode: ApprovalMode,
  ) =>
    invoke<ConversationTask>('update_task_preferences', {
      taskId,
      modelId,
      reasoningEffort,
      mode,
      approvalMode,
    }),
  forkTask: (taskId: string) => invoke<ConversationTask>('fork_task', { taskId }),
  deleteTask: (taskId: string) => invoke<void>('delete_task', { taskId }),
  deleteProject: (projectId: string) => invoke<void>('delete_project', { projectId }),
  updateSettings: (settings: AppSettings) => invoke<RuntimeInfo>('update_settings', { settings }),
  searchProjectFiles: (taskId: string, query: string) =>
    invoke<PromptAttachment[]>('search_project_files', { taskId, query }),
  savePastedAttachment: (input: { name: string; mime: string; dataBase64: string }) =>
    invoke<PromptAttachment>('save_pasted_attachment', { input }),
  sendPrompt: (input: {
    taskId: string;
    prompt: string;
    modelId: string;
    reasoningEffort: ReasoningEffort;
    mode: TaskMode;
    approvalMode: ApprovalMode;
    attachments: PromptAttachment[];
  }) => invoke<ConversationTask>('send_prompt', { input }),
  resolvePermission: (
    taskId: string,
    requestId: string,
    decision: 'allow_once' | 'allow_session' | 'deny',
  ) => invoke<void>('resolve_permission', { taskId, requestId, decision }),
  cancelTask: (taskId: string) => invoke<void>('cancel_task', { taskId }),
  gitSnapshot: (taskId: string) => invoke<GitSnapshot>('git_snapshot', { taskId }),
  gitStage: (taskId: string, paths: string[]) => invoke<void>('git_stage', { taskId, paths }),
  gitUnstage: (taskId: string, paths: string[]) => invoke<void>('git_unstage', { taskId, paths }),
  terminalStart: (taskId: string, rows = 30, cols = 100) =>
    invoke<void>('terminal_start', { taskId, rows, cols }),
  terminalWrite: (taskId: string, input: string) =>
    invoke<void>('terminal_write', { taskId, input }),
  terminalResize: (taskId: string, rows: number, cols: number) =>
    invoke<void>('terminal_resize', { taskId, rows, cols }),
  terminalStop: (taskId: string) => invoke<void>('terminal_stop', { taskId }),

  async saveArtifact(title: string, content: string, language: string): Promise<boolean> {
    const extension = language === 'svg' ? 'svg' : language === 'html' ? 'html' : 'txt';
    const safeTitle = title.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'artifact';
    const path = await save({
      title: 'Save artifact',
      defaultPath: `${safeTitle}.${extension}`,
    });
    if (!path) return false;
    await invoke<void>('write_artifact', { path, content });
    return true;
  },
};
