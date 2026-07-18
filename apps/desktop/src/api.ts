import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  AppSettings,
  BootstrapPayload,
  ConversationTask,
  Project,
  ReasoningEffort,
  RuntimeInfo,
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

  addProject: (path: string) => invoke<Project>('add_project', { path }),
  createTask: (projectId: string) => invoke<ConversationTask>('create_task', { projectId }),
  renameTask: (taskId: string, title: string) => invoke<void>('rename_task', { taskId, title }),
  deleteTask: (taskId: string) => invoke<void>('delete_task', { taskId }),
  deleteProject: (projectId: string) => invoke<void>('delete_project', { projectId }),
  updateSettings: (settings: AppSettings) =>
    invoke<RuntimeInfo>('update_settings', { settings }),
  sendPrompt: (input: {
    taskId: string;
    prompt: string;
    modelId: string;
    reasoningEffort: ReasoningEffort;
  }) => invoke<ConversationTask>('send_prompt', { input }),
  resolvePermission: (
    taskId: string,
    requestId: string,
    decision: 'allow_once' | 'allow_session' | 'deny',
  ) => invoke<void>('resolve_permission', { taskId, requestId, decision }),
  cancelTask: (taskId: string) => invoke<void>('cancel_task', { taskId }),
  gitSnapshot: (taskId: string) => invoke<string>('git_snapshot', { taskId }),
  runTerminalCommand: (taskId: string, command: string) =>
    invoke<string>('run_terminal_command', { taskId, command }),
};
