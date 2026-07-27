import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  session,
  shell,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions
} from 'electron'

import type {
  GrokAcpEvent,
  GrokAcpEventListener,
  GrokConnectRequest,
  GrokPermissionResponse,
  GrokPromptRequest
} from '../shared/acp'
import type {
  HostMethod,
  HostResponse,
  NormalizedEvent,
  SessionListParams,
  SessionSummary
} from '../shared/host-api'
import type { AutomationDefinition, RuntimeStatus } from '../shared/models'
import { IntegrationStore } from './integrations'
import { SessionIndexService } from './sessions'
import {
  discoverSkills,
  listWorkspaceChanges,
  listWorkspaceFiles,
  readWorkspaceFile,
  workspaceDiff,
  writeWorkspaceFile
} from './workspace'
import {
  DesktopStore,
  type AppSettingsRecord,
  type AttachmentRecord,
  type EffortLevel,
  type MessagePartRecord,
  type MessageRecord,
  type PermissionMode,
  type TaskRecord
} from './store'

const userDataOverride = process.env.NOLIRA_USER_DATA_DIR
if (userDataOverride) {
  const userDataPath = resolve(userDataOverride)
  mkdirSync(userDataPath, { recursive: true })
  app.setPath('userData', userDataPath)
}

// Keep Chromium's renderer accessibility tree available to VoiceOver and
// keyboard-assistive tooling even before an OS accessibility client connects.
app.commandLine.appendSwitch('force-renderer-accessibility')

const execFileAsync = promisify(execFile)

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
  host: 'nolira:host',
  event: 'nolira:event',
  windowControl: 'nolira:window-control'
} as const

type AcpManager = {
  connect: (request: GrokConnectRequest) => Promise<unknown>
  prompt: (request: GrokPromptRequest) => Promise<unknown>
  cancel: (taskId: string) => Promise<void>
  respondPermission: (response: GrokPermissionResponse) => Promise<void>
  disconnect: (taskId: string) => Promise<void>
  shutdown: () => Promise<void>
  onEvent: (listener: GrokAcpEventListener) => void | (() => void)
}

type PendingAssistant = {
  messageId: string
  thinkingPartId: string
  textPartId: string
}

let mainWindow: BrowserWindow | null = null
let store: DesktopStore
let sessionIndex: SessionIndexService
let integrations: IntegrationStore
let manager: AcpManager | null = null
let removeManagerListener: (() => void) | undefined
let runtimeStatus: RuntimeStatus = { state: 'checking' }
let availableModels: string[] = []
let automationTimer: NodeJS.Timeout | undefined

const connectedTasks = new Set<string>()
const pendingAssistants = new Map<string, PendingAssistant>()
const allowedAttachmentPaths = new Set<string>()
const allowedWorkspacePaths = new Set<string>()
const runningAutomations = new Set<string>()

function emit(event: NormalizedEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channels.event, event)
}

function notifyWhenBackground(title: string, body: string): void {
  if (
    !store.getSettings().notifications ||
    mainWindow?.isFocused() ||
    !Notification.isSupported()
  ) {
    return
  }
  new Notification({ title, body }).show()
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error('Rejected IPC from an untrusted renderer.')
  }
}

function windowOptions(): BrowserWindowConstructorOptions {
  const dark = nativeTheme.shouldUseDarkColors
  // Solid Cursor Agents palette (no vibrancy / no transparent shell).
  const backgroundColor = dark ? '#0c0e11' : '#f7f7f4'
  const common: BrowserWindowConstructorOptions = {
    width: 1440,
    height: 920,
    minWidth: 500,
    minHeight: 600,
    show: false,
    backgroundColor,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true
    }
  }

  if (process.platform === 'darwin') {
    // Topnav is 40px (--nol-topbar-h). Traffic lights are ~12px tall;
    // y:14 centers them on the same axis as the header content.
    return {
      ...common,
      frame: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 14 },
      transparent: false,
      hasShadow: true,
      roundedCorners: true
    }
  }

  if (process.platform === 'win32') {
    return {
      ...common,
      frame: false
    }
  }

  return { ...common, frame: false }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow(windowOptions())

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL()
    if (url !== currentUrl) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function isExternalWebUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = []

  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  template.push(
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(process.env.ELECTRON_RENDERER_URL
          ? ([{ role: 'toggleDevTools' }] as MenuItemConstructorOptions[])
          : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] }
  )

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function getManager(): Promise<AcpManager> {
  if (manager) return manager

  const acpModule = await import('./acp')
  const Manager = acpModule.GrokAcpManager as unknown as new () => AcpManager
  manager = new Manager()
  const unsubscribe = manager.onEvent((event) => {
    void handleAcpEvent(event).catch((error: unknown) => {
      emitError(event.taskId, error)
    })
  })
  if (typeof unsubscribe === 'function') removeManagerListener = unsubscribe
  return manager
}

async function checkRuntime(): Promise<RuntimeStatus> {
  runtimeStatus = { state: 'checking' }
  emit({ type: 'runtime.status', payload: runtimeStatus })

  try {
    const acpModule = await import('./acp')
    const executable = await acpModule.resolveGrokExecutable({
      explicitPath: store.getSettings().grokPath || undefined,
      resourcesPath: process.resourcesPath
    })
    const { stdout, stderr } = await execFileAsync(executable, ['--version'], {
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 64 * 1024
    })
    const version = `${stdout || stderr}`.trim().split(/\r?\n/, 1)[0]
    runtimeStatus = {
      state: 'ready',
      version: version || undefined,
      binaryPath: executable
    }
  } catch (error) {
    runtimeStatus = {
      state: 'offline',
      message: errorMessage(error)
    }
  }

  emit({ type: 'runtime.status', payload: runtimeStatus })
  return runtimeStatus
}

function registerIpc(): void {
  ipcMain.handle(channels.bootstrap, async (event) => {
    assertTrustedSender(event)
    await refreshIndexedSessions({}, false)
    return {
      ...store.snapshot(),
      runtime: await checkRuntime(),
      models: availableModels
    }
  })

  ipcMain.handle(channels.chooseWorkspace, async (event) => {
    assertTrustedSender(event)
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a workspace',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const selectedPath = resolve(result.filePaths[0])
    allowedWorkspacePaths.add(selectedPath)
    return selectedPath
  })

  ipcMain.handle(channels.createProject, async (event, input: unknown) => {
    assertTrustedSender(event)
    const record = expectRecord(input)
    const path = resolve(expectString(record.path, 'path'))
    if (!allowedWorkspacePaths.has(path)) {
      throw new Error('Choose the workspace through the native folder picker first.')
    }
    const info = await stat(path)
    if (!info.isDirectory()) throw new Error('Workspace must be a directory.')
    const project = await store.createProject({
      path,
      name: optionalString(record.name, 'name')
    })
    allowedWorkspacePaths.delete(path)
    emit({ type: 'workspace.updated', payload: store.listProjects() })
    await refreshIndexedSessions()
    return project
  })

  ipcMain.handle(channels.createTask, async (event, input: unknown) => {
    assertTrustedSender(event)
    const record = expectRecord(input)
    const task = await store.createTask({
      projectId: expectIdentifier(record.projectId, 'projectId'),
      title: optionalString(record.title, 'title')
    })
    emit({ type: 'task.updated', taskId: task.id, payload: task })
    return task
  })

  ipcMain.handle(channels.selectTask, async (event, taskId: unknown) => {
    assertTrustedSender(event)
    return selectAndHydrateTask(expectIdentifier(taskId, 'taskId'))
  })

  ipcMain.handle(channels.sendPrompt, async (event, input: unknown) => {
    assertTrustedSender(event)
    const request = parsePromptInput(input)
    await sendPrompt(request)
  })

  ipcMain.handle(channels.cancelTask, async (event, taskId: unknown) => {
    assertTrustedSender(event)
    const id = expectIdentifier(taskId, 'taskId')
    await (await getManager()).cancel(id)
    await updateTaskAndEmit(id, { status: 'idle' })
  })

  ipcMain.handle(channels.respondPermission, async (event, input: unknown) => {
    assertTrustedSender(event)
    const record = expectRecord(input)
    const requestId = expectIdentifier(record.requestId, 'requestId')
    const optionId = expectIdentifier(record.optionId, 'optionId')
    await (await getManager()).respondPermission({ requestId, optionId })
    const taskId = store.listInbox().find((item) => item.sourceId === requestId)?.taskId
    const inbox = await store.dismissInboxBySource(requestId)
    emit({ type: 'inbox.updated', payload: inbox })
    if (taskId) {
      emit({
        type: 'permission.resolved',
        taskId,
        payload: { requestId }
      })
    }
  })

  ipcMain.handle(channels.pickAttachments, async (event) => {
    assertTrustedSender(event)
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options: Electron.OpenDialogOptions = {
      title: 'Attach files',
      properties: ['openFile', 'multiSelections']
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled) return []

    return Promise.all(
      result.filePaths.slice(0, 20).map(async (filePath): Promise<AttachmentRecord> => {
        const metadata = await stat(filePath)
        const absolutePath = resolve(filePath)
        allowedAttachmentPaths.add(absolutePath)
        return {
          id: randomUUID(),
          name: absolutePath.split(/[\\/]/).at(-1) ?? 'attachment',
          path: absolutePath,
          mimeType: mimeTypeForPath(absolutePath),
          size: metadata.size
        }
      })
    )
  })

  ipcMain.handle(channels.updateSettings, async (event, input: unknown) => {
    assertTrustedSender(event)
    const patch = parseSettingsPatch(input)
    const settings = await store.updateSettings(patch)
    nativeTheme.themeSource = settings.theme
    if (Object.prototype.hasOwnProperty.call(patch, 'grokPath')) {
      await shutdownManager()
      void checkRuntime()
    }
    return settings
  })

  ipcMain.handle(channels.openPath, async (event, input: unknown) => {
    assertTrustedSender(event)
    const candidate = resolve(expectString(input, 'path'))
    const runtimeBinary = runtimeStatus.binaryPath
      ? resolve(runtimeStatus.binaryPath)
      : undefined
    if (candidate === runtimeBinary) {
      shell.showItemInFolder(candidate)
      return
    }
    if (!store.isAllowedPath(candidate) && !allowedAttachmentPaths.has(candidate)) {
      throw new Error('The requested path is outside the approved workspaces.')
    }
    const failure = await shell.openPath(candidate)
    if (failure) throw new Error(failure)
  })

  ipcMain.handle(channels.host, async (event, input: unknown) => {
    assertTrustedSender(event)
    try {
      const record = expectRecord(input)
      const method = expectEnum(
        record.method,
        [
          'sessions.list',
          'sessions.refresh',
          'sessions.loadHistory',
          'sessions.continueRecent',
          'sessions.rename',
          'sessions.archive',
          'sessions.exportMarkdown',
          'workspace.files',
          'workspace.readFile',
          'workspace.writeFile',
          'workspace.changes',
          'workspace.diff',
          'skills.list',
          'attachments.importData',
          'inbox.list',
          'inbox.markRead',
          'inbox.markAllRead',
          'inbox.dismiss',
          'providers.list',
          'mcp.list',
          'mcp.save',
          'mcp.remove',
          'memory.get',
          'memory.set',
          'automations.list',
          'automations.save',
          'automations.remove',
          'automations.runNow'
        ],
        'method'
      )
      const data = await handleHostRequest(method, record.params)
      return { ok: true, data } satisfies HostResponse<unknown>
    } catch (error) {
      return {
        ok: false,
        error: {
          code: hostErrorCode(error),
          message: errorMessage(error)
        }
      } satisfies HostResponse<unknown>
    }
  })

  ipcMain.handle(
    channels.windowControl,
    (event: IpcMainInvokeEvent, input: unknown) => {
      assertTrustedSender(event)
      const action = expectEnum(input, ['minimize', 'maximize', 'close'], 'action')
      const owner = BrowserWindow.fromWebContents(event.sender)
      if (!owner) return
      if (action === 'minimize') owner.minimize()
      if (action === 'maximize') {
        if (owner.isMaximized()) owner.unmaximize()
        else owner.maximize()
      }
      if (action === 'close') owner.close()
    }
  )
}

async function handleHostRequest(
  method: HostMethod,
  input: unknown
): Promise<unknown> {
  const record = expectRecord(input)

  switch (method) {
    case 'sessions.list': {
      const params = parseSessionListParams(record)
      return { sessions: linkSessionTasks(sessionIndex.list(params)) }
    }
    case 'sessions.refresh':
      return refreshIndexedSessions(parseSessionListParams(record))
    case 'sessions.loadHistory': {
      const sessionId = expectIdentifier(record.sessionId, 'sessionId')
      const task = store.findTaskBySessionId(sessionId)
      const page = await sessionIndex.loadHistory(sessionId, task?.id ?? sessionId)
      if (task) {
        const hydrated = await store.replaceMessages(task.id, page.messages)
        emit({ type: 'task.updated', taskId: task.id, payload: hydrated })
      }
      return page
    }
    case 'sessions.continueRecent': {
      const projectId = optionalProjectId(record.projectId)
      const session = sessionIndex.list({ projectId, limit: 1 })[0]
      if (!session) return { task: null }
      const task = store.findTaskBySessionId(session.sessionId)
      if (!task) throw new Error('Indexed session task does not exist.')
      const hydrated = await selectAndHydrateTask(task.id)
      emit({ type: 'task.updated', taskId: hydrated.id, payload: hydrated })
      return { task: hydrated }
    }
    case 'sessions.rename': {
      const sessionId = expectIdentifier(record.sessionId, 'sessionId')
      const title = expectString(record.title, 'title').slice(0, 160)
      const session = await sessionIndex.rename(sessionId, title)
      const task = await ensureSessionTask(session)
      const updated = await store.updateTask(task.id, { title: session.title })
      emit({ type: 'task.updated', taskId: updated.id, payload: updated })
      emit({ type: 'sessions.indexed', payload: linkSessionTasks(sessionIndex.list({})) })
      return { task: updated }
    }
    case 'sessions.archive': {
      const sessionId = expectIdentifier(record.sessionId, 'sessionId')
      const archived = expectBoolean(record.archived, 'archived')
      const session = await sessionIndex.archive(sessionId, archived)
      const task = await ensureSessionTask(session)
      const updated = await store.updateTask(task.id, { archived })
      emit({ type: 'task.updated', taskId: updated.id, payload: updated })
      emit({ type: 'sessions.indexed', payload: linkSessionTasks(sessionIndex.list({})) })
      return { task: updated }
    }
    case 'sessions.exportMarkdown':
      return sessionIndex.exportMarkdown(
        expectIdentifier(record.sessionId, 'sessionId')
      )
    case 'workspace.files': {
      const projectId = expectIdentifier(record.projectId, 'projectId')
      const project = store.getProject(projectId)
      if (!project) throw new Error('Project does not exist.')
      const query = optionalString(record.query, 'query', true) ?? ''
      const limit = optionalFiniteInteger(record.limit, 'limit') ?? 40
      return {
        files: await listWorkspaceFiles(project.path, query, limit)
      }
    }
    case 'workspace.readFile': {
      const project = requireProject(record.projectId)
      return readWorkspaceFile(
        project.path,
        expectString(record.path, 'path')
      )
    }
    case 'workspace.writeFile': {
      const project = requireProject(record.projectId)
      if (
        typeof record.expectedMtimeMs !== 'number' ||
        !Number.isFinite(record.expectedMtimeMs)
      ) {
        throw new Error('expectedMtimeMs must be a finite number.')
      }
      return writeWorkspaceFile(
        project.path,
        expectString(record.path, 'path'),
        expectString(record.content, 'content', true),
        record.expectedMtimeMs
      )
    }
    case 'workspace.changes': {
      const project = requireProject(record.projectId)
      return listWorkspaceChanges(project.path)
    }
    case 'workspace.diff': {
      const project = requireProject(record.projectId)
      const staged =
        record.staged === undefined
          ? false
          : expectBoolean(record.staged, 'staged')
      return workspaceDiff(
        project.path,
        expectString(record.path, 'path'),
        staged
      )
    }
    case 'skills.list': {
      const projectId = optionalProjectId(record.projectId)
      const project = projectId ? store.getProject(projectId) : undefined
      return {
        skills: await discoverSkills({
          projectPath: project?.path,
          query: optionalString(record.query, 'query')
        })
      }
    }
    case 'attachments.importData':
      return {
        attachment: await importPastedAttachment(record)
      }
    case 'inbox.list':
      return { items: store.listInbox() }
    case 'inbox.markRead': {
      const items = await store.markInboxRead(
        expectIdentifier(record.id, 'id'),
        record.read === undefined ? true : expectBoolean(record.read, 'read')
      )
      emit({ type: 'inbox.updated', payload: items })
      return { items }
    }
    case 'inbox.markAllRead': {
      const items = await store.markAllInboxRead()
      emit({ type: 'inbox.updated', payload: items })
      return { items }
    }
    case 'inbox.dismiss': {
      const items = await store.dismissInbox(expectIdentifier(record.id, 'id'))
      emit({ type: 'inbox.updated', payload: items })
      return { items }
    }
    case 'providers.list':
      return {
        providers: [
          {
            id: 'grok-acp',
            name: 'Grok ACP',
            kind: 'grok-acp',
            authOwner: 'grok-cli',
            state: runtimeStatus.state,
            version: runtimeStatus.version,
            binaryPath: runtimeStatus.binaryPath,
            models: availableModels
          }
        ]
      }
    case 'mcp.list':
      return { servers: integrations.listMcpServers() }
    case 'mcp.save': {
      const servers = await integrations.saveMcpServer({
        id: optionalString(record.id, 'id'),
        name: expectString(record.name, 'name').trim().slice(0, 100),
        command: expectString(record.command, 'command').trim().slice(0, 1_000),
        args: parseStringArray(record.args, 'args', 100, 2_000),
        enabled: expectBoolean(record.enabled, 'enabled')
      })
      return { servers }
    }
    case 'mcp.remove':
      return {
        servers: await integrations.removeMcpServer(
          expectIdentifier(record.id, 'id')
        )
      }
    case 'memory.get': {
      const project = requireProject(record.projectId)
      return { memory: integrations.getMemory(project.id) }
    }
    case 'memory.set': {
      const project = requireProject(record.projectId)
      const content = expectString(record.content, 'content', true)
      if (content.length > 100_000) {
        throw new Error('Workspace memory cannot exceed 100,000 characters.')
      }
      return {
        memory: await integrations.setMemory({
          projectId: project.id,
          enabled: expectBoolean(record.enabled, 'enabled'),
          content
        })
      }
    }
    case 'automations.list':
      return { automations: integrations.listAutomations() }
    case 'automations.save': {
      const project = requireProject(record.projectId)
      const intervalMinutes = optionalFiniteInteger(
        record.intervalMinutes,
        'intervalMinutes'
      )
      if (
        intervalMinutes === undefined ||
        intervalMinutes < 5 ||
        intervalMinutes > 10_080
      ) {
        throw new Error('Automation interval must be between 5 and 10,080 minutes.')
      }
      const automations = await integrations.saveAutomation({
        id: optionalString(record.id, 'id'),
        name: expectString(record.name, 'name').trim().slice(0, 120),
        projectId: project.id,
        prompt: expectString(record.prompt, 'prompt').slice(0, 100_000),
        intervalMinutes,
        enabled: expectBoolean(record.enabled, 'enabled')
      })
      emit({ type: 'automations.updated', payload: automations })
      return { automations }
    }
    case 'automations.remove': {
      const automations = await integrations.removeAutomation(
        expectIdentifier(record.id, 'id')
      )
      emit({ type: 'automations.updated', payload: automations })
      return { automations }
    }
    case 'automations.runNow':
      return runAutomation(expectIdentifier(record.id, 'id'))
  }
}

async function refreshIndexedSessions(
  params: SessionListParams = {},
  emitUpdates = true
): Promise<{ sessions: SessionSummary[]; tasks: TaskRecord[] }> {
  const discovered = await sessionIndex.refresh(store.listProjects())
  const indexedTasks = await store.syncIndexedSessions(discovered)
  const sessions = linkSessionTasks(sessionIndex.list(params))

  if (emitUpdates) {
    for (const task of indexedTasks) {
      emit({ type: 'task.updated', taskId: task.id, payload: task })
    }
    emit({ type: 'sessions.indexed', payload: sessions })
  }

  return { sessions, tasks: indexedTasks }
}

function linkSessionTasks(sessions: SessionSummary[]): SessionSummary[] {
  return sessions.map((session) => ({
    ...session,
    taskId: store.findTaskBySessionId(session.sessionId)?.id
  }))
}

async function ensureSessionTask(session: SessionSummary): Promise<TaskRecord> {
  const existing = store.findTaskBySessionId(session.sessionId)
  if (existing) return existing
  const [created] = await store.syncIndexedSessions([session])
  if (!created) throw new Error('Unable to create an indexed session task.')
  return created
}

async function selectAndHydrateTask(taskId: string): Promise<TaskRecord> {
  let task = await store.selectTask(taskId)
  if (!task.sessionId || !sessionIndex.get(task.sessionId)) return task

  const history = await sessionIndex.loadHistory(task.sessionId, task.id)
  task = await store.replaceMessages(task.id, history.messages)
  return task
}

function parseSessionListParams(record: Record<string, unknown>): SessionListParams {
  const projectId = optionalProjectId(record.projectId)
  const query = optionalString(record.query, 'query')
  const includeArchived =
    record.includeArchived === undefined
      ? undefined
      : expectBoolean(record.includeArchived, 'includeArchived')
  const limit = optionalFiniteInteger(record.limit, 'limit')
  return { projectId, query, includeArchived, limit }
}

async function importPastedAttachment(
  record: Record<string, unknown>
): Promise<AttachmentRecord> {
  const mimeType = expectEnum(
    record.mimeType,
    ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/heic'],
    'mimeType'
  )
  const dataBase64 = expectString(record.dataBase64, 'dataBase64')
  if (
    dataBase64.length > 12_000_000 ||
    dataBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)
  ) {
    throw new Error('Pasted image data is invalid or too large.')
  }
  const bytes = Buffer.from(dataBase64, 'base64')
  if (bytes.byteLength === 0 || bytes.byteLength > 8 * 1024 * 1024) {
    throw new Error('Pasted images must be between 1 byte and 8 MB.')
  }

  const extension = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/heic': 'heic'
  }[mimeType]
  const rawName = expectString(record.name, 'name')
  const safeName = rawName.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 120)
  const directory = join(app.getPath('temp'), `nolira-build-paste-${process.pid}`)
  await mkdir(directory, { recursive: true })
  const path = join(directory, `${randomUUID()}.${extension}`)
  await writeFile(path, bytes, { mode: 0o600 })
  allowedAttachmentPaths.add(path)
  return {
    id: randomUUID(),
    name: safeName || `pasted-image.${extension}`,
    path,
    mimeType,
    size: bytes.byteLength
  }
}

function optionalFiniteInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`)
  }
  return Math.trunc(value)
}

function parseStringArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`${field} must be an array with at most ${maxItems} items.`)
  }
  return value.map((item, index) =>
    expectString(item, `${field}[${index}]`, true).slice(0, maxLength)
  )
}

function optionalProjectId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const projectId = expectIdentifier(value, 'projectId')
  if (!store.getProject(projectId)) throw new Error('Project does not exist.')
  return projectId
}

function requireProject(value: unknown) {
  const projectId = expectIdentifier(value, 'projectId')
  const project = store.getProject(projectId)
  if (!project) throw new Error('Project does not exist.')
  return project
}

function hostErrorCode(error: unknown): string {
  const message = errorMessage(error).toLocaleLowerCase()
  if (message.includes('changed on disk')) return 'CONFLICT'
  if (message.includes('does not exist')) return 'NOT_FOUND'
  if (message.includes('approved workspace') || message.includes('outside')) {
    return 'FORBIDDEN'
  }
  if (
    message.includes('must') ||
    message.includes('invalid') ||
    message.includes('cannot')
  ) {
    return 'INVALID_ARGUMENT'
  }
  return 'INTERNAL'
}

async function runAutomation(id: string): Promise<{
  automation: AutomationDefinition
  task: TaskRecord
}> {
  if (runningAutomations.has(id)) {
    throw new Error('Automation is already running.')
  }
  const automation = integrations.getAutomation(id)
  if (!automation) throw new Error('Automation does not exist.')
  const project = store.getProject(automation.projectId)
  if (!project) throw new Error('Automation project does not exist.')

  runningAutomations.add(id)
  try {
    const created = await store.createTask({
      projectId: project.id,
      title: automation.name,
      select: false
    })
    const task = await store.updateTask(created.id, {
      automationId: automation.id
    })
    const updatedAutomation = await integrations.markAutomationRun(automation.id)
    emit({ type: 'task.updated', taskId: task.id, payload: task })
    emit({
      type: 'automations.updated',
      payload: integrations.listAutomations()
    })

    const settings = store.getSettings()
    void sendPrompt({
      taskId: task.id,
      text: automation.prompt,
      attachments: [],
      model: settings.defaultModel,
      effort: settings.defaultEffort,
      permissionMode: settings.defaultPermissionMode
    })
      .catch(async (error: unknown) => {
        const inbox = await store.addInbox({
          sourceId: `automation-launch:${automation.id}:${task.id}`,
          taskId: task.id,
          type: 'automation',
          title: `Automation failed to start: ${automation.name}`,
          body: errorMessage(error)
        })
        emit({ type: 'inbox.updated', payload: inbox })
      })
      .finally(() => {
        runningAutomations.delete(id)
      })

    return { automation: updatedAutomation, task }
  } catch (error) {
    runningAutomations.delete(id)
    throw error
  }
}

function startAutomationScheduler(): void {
  if (automationTimer) return
  const tick = (): void => {
    for (const automation of integrations.dueAutomations()) {
      if (runningAutomations.has(automation.id)) continue
      void runAutomation(automation.id).catch((error: unknown) => {
        console.warn(`Unable to run automation ${automation.id}.`, error)
      })
    }
  }
  automationTimer = setInterval(tick, 30_000)
  automationTimer.unref()
  tick()
}

type PromptInput = {
  taskId: string
  text: string
  attachments: AttachmentRecord[]
  model: string
  effort: EffortLevel
  permissionMode: PermissionMode
}

function parsePromptInput(input: unknown): PromptInput {
  const record = expectRecord(input)
  const taskId = expectIdentifier(record.taskId, 'taskId')
  const text = expectString(record.text, 'text', true).slice(0, 1_000_000)
  const attachments = parseAttachments(record.attachments)
  if (!text.trim() && attachments.length === 0) {
    throw new Error('A prompt must include text or an attachment.')
  }

  return {
    taskId,
    text,
    attachments,
    model: expectString(record.model, 'model', true).slice(0, 160),
    effort: expectEnum(record.effort, ['low', 'medium', 'high', 'max'], 'effort'),
    permissionMode: expectEnum(
      record.permissionMode,
      ['default', 'accept-edits', 'full-access'],
      'permissionMode'
    )
  }
}

function parseAttachments(value: unknown): AttachmentRecord[] {
  if (!Array.isArray(value)) throw new Error('attachments must be an array.')
  if (value.length > 20) throw new Error('At most 20 attachments are allowed.')

  return value.map((entry) => {
    const record = expectRecord(entry)
    const filePath = resolve(expectString(record.path, 'attachment.path'))
    if (!store.isAllowedPath(filePath) && !allowedAttachmentPaths.has(filePath)) {
      throw new Error('An attachment is outside the approved workspaces.')
    }
    return {
      id: optionalString(record.id, 'attachment.id'),
      name: expectString(record.name, 'attachment.name').slice(0, 240),
      path: filePath,
      mimeType: optionalString(record.mimeType, 'attachment.mimeType'),
      size: typeof record.size === 'number' ? record.size : undefined
    }
  })
}

async function sendPrompt(input: PromptInput): Promise<void> {
  const task = store.getTask(input.taskId)
  if (!task) throw new Error('Task does not exist.')
  const project = store.getProject(task.projectId)
  if (!project) throw new Error('Task workspace does not exist.')

  const now = new Date().toISOString()
  const userMessage: MessageRecord = {
    id: randomUUID(),
    taskId: task.id,
    role: 'user',
    parts: input.text.trim()
      ? [{ id: randomUUID(), type: 'text', text: input.text }]
      : [],
    attachments: input.attachments,
    createdAt: now
  }

  const pending: PendingAssistant = {
    messageId: randomUUID(),
    thinkingPartId: randomUUID(),
    textPartId: randomUUID()
  }
  const assistantMessage: MessageRecord = {
    id: pending.messageId,
    taskId: task.id,
    role: 'assistant',
    parts: [
      {
        id: pending.thinkingPartId,
        type: 'thinking',
        text: '',
        status: 'streaming'
      },
      { id: pending.textPartId, type: 'text', text: '' }
    ],
    createdAt: now,
    streaming: true
  }

  await store.appendMessage(task.id, userMessage)
  await store.appendMessage(task.id, assistantMessage)
  pendingAssistants.set(task.id, pending)
  emit({ type: 'message.updated', taskId: task.id, payload: userMessage })
  emit({ type: 'message.updated', taskId: task.id, payload: assistantMessage })
  await updateTaskAndEmit(task.id, {
    status: 'starting',
    model: input.model,
    effort: input.effort,
    permissionMode: input.permissionMode,
    error: undefined,
    title:
      task.messages.length === 0 && task.title === 'New task'
        ? titleFromPrompt(input.text)
        : task.title
  })

  const acp = await getManager()
  if (!connectedTasks.has(task.id)) {
    await acp.connect({
      taskId: task.id,
      cwd: project.path,
      executablePath: store.getSettings().grokPath || undefined,
      model: input.model || undefined,
      permissionMode: mapPermissionMode(input.permissionMode),
      existingSessionId: task.sessionId,
      rules: integrations.memoryRules(task.projectId),
      mcpServers: integrations.enabledMcpServers()
    })
    connectedTasks.add(task.id)
  }

  await acp.prompt({
    taskId: task.id,
    text: input.text,
    attachments: input.attachments
      .filter((attachment) => attachment.path)
      .map((attachment) => ({
        path: attachment.path!,
        name: attachment.name,
        mimeType: attachment.mimeType
      })),
    model: input.model || undefined,
    effort: input.effort
  })
}

function mapPermissionMode(mode: PermissionMode): 'ask' | 'auto-approve' {
  // ACP currently exposes a binary permission boundary. Keep accept-edits on the
  // safe side because it cannot distinguish a file edit from a shell command.
  return mode === 'full-access' ? 'auto-approve' : 'ask'
}

async function handleAcpEvent(event: GrokAcpEvent): Promise<void> {
  const taskId = event.taskId

  switch (event.type) {
    case 'status': {
      const status = event.payload.status
      const taskStatus: TaskRecord['status'] =
        status === 'starting'
          ? 'starting'
          : status === 'busy'
            ? 'running'
            : status === 'waiting-permission'
              ? 'waiting'
              : status === 'error'
                ? 'error'
                : status === 'stopped'
                  ? 'idle'
                  : 'running'
      await updateTaskAndEmit(taskId, {
        status: taskStatus,
        error: status === 'error' ? event.payload.detail : undefined
      })
      return
    }
    case 'ready':
      connectedTasks.add(taskId)
      availableModels = event.payload.models.map((model) => model.id)
      emit({ type: 'models.updated', payload: availableModels })
      await updateTaskAndEmit(taskId, {
        sessionId: event.payload.sessionId,
        sessionSource: 'desktop',
        model: event.payload.currentModelId
      })
      return
    case 'message-delta':
      await appendAssistantDelta(taskId, 'text', event.payload.text)
      return
    case 'thought-delta':
      await appendAssistantDelta(taskId, 'thinking', event.payload.text)
      return
    case 'tool-started':
    case 'tool-updated':
      await upsertToolPart(taskId, event.payload.tool)
      return
    case 'permission-request': {
      await updateTaskAndEmit(taskId, { status: 'waiting' })
      const permissionPayload = {
        id: event.payload.requestId,
        taskId,
        title: event.payload.summary || event.payload.toolName,
        description: event.payload.detail,
        tool: event.payload.toolName,
        options: event.payload.options.map((option) => ({
          id: option.optionId,
          label: option.name || option.kind || option.optionId,
          kind: permissionOptionKind(option.kind || option.optionId),
          dangerous: /deny|reject/i.test(option.kind || option.optionId)
        })),
        createdAt: new Date(event.timestamp).toISOString()
      }
      emit({
        type: 'permission.request',
        taskId,
        payload: permissionPayload
      })
      emit({
        type: 'inbox.updated',
        payload: await store.addInbox({
          sourceId: event.payload.requestId,
          taskId,
          sessionId: event.payload.sessionId,
          type: 'permission',
          title: permissionPayload.title,
          body: permissionPayload.description,
          createdAt: permissionPayload.createdAt
        })
      })
      notifyWhenBackground(
        'Grok needs approval',
        event.payload.summary || event.payload.toolName
      )
      return
    }
    case 'completed':
      await finishAssistant(taskId, 'completed')
      if (store.getTask(taskId)?.automationId) {
        const automation = integrations.getAutomation(
          store.getTask(taskId)!.automationId!
        )
        const inbox = await store.addInbox({
          sourceId: `automation-result:${taskId}`,
          taskId,
          sessionId: store.getTask(taskId)?.sessionId,
          type: 'automation',
          title: `Automation completed: ${automation?.name ?? store.getTask(taskId)?.title ?? 'Task'}`,
          body: 'Open the task to review the result.',
          createdAt: new Date(event.timestamp).toISOString()
        })
        emit({ type: 'inbox.updated', payload: inbox })
      }
      notifyWhenBackground(
        'Grok task completed',
        store.getTask(taskId)?.title ?? 'Your task is ready.'
      )
      return
    case 'cancelled':
      await finishAssistant(taskId, 'idle')
      return
    case 'error':
      await appendAssistantError(taskId, event.payload.message)
      await updateTaskAndEmit(taskId, {
        status: 'error',
        error: event.payload.message
      })
      emit({
        type: 'inbox.updated',
        payload: await store.addInbox({
          sourceId: `error:${taskId}:${event.timestamp}`,
          taskId,
          sessionId: store.getTask(taskId)?.sessionId,
          type: 'error',
          title: store.getTask(taskId)?.title ?? 'Grok task failed',
          body: event.payload.message,
          createdAt: new Date(event.timestamp).toISOString()
        })
      })
      emitError(taskId, event.payload.message)
      return
    case 'stderr':
      console.warn(`[grok:${taskId}] ${event.payload.line}`)
      return
    case 'plan':
      await updateTaskAndEmit(taskId, { plan: event.payload.steps })
      return
    case 'context-usage':
      await updateTaskAndEmit(taskId, {
        contextTokens: event.payload.usedTokens
      })
      return
    case 'goal-updated':
      await updateTaskAndEmit(taskId, { goal: event.payload })
      return
    case 'subagent-updated': {
      const task = store.getTask(taskId)
      if (!task) return
      const current = task.subagents ?? []
      const existing = current.find((entry) => entry.id === event.payload.id)
      const next = existing
        ? current.map((entry) =>
            entry.id === event.payload.id ? { ...entry, ...event.payload } : entry
          )
        : [...current, event.payload]
      await updateTaskAndEmit(taskId, { subagents: next })
      return
    }
    case 'background-task-updated': {
      const task = store.getTask(taskId)
      if (!task) return
      const current = task.backgroundTasks ?? []
      const existing = current.find((entry) => entry.id === event.payload.id)
      const merged = existing ? { ...existing, ...event.payload } : event.payload
      const next = existing
        ? current.map((entry) => (entry.id === event.payload.id ? merged : entry))
        : [...current, merged]
      await updateTaskAndEmit(taskId, { backgroundTasks: next })

      if (
        !event.payload.staleOnLoad &&
        (event.payload.phase === 'monitor' || event.payload.phase === 'completed')
      ) {
        const isMonitor = event.payload.phase === 'monitor' || merged.isMonitor
        const body =
          event.payload.eventText ??
          event.payload.output ??
          event.payload.description ??
          event.payload.command
        const inbox = await store.addInbox({
          sourceId: `${isMonitor ? 'monitor' : 'background'}:${taskId}:${event.payload.id}`,
          taskId,
          sessionId: task.sessionId,
          type: isMonitor ? 'monitor' : 'background_task',
          title: isMonitor
            ? event.payload.description ?? 'Monitor update'
            : `${event.payload.success === false ? 'Failed' : 'Completed'}: ${event.payload.command ?? event.payload.id}`,
          body,
          createdAt: event.payload.updatedAt
        })
        emit({ type: 'inbox.updated', payload: inbox })
        notifyWhenBackground(
          isMonitor ? 'Monitor update' : 'Background task completed',
          body ?? event.payload.id
        )
      }
      return
    }
    case 'notification':
      return
  }
}

async function appendAssistantDelta(
  taskId: string,
  type: 'text' | 'thinking',
  delta: string
): Promise<void> {
  if (!delta) return
  const pending = pendingAssistants.get(taskId)
  if (!pending) return
  const partId = type === 'text' ? pending.textPartId : pending.thinkingPartId

  await store.updateMessage(taskId, pending.messageId, (message) => {
    const part = message.parts.find((entry) => entry.id === partId)
    if (part?.type === type) part.text += delta
  })

  emit({
    type: 'message.delta',
    taskId,
    payload: {
      messageId: pending.messageId,
      partId,
      partType: type,
      delta
    }
  })
}

async function upsertToolPart(
  taskId: string,
  tool: Extract<GrokAcpEvent, { type: 'tool-started' }>['payload']['tool']
): Promise<void> {
  const pending = pendingAssistants.get(taskId)
  if (!pending) return

  const message = await store.updateMessage(taskId, pending.messageId, (entry) => {
    const existing = entry.parts.find((part) => part.id === tool.id)
    const part: MessagePartRecord = {
      id: tool.id,
      type: 'tool',
      title: tool.title,
      kind: tool.kind,
      status:
        tool.status === 'completed'
          ? 'success'
          : tool.status === 'failed' || tool.status === 'cancelled'
            ? 'error'
            : 'running',
      input: formatValue(tool.input),
      output: tool.output,
      completedAt:
        tool.status === 'completed' || tool.status === 'failed'
          ? new Date().toISOString()
          : undefined
    }

    if (existing) Object.assign(existing, part)
    else entry.parts.splice(Math.max(0, entry.parts.length - 1), 0, part)
  })
  emit({ type: 'message.updated', taskId, payload: message })
}

async function appendAssistantError(taskId: string, message: string): Promise<void> {
  const pending = pendingAssistants.get(taskId)
  if (!pending) return
  const updated = await store.updateMessage(taskId, pending.messageId, (entry) => {
    entry.streaming = false
    entry.parts.push({ id: randomUUID(), type: 'error', text: message })
  })
  emit({ type: 'message.updated', taskId, payload: updated })
  pendingAssistants.delete(taskId)
}

async function finishAssistant(
  taskId: string,
  taskStatus: 'completed' | 'idle'
): Promise<void> {
  const pending = pendingAssistants.get(taskId)
  if (pending) {
    const message = await store.updateMessage(taskId, pending.messageId, (entry) => {
      entry.streaming = false
      for (const part of entry.parts) {
        if (part.type === 'thinking') part.status = 'complete'
      }
    })
    emit({ type: 'message.updated', taskId, payload: message })
    pendingAssistants.delete(taskId)
  }
  await updateTaskAndEmit(taskId, { status: taskStatus })
}

async function updateTaskAndEmit(
  taskId: string,
  patch: Partial<Omit<TaskRecord, 'id' | 'projectId' | 'createdAt'>>
): Promise<TaskRecord> {
  const task = await store.updateTask(taskId, patch)
  emit({ type: 'task.updated', taskId, payload: task })
  return task
}

async function shutdownManager(): Promise<void> {
  removeManagerListener?.()
  removeManagerListener = undefined
  if (manager) await manager.shutdown().catch(console.error)
  manager = null
  connectedTasks.clear()
}

function parseSettingsPatch(input: unknown): Partial<AppSettingsRecord> {
  const record = expectRecord(input)
  const patch: Partial<AppSettingsRecord> = {}

  if ('grokPath' in record) {
    const grokPath = expectString(record.grokPath, 'grokPath', true).trim()
    if (grokPath && !isAbsolute(grokPath)) {
      throw new Error('grokPath must be an absolute path.')
    }
    patch.grokPath = grokPath
  }
  if ('defaultModel' in record) {
    patch.defaultModel = expectString(record.defaultModel, 'defaultModel').slice(0, 160)
  }
  if ('defaultEffort' in record) {
    patch.defaultEffort = expectEnum(
      record.defaultEffort,
      ['low', 'medium', 'high', 'max'],
      'defaultEffort'
    )
  }
  if ('defaultPermissionMode' in record) {
    patch.defaultPermissionMode = expectEnum(
      record.defaultPermissionMode,
      ['default', 'accept-edits', 'full-access'],
      'defaultPermissionMode'
    )
  }
  if ('theme' in record) {
    patch.theme = expectEnum(record.theme, ['system', 'light', 'dark'], 'theme')
  }
  if ('showActivityPanel' in record) {
    patch.showActivityPanel = expectBoolean(
      record.showActivityPanel,
      'showActivityPanel'
    )
  }
  if ('notifications' in record) {
    patch.notifications = expectBoolean(record.notifications, 'notifications')
  }
  return patch
}

function permissionOptionKind(
  value: string
): 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always' | undefined {
  const normalized = value.toLowerCase().replaceAll('-', '_')
  if (normalized.includes('allow') && normalized.includes('always')) return 'allow_always'
  if (normalized.includes('allow')) return 'allow_once'
  if ((normalized.includes('deny') || normalized.includes('reject')) && normalized.includes('always')) {
    return 'reject_always'
  }
  if (normalized.includes('deny') || normalized.includes('reject')) return 'reject_once'
  return undefined
}

function titleFromPrompt(prompt: string): string {
  const title = prompt.trim().replace(/\s+/g, ' ').slice(0, 54)
  return title || 'Attachment task'
}

function formatValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function expectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object.')
  }
  return value as Record<string, unknown>
}

function expectString(
  value: unknown,
  field: string,
  allowEmpty = false
): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw new Error(`${field} must be a string${allowEmpty ? '' : ' and cannot be empty'}.`)
  }
  return value
}

function optionalString(
  value: unknown,
  field: string,
  allowEmpty = false
): string | undefined {
  if (value === undefined || value === null) return undefined
  return expectString(value, field, allowEmpty)
}

function expectIdentifier(value: unknown, field: string): string {
  return expectString(value, field).slice(0, 200)
}

function expectBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean.`)
  return value
}

function expectEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${field} has an unsupported value.`)
  }
  return value as T[number]
}

function mimeTypeForPath(filePath: string): string {
  const extension = extname(filePath).toLowerCase()
  return {
    '.avif': 'image/avif',
    '.csv': 'text/csv',
    '.gif': 'image/gif',
    '.heic': 'image/heic',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.webp': 'image/webp'
  }[extension] ?? 'application/octet-stream'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function emitError(taskId: string | undefined, error: unknown): void {
  emit({
    type: 'error',
    taskId,
    payload: { message: errorMessage(error) }
  })
}

async function start(): Promise<void> {
  const userDataPath = app.getPath('userData')
  store = new DesktopStore(join(userDataPath, 'desktop-state.json'))
  await store.load()
  integrations = new IntegrationStore(join(userDataPath, 'integrations.json'))
  await integrations.load()
  sessionIndex = new SessionIndexService({
    metadataPath: join(userDataPath, 'session-meta.json')
  })
  nativeTheme.themeSource = store.getSettings().theme

  installApplicationMenu()
  registerIpc()

  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false)
  )

  await createWindow()
  startAutomationScheduler()
}

const ownsSingleInstance = app.requestSingleInstanceLock()
if (!ownsSingleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(start).catch((error) => {
    dialog.showErrorBox('Nolira Build could not start', errorMessage(error))
    app.quit()
  })
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (automationTimer) clearInterval(automationTimer)
  automationTimer = undefined
  void shutdownManager()
})
