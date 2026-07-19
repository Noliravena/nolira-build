import { contextBridge, ipcRenderer } from 'electron'

type EventListener = (event: unknown) => void

const channels = {
  bootstrap: 'nolira:bootstrap',
  chooseWorkspace: 'nolira:choose-workspace',
  createProject: 'nolira:create-project',
  createTask: 'nolira:create-task',
  selectTask: 'nolira:select-task',
  sendPrompt: 'nolira:send-prompt',
  cancelTask: 'nolira:cancel-task',
  respondPermission: 'nolira:respond-permission',
  pickAttachments: 'nolira:pick-attachments',
  updateSettings: 'nolira:update-settings',
  openPath: 'nolira:open-path',
  event: 'nolira:event',
  windowControl: 'nolira:window-control'
} as const

const api = Object.freeze({
  platform: process.platform,
  bootstrap: (): Promise<unknown> => ipcRenderer.invoke(channels.bootstrap),
  chooseWorkspace: (): Promise<string | null> =>
    ipcRenderer.invoke(channels.chooseWorkspace),
  createProject: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke(channels.createProject, input),
  createTask: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke(channels.createTask, input),
  selectTask: (taskId: string): Promise<unknown> =>
    ipcRenderer.invoke(channels.selectTask, taskId),
  sendPrompt: (input: unknown): Promise<void> =>
    ipcRenderer.invoke(channels.sendPrompt, input),
  cancelTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke(channels.cancelTask, taskId),
  respondPermission: (input: unknown): Promise<void> =>
    ipcRenderer.invoke(channels.respondPermission, input),
  pickAttachments: (): Promise<unknown[]> =>
    ipcRenderer.invoke(channels.pickAttachments),
  updateSettings: (patch: unknown): Promise<unknown> =>
    ipcRenderer.invoke(channels.updateSettings, patch),
  openPath: (path: string): Promise<void> =>
    ipcRenderer.invoke(channels.openPath, path),
  onEvent: (callback: EventListener): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
      callback(payload)
    }
    ipcRenderer.on(channels.event, listener)
    return () => ipcRenderer.removeListener(channels.event, listener)
  },
  windowControl: (action: 'minimize' | 'maximize' | 'close'): Promise<void> =>
    ipcRenderer.invoke(channels.windowControl, action)
})

contextBridge.exposeInMainWorld('nolira', api)
