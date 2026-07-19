import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Icon, type IconName } from "./icons"
import {
  DEFAULT_SETTINGS,
  type AgentEvent,
  type AppSettings,
  type AppSnapshot,
  type Attachment,
  type ChatMessage,
  type EffortLevel,
  type MessagePart,
  type PermissionMode,
  type PermissionRequest,
  type Project,
  type RuntimeStatus,
  type Task,
  type ToolPart,
} from "./types"

type Screen = "workspace" | "settings"
type SettingsSection = "general" | "runtime" | "appearance"

const SIDEBAR_MODES = [
  {
    value: "chat",
    label: "Grok",
    description: "Chat mode coming soon",
    disabled: true,
  },
  {
    value: "build",
    label: "Nolira Build",
    description: "Build, debug, and ship",
    disabled: false,
  },
] as const

const ACTIVE_SIDEBAR_MODE_INDEX = 1

const DEMO_DATE = "2026-07-20T09:30:00.000Z"

const demoSnapshot: AppSnapshot = {
  projects: [
    {
      id: "demo-project",
      name: "nolira-build",
      path: "/Users/you/Projects/nolira-build",
    },
    {
      id: "demo-api",
      name: "grok-api",
      path: "/Users/you/Projects/grok-api",
    },
  ],
  tasks: [
    {
      id: "demo-task",
      projectId: "demo-project",
      title: "Wire the Grok ACP runtime",
      status: "completed",
      model: "grok-4.5",
      effort: "high",
      permissionMode: "default",
      sessionId: "acp_demo_7f26",
      createdAt: DEMO_DATE,
      updatedAt: DEMO_DATE,
      messages: [
        {
          id: "demo-user",
          taskId: "demo-task",
          role: "user",
          createdAt: DEMO_DATE,
          parts: [
            {
              id: "demo-user-text",
              type: "text",
              text: "Review the desktop runtime and connect this workspace to Grok ACP.",
            },
          ],
        },
        {
          id: "demo-assistant",
          taskId: "demo-task",
          role: "assistant",
          createdAt: DEMO_DATE,
          parts: [
            {
              id: "demo-thinking",
              type: "thinking",
              status: "complete",
              text: "I’ll inspect the process boundary and verify how sessions, permissions, and streaming updates are represented.",
            },
            {
              id: "demo-tool",
              type: "tool",
              title: "Inspect workspace",
              kind: "terminal",
              status: "success",
              input: "rg --files apps/desktop | head",
              output:
                "apps/desktop/src/main/index.ts\napps/desktop/src/preload/index.ts\napps/desktop/src/renderer/App.tsx",
            },
            {
              id: "demo-answer",
              type: "text",
              text: "The Electron shell is ready to own the local workspace boundary. Grok runs as a child process over **ACP stdio**, while the renderer receives typed task, message, tool, and permission events through the preload bridge.\n\nThe UI stays provider-specific without leaking Node APIs into React.",
            },
          ],
        },
      ],
    },
    {
      id: "demo-task-2",
      projectId: "demo-project",
      title: "Polish empty state",
      status: "idle",
      model: "grok-4.5",
      effort: "medium",
      permissionMode: "accept-edits",
      createdAt: DEMO_DATE,
      updatedAt: DEMO_DATE,
      messages: [],
    },
    {
      id: "demo-task-3",
      projectId: "demo-api",
      title: "Trace streaming events",
      status: "running",
      model: "grok-4.5",
      effort: "high",
      permissionMode: "default",
      createdAt: DEMO_DATE,
      updatedAt: DEMO_DATE,
      messages: [],
    },
  ],
  activeTaskId: "demo-task",
  settings: DEFAULT_SETTINGS,
  runtime: {
    state: "offline",
    message: "Preview mode — Electron bridge unavailable",
  },
  models: ["grok-4.5"],
}

function upsertTask(tasks: Task[], next: Task) {
  const index = tasks.findIndex((task) => task.id === next.id)
  if (index === -1) return [next, ...tasks]
  return tasks.map((task) => (task.id === next.id ? next : task))
}

function upsertProject(projects: Project[], next: Project) {
  const index = projects.findIndex((project) => project.id === next.id)
  if (index === -1) return [next, ...projects]
  return projects.map((project) => (project.id === next.id ? next : project))
}

function upsertMessage(task: Task, message: ChatMessage): Task {
  const messages = task.messages ?? []
  const index = messages.findIndex((item) => item.id === message.id)
  const nextMessages =
    index === -1
      ? [...messages, message]
      : messages.map((item) => (item.id === message.id ? message : item))
  return { ...task, messages: nextMessages, updatedAt: message.createdAt }
}

function applyMessageDelta(
  task: Task,
  payload: Extract<AgentEvent, { type: "message.delta" }>['payload'],
): Task {
  const messages = [...(task.messages ?? [])]
  let messageIndex = messages.findIndex(
    (message) => message.id === payload.messageId,
  )

  if (messageIndex === -1) {
    messages.push({
      id: payload.messageId,
      taskId: task.id,
      role: "assistant",
      createdAt: new Date().toISOString(),
      streaming: true,
      parts: [],
    })
    messageIndex = messages.length - 1
  }

  const message = messages[messageIndex]!
  const parts = [...message.parts]
  const partIndex = parts.findIndex((part) => part.id === payload.partId)

  if (partIndex === -1) {
    if (payload.partType === "thinking") {
      parts.push({
        id: payload.partId,
        type: "thinking",
        text: payload.delta,
        status: "streaming",
      })
    } else {
      parts.push({
        id: payload.partId,
        type: "text",
        text: payload.delta,
      })
    }
  } else {
    const part = parts[partIndex]!
    if (part.type === "text" || part.type === "thinking") {
      parts[partIndex] = { ...part, text: part.text + payload.delta }
    }
  }

  messages[messageIndex] = { ...message, parts, streaming: true }
  return { ...task, messages, updatedAt: new Date().toISOString() }
}

function pathName(path: string) {
  const cleanPath = path.replace(/[\\/]+$/, "")
  return cleanPath.split(/[\\/]/).pop() || "Workspace"
}

function formatTime(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function formatBytes(size?: number) {
  if (!size) return ""
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function isMac(platform: string) {
  return platform === "darwin" || platform.toLowerCase().includes("mac")
}

function messageText(message: ChatMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
}

export function App() {
  const api = window.nolira
  const platform =
    api?.platform ??
    (navigator.userAgent.toLowerCase().includes("mac") ? "darwin" : "web")
  const [projects, setProjects] = useState<Project[]>(
    api ? [] : demoSnapshot.projects,
  )
  const [tasks, setTasks] = useState<Task[]>(api ? [] : demoSnapshot.tasks)
  const [settings, setSettings] = useState<AppSettings>(
    demoSnapshot.settings,
  )
  const [runtime, setRuntime] = useState<RuntimeStatus>(
    api ? { state: "checking" } : demoSnapshot.runtime,
  )
  const [models, setModels] = useState(api ? [] : (demoSnapshot.models ?? []))
  const [activeTaskId, setActiveTaskId] = useState<string | null>(
    api ? null : (demoSnapshot.activeTaskId ?? null),
  )
  const taskHistoryRef = useRef<string[]>([])
  const taskHistoryIndexRef = useRef(-1)
  const [taskHistoryState, setTaskHistoryState] = useState({
    canGoBack: false,
    canGoForward: false,
  })
  const [permission, setPermission] = useState<PermissionRequest | null>(null)
  const [screen, setScreen] = useState<Screen>("workspace")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activityOpen, setActivityOpen] = useState(false)
  const [loading, setLoading] = useState(Boolean(api))
  const [toast, setToast] = useState<string | null>(null)

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks],
  )
  const activeProject = useMemo(
    () =>
      projects.find((project) => project.id === activeTask?.projectId) ??
      projects[0] ??
      null,
    [activeTask?.projectId, projects],
  )

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const syncTaskHistoryState = useCallback(() => {
    const index = taskHistoryIndexRef.current
    const history = taskHistoryRef.current
    setTaskHistoryState({
      canGoBack: index > 0,
      canGoForward: index >= 0 && index < history.length - 1,
    })
  }, [])

  const recordTaskNavigation = useCallback(
    (taskId: string) => {
      const currentIndex = taskHistoryIndexRef.current
      const currentHistory = taskHistoryRef.current
      if (currentHistory[currentIndex] === taskId) return

      const nextHistory = currentHistory.slice(0, currentIndex + 1)
      nextHistory.push(taskId)
      taskHistoryRef.current = nextHistory.slice(-40)
      taskHistoryIndexRef.current = taskHistoryRef.current.length - 1
      syncTaskHistoryState()
    },
    [syncTaskHistoryState],
  )

  useEffect(() => {
    if (!activeTaskId || taskHistoryRef.current.length > 0) return
    taskHistoryRef.current = [activeTaskId]
    taskHistoryIndexRef.current = 0
    syncTaskHistoryState()
  }, [activeTaskId, syncTaskHistoryState])

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case "snapshot":
          setProjects(event.payload.projects)
          setTasks(event.payload.tasks)
          setSettings(event.payload.settings)
          setActivityOpen(event.payload.settings.showActivityPanel)
          setRuntime(event.payload.runtime)
          setModels(event.payload.models ?? [])
          setActiveTaskId(
            event.payload.activeTaskId ?? event.payload.tasks[0]?.id ?? null,
          )
          break
        case "workspace.updated":
          setProjects(event.payload)
          break
        case "task.updated":
          setTasks((current) => upsertTask(current, event.payload))
          break
        case "message.updated":
          setTasks((current) =>
            current.map((task) =>
              task.id === event.taskId
                ? upsertMessage(task, event.payload)
                : task,
            ),
          )
          break
        case "message.delta":
          setTasks((current) =>
            current.map((task) =>
              task.id === event.taskId
                ? applyMessageDelta(task, event.payload)
                : task,
            ),
          )
          break
        case "permission.request":
          setPermission(event.payload)
          recordTaskNavigation(event.taskId)
          setActiveTaskId(event.taskId)
          break
        case "permission.resolved":
          setPermission((current) =>
            current?.id === event.payload.requestId ? null : current,
          )
          break
        case "runtime.status":
          setRuntime(event.payload)
          break
        case "models.updated":
          setModels(event.payload)
          break
        case "error":
          showToast(event.payload.message)
          break
      }
    },
    [recordTaskNavigation, showToast],
  )

  useEffect(() => {
    if (!api) {
      setLoading(false)
      return
    }

    let alive = true
    const unsubscribe = api.onEvent(handleEvent)
    void api
      .bootstrap()
      .then((snapshot) => {
        if (!alive) return
        setProjects(snapshot.projects)
        setTasks(snapshot.tasks)
        setSettings(snapshot.settings)
        setActivityOpen(snapshot.settings.showActivityPanel)
        setRuntime(snapshot.runtime)
        setModels(snapshot.models ?? [])
        setActiveTaskId(
          snapshot.activeTaskId ?? snapshot.tasks[0]?.id ?? null,
        )
      })
      .catch((error: unknown) => {
        if (!alive) return
        setRuntime({
          state: "error",
          message: error instanceof Error ? error.message : "Startup failed",
        })
      })
      .finally(() => alive && setLoading(false))

    return () => {
      alive = false
      unsubscribe()
    }
  }, [api, handleEvent])

  useEffect(() => {
    const root = document.documentElement
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)")

    const applyTheme = () => {
      const dark =
        settings.theme === "dark" ||
        (settings.theme === "system" && systemDark.matches)
      root.dataset.theme = dark ? "dark" : "light"
    }

    applyTheme()
    systemDark.addEventListener("change", applyTheme)
    return () => systemDark.removeEventListener("change", applyTheme)
  }, [settings.theme])

  const selectTask = useCallback(
    async (taskId: string, recordHistory = true) => {
      if (recordHistory) recordTaskNavigation(taskId)
      setActiveTaskId(taskId)
      setScreen("workspace")
      if (window.innerWidth <= 780) setSidebarOpen(false)
      if (!api) return
      try {
        const task = await api.selectTask(taskId)
        if (task) setTasks((current) => upsertTask(current, task))
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not load task")
      }
    },
    [api, recordTaskNavigation, showToast],
  )

  const navigateTaskHistory = useCallback(
    (offset: -1 | 1) => {
      const nextIndex = taskHistoryIndexRef.current + offset
      const taskId = taskHistoryRef.current[nextIndex]
      if (!taskId) return

      taskHistoryIndexRef.current = nextIndex
      syncTaskHistoryState()
      void selectTask(taskId, false)
    },
    [selectTask, syncTaskHistoryState],
  )

  const addProject = useCallback(async () => {
    if (!api) {
      showToast("Workspace picker is available in the desktop app")
      return
    }
    try {
      const path = await api.chooseWorkspace()
      if (!path) return
      const project = await api.createProject({ path, name: pathName(path) })
      setProjects((current) => upsertProject(current, project))
      const task = await api.createTask({
        projectId: project.id,
        title: "New task",
      })
      setTasks((current) => upsertTask(current, task))
      await selectTask(task.id)
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not add workspace",
      )
    }
  }, [api, selectTask, showToast])

  const createTask = useCallback(
    async (projectId = activeProject?.id) => {
      if (!projectId) {
        await addProject()
        return null
      }

      if (!api) {
        const date = new Date().toISOString()
        const task: Task = {
          id: `preview-${Date.now()}`,
          projectId,
          title: "New task",
          status: "idle",
          messages: [],
          model: settings.defaultModel,
          effort: settings.defaultEffort,
          permissionMode: settings.defaultPermissionMode,
          createdAt: date,
          updatedAt: date,
        }
        setTasks((current) => [task, ...current])
        await selectTask(task.id)
        return task
      }

      try {
        const task = await api.createTask({ projectId, title: "New task" })
        setTasks((current) => upsertTask(current, task))
        await selectTask(task.id)
        return task
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not create task")
        return null
      }
    },
    [activeProject?.id, addProject, api, selectTask, settings, showToast],
  )

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const previous = settings
      const optimistic = { ...settings, ...patch }
      setSettings(optimistic)
      if (patch.showActivityPanel !== undefined) {
        setActivityOpen(patch.showActivityPanel)
      }
      if (!api) return
      try {
        const saved = await api.updateSettings(patch)
        setSettings(saved)
      } catch (error) {
        setSettings(previous)
        showToast(error instanceof Error ? error.message : "Could not save settings")
      }
    },
    [api, settings, showToast],
  )

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const command = isMac(platform) ? event.metaKey : event.ctrlKey
      if (!command) return
      if (event.key === "\\") {
        event.preventDefault()
        setSidebarOpen((open) => !open)
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault()
        void createTask()
      }
      if (event.key === ",") {
        event.preventDefault()
        setScreen("settings")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [createTask, platform])

  return (
    <div className="app-shell" data-platform={platform}>
      <WindowChrome platform={platform} />

      {sidebarOpen && (
        <Sidebar
          activeTaskId={activeTaskId}
          canGoBack={taskHistoryState.canGoBack}
          canGoForward={taskHistoryState.canGoForward}
          onAddProject={addProject}
          onCreateTask={createTask}
          onGoBack={() => navigateTaskHistory(-1)}
          onGoForward={() => navigateTaskHistory(1)}
          onOpenSettings={() => setScreen("settings")}
          onSelectTask={selectTask}
          onToggleSidebar={() => setSidebarOpen(false)}
          platform={platform}
          projects={projects}
          runtime={runtime}
          tasks={tasks}
        />
      )}

      <div className="workspace-shell">
        {screen === "settings" ? (
          <SettingsView
            onBack={() => setScreen("workspace")}
            onUpdate={updateSettings}
            platform={platform}
            runtime={runtime}
            settings={settings}
            sidebarOpen={sidebarOpen}
            toggleSidebar={() => setSidebarOpen((open) => !open)}
          />
        ) : (
          <div className="work-area" data-activity-open={activityOpen}>
            <div className="workspace-primary">
              <WorkspaceHeader
                activityOpen={activityOpen}
                onCreateTask={() => void createTask()}
                onToggleActivity={() => {
                  const next = !activityOpen
                  setActivityOpen(next)
                  void updateSettings({ showActivityPanel: next })
                }}
                onToggleSidebar={() => setSidebarOpen((open) => !open)}
                project={activeProject}
                sidebarOpen={sidebarOpen}
                task={activeTask}
              />
              <ChatWorkspace
                key={activeTask?.id ?? activeProject?.id ?? "new-workspace"}
                apiAvailable={Boolean(api)}
                models={models}
                onAddProject={addProject}
                onCreateTask={createTask}
                onSendError={showToast}
                project={activeProject}
                settings={settings}
                task={activeTask}
              />
            </div>
            {activityOpen && (
              <ActivityPanel
                onClose={() => {
                  setActivityOpen(false)
                  void updateSettings({ showActivityPanel: false })
                }}
                project={activeProject}
                runtime={runtime}
                task={activeTask}
              />
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="loading-cover">
          <BrandMark size={26} />
          <span>Opening workspace…</span>
        </div>
      )}
      {permission && (
        <PermissionDialog
          apiAvailable={Boolean(api)}
          onClose={() => setPermission(null)}
          onError={showToast}
          request={permission}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function WindowChrome({ platform }: { platform: string }) {
  const showControls = !isMac(platform) && platform !== "web"
  return (
    <div className="window-chrome">
      <div className="window-title" aria-hidden="true">
        Nolira Build
      </div>
      {showControls && (
        <div
          className="window-controls no-drag"
          role="group"
          aria-label="Window controls"
        >
          <button
            aria-label="Minimize window"
            onClick={() => window.nolira?.windowControl?.("minimize")}
          >
            <span className="window-minimize" />
          </button>
          <button
            aria-label="Maximize window"
            onClick={() => window.nolira?.windowControl?.("maximize")}
          >
            <span className="window-maximize" />
          </button>
          <button
            aria-label="Close window"
            className="window-close"
            onClick={() => window.nolira?.windowControl?.("close")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.2 14.15 9.85 21.8 12l-7.65 2.15L12 21.8l-2.15-7.65L2.2 12l7.65-2.15L12 2.2Z" />
        <circle cx="12" cy="12" r="2.2" />
      </svg>
    </span>
  )
}

interface SidebarProps {
  projects: Project[]
  tasks: Task[]
  activeTaskId: string | null
  canGoBack: boolean
  canGoForward: boolean
  runtime: RuntimeStatus
  platform: string
  onSelectTask: (id: string) => void
  onCreateTask: (projectId?: string) => void
  onGoBack: () => void
  onGoForward: () => void
  onAddProject: () => void
  onOpenSettings: () => void
  onToggleSidebar: () => void
}

function Sidebar({
  projects,
  tasks,
  activeTaskId,
  canGoBack,
  canGoForward,
  runtime,
  platform,
  onSelectTask,
  onCreateTask,
  onGoBack,
  onGoForward,
  onAddProject,
  onOpenSettings,
  onToggleSidebar,
}: SidebarProps) {
  const [query, setQuery] = useState("")
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeModeIndex, setActiveModeIndex] = useState(
    ACTIVE_SIDEBAR_MODE_INDEX,
  )
  const modePickerRef = useRef<HTMLDivElement>(null)
  const modeTriggerRef = useRef<HTMLButtonElement>(null)
  const modeOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const searchToggleRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const projectMap = new Map(projects.map((project) => [project.id, project]))
  const filteredTasks = [...tasks]
    .filter((task) => {
      if (!normalizedQuery) return true
      const project = projectMap.get(task.projectId)
      return `${task.title} ${project?.name ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery)
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )

  const selectedMode = SIDEBAR_MODES[ACTIVE_SIDEBAR_MODE_INDEX]

  const closeModeMenu = useCallback((restoreFocus = false) => {
    setModeMenuOpen(false)
    if (restoreFocus) {
      requestAnimationFrame(() => modeTriggerRef.current?.focus())
    }
  }, [])

  useEffect(() => {
    if (!modeMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!modePickerRef.current?.contains(event.target as Node)) {
        closeModeMenu()
      }
    }
    const handleWindowBlur = () => closeModeMenu()

    document.addEventListener("pointerdown", handlePointerDown, true)
    window.addEventListener("blur", handleWindowBlur)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true)
      window.removeEventListener("blur", handleWindowBlur)
    }
  }, [closeModeMenu, modeMenuOpen])

  useEffect(() => {
    if (!modeMenuOpen) return
    requestAnimationFrame(() =>
      modeOptionRefs.current[ACTIVE_SIDEBAR_MODE_INDEX]?.focus(),
    )
  }, [modeMenuOpen])

  useEffect(() => {
    if (!searchOpen) return
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [searchOpen])

  const openModeMenu = () => {
    closeSearch(false)
    setActiveModeIndex(ACTIVE_SIDEBAR_MODE_INDEX)
    setModeMenuOpen(true)
  }

  const selectMode = () => {
    closeModeMenu(true)
  }

  const closeSearch = (restoreFocus = true) => {
    setQuery("")
    setSearchOpen(false)
    if (restoreFocus) {
      requestAnimationFrame(() => searchToggleRef.current?.focus())
    }
  }

  const handleModeTriggerKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      openModeMenu()
    } else if (event.key === "Escape") {
      closeModeMenu()
    }
  }

  const handleModeMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      closeModeMenu(true)
      return
    }
    if (event.key === "Tab") {
      closeModeMenu()
      return
    }

    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return
    }

    event.preventDefault()
    setActiveModeIndex(ACTIVE_SIDEBAR_MODE_INDEX)
    requestAnimationFrame(() =>
      modeOptionRefs.current[ACTIVE_SIDEBAR_MODE_INDEX]?.focus(),
    )
  }

  return (
    <aside className="sidebar" data-mac={isMac(platform)}>
      <div className="sidebar-top drag-region">
        <div
          className="sidebar-chrome-actions no-drag"
          role="group"
          aria-label="Sidebar navigation"
        >
          <button
            type="button"
            className="icon-button sidebar-collapse"
            onClick={onToggleSidebar}
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <Icon name="layout-left" size={18} />
          </button>
          <button
            type="button"
            className="icon-button sidebar-history-button"
            onClick={onGoBack}
            aria-label="Go back"
            title={canGoBack ? "Previous workspace" : "No previous workspace"}
            disabled={!canGoBack}
          >
            <Icon name="chevron-left" size={18} />
          </button>
          <button
            type="button"
            className="icon-button sidebar-history-button"
            onClick={onGoForward}
            aria-label="Go forward"
            title={canGoForward ? "Next workspace" : "No next workspace"}
            disabled={!canGoForward}
          >
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
      </div>

      <div className="sidebar-mode-row drag-region">
        <div className="sidebar-mode-picker no-drag" ref={modePickerRef}>
          <button
            ref={modeTriggerRef}
            type="button"
            id="sidebar-mode-trigger"
            className={`sidebar-mode-trigger ${modeMenuOpen ? "open" : ""}`}
            aria-haspopup="menu"
            aria-expanded={modeMenuOpen}
            aria-controls="sidebar-mode-menu"
            onClick={() => {
              if (modeMenuOpen) closeModeMenu()
              else openModeMenu()
            }}
            onKeyDown={handleModeTriggerKeyDown}
          >
            <span>{selectedMode.label}</span>
            <Icon name="chevron-down" size={14} />
          </button>

          {modeMenuOpen && (
            <div
              id="sidebar-mode-menu"
              className="sidebar-mode-menu"
              role="menu"
              aria-labelledby="sidebar-mode-trigger"
              onKeyDown={handleModeMenuKeyDown}
            >
              {SIDEBAR_MODES.map((mode, index) => (
                <button
                  ref={(node) => {
                    modeOptionRefs.current[index] = node
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={index === ACTIVE_SIDEBAR_MODE_INDEX}
                  aria-disabled={mode.disabled}
                  disabled={mode.disabled}
                  tabIndex={
                    !mode.disabled && activeModeIndex === index ? 0 : -1
                  }
                  className={
                    index === ACTIVE_SIDEBAR_MODE_INDEX ? "selected" : ""
                  }
                  key={mode.value}
                  onClick={selectMode}
                >
                  <span className="sidebar-mode-option-copy">
                    <strong>{mode.label}</strong>
                    <small>{mode.description}</small>
                  </span>
                  {index === ACTIVE_SIDEBAR_MODE_INDEX && (
                    <Icon name="check" size={16} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          ref={searchToggleRef}
          type="button"
          className={`icon-button sidebar-search-toggle no-drag ${
            searchOpen ? "active" : ""
          }`}
          aria-label={searchOpen ? "Close workspace search" : "Search workspaces"}
          aria-controls="sidebar-search-panel"
          aria-expanded={searchOpen}
          title={searchOpen ? "Close search" : "Search workspaces"}
          onClick={() => {
            closeModeMenu()
            if (searchOpen) closeSearch(false)
            else setSearchOpen(true)
          }}
        >
          <Icon name="search" size={17} />
        </button>
      </div>

      <div className="sidebar-actions">
        {searchOpen && (
          <div className="sidebar-search" id="sidebar-search-panel">
            <Icon name="search" size={16} />
            <input
              ref={searchInputRef}
              aria-label="Search workspaces"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeSearch()
              }}
              placeholder="Search workspaces..."
              value={query}
            />
            <button
              type="button"
              className="sidebar-search-clear"
              onClick={() => closeSearch()}
              aria-label="Close workspace search"
              title="Close search"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
        <button
          type="button"
          className="new-task-button"
          onClick={() => onCreateTask()}
        >
          <Icon name="add" size={18} />
          <span>New Workspace</span>
          <kbd>{isMac(platform) ? "⌘N" : "Ctrl N"}</kbd>
        </button>
      </div>

      <div className="workspace-list">
        <div className="workspace-section-title">Workspaces</div>
        <div className="task-list">
          {filteredTasks.map((task) => {
            const project = projectMap.get(task.projectId)
            return (
              <button
                className={`task-row ${
                  task.id === activeTaskId ? "active" : ""
                }`}
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                aria-current={task.id === activeTaskId ? "page" : undefined}
                title={project?.path}
              >
                <span className="task-copy">
                  <span className="task-title">{task.title}</span>
                  <span className="task-meta">
                    <span>{project?.name ?? "Local project"}</span>
                    <span>•</span>
                    <span>{formatTime(task.updatedAt)}</span>
                  </span>
                </span>
                <StatusDot status={task.status} />
              </button>
            )
          })}
        </div>
        {filteredTasks.length === 0 && (
          <div className="sidebar-empty">
            <p>
              {projects.length === 0
                ? "Select a repository to start a workspace."
                : "No matching workspaces."}
            </p>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-footer-tools">
          <button
            className="icon-button"
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Settings"
          >
            <Icon name="gear" size={18} />
            <RuntimeDot runtime={runtime} />
          </button>
        </div>
        <button className="sidebar-footer-button" onClick={onAddProject}>
          <span>Add repository</span>
        </button>
      </div>
    </aside>
  )
}

function StatusDot({ status }: { status: Task["status"] }) {
  return (
    <span className={`status-dot status-${status}`}>
      {status === "completed" && <Icon name="check" size={9} />}
      {(status === "running" || status === "starting") && (
        <span className="status-pulse" />
      )}
      {status === "waiting" && <span>!</span>}
    </span>
  )
}

function RuntimeDot({ runtime }: { runtime: RuntimeStatus }) {
  return (
    <span
      className={`runtime-dot runtime-${runtime.state}`}
      title={runtime.message ?? runtime.state}
    />
  )
}

interface WorkspaceHeaderProps {
  task: Task | null
  project: Project | null
  sidebarOpen: boolean
  activityOpen: boolean
  onToggleSidebar: () => void
  onToggleActivity: () => void
  onCreateTask: () => void
}

function WorkspaceHeader({
  task,
  project,
  sidebarOpen,
  activityOpen,
  onToggleSidebar,
  onToggleActivity,
  onCreateTask,
}: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header drag-region">
      <div className="header-left no-drag">
        {!sidebarOpen && (
          <button
            className="icon-button sidebar-toggle-open"
            onClick={onToggleSidebar}
            aria-label="Open sidebar"
          >
            <Icon name="layout-left" size={18} />
          </button>
        )}
        <div className="chat-tabs" role="tablist" aria-label="Open chats">
          {task && (
            <button
              type="button"
              className="chat-tab active"
              role="tab"
              aria-selected="true"
              title={project?.path ?? task.title}
            >
              <BrandMark size={15} />
              <span>{task.title || "New Chat"}</span>
            </button>
          )}
          <button
            className="icon-button add-chat-tab"
            onClick={onCreateTask}
            aria-label="New chat"
            title="New chat"
          >
            <Icon name="add" size={18} />
          </button>
        </div>
      </div>
      <div className="header-actions no-drag">
        {task?.status && task.status !== "idle" && (
          <span
            className={`header-task-status status-chip-${task.status}`}
            title={task.status === "waiting" ? "Needs approval" : task.status}
          >
            <StatusDot status={task.status} />
          </span>
        )}
        {!activityOpen && (
          <button
            className="icon-button"
            onClick={onToggleActivity}
            aria-label="Open details panel"
            aria-controls="activity-panel"
            aria-expanded="false"
          >
            <Icon name="layout-right" size={18} />
          </button>
        )}
      </div>
    </header>
  )
}

interface ChatWorkspaceProps {
  task: Task | null
  project: Project | null
  settings: AppSettings
  models: string[]
  apiAvailable: boolean
  onAddProject: () => void
  onCreateTask: (projectId?: string) => Promise<Task | null>
  onSendError: (message: string) => void
}

function ChatWorkspace({
  task,
  project,
  settings,
  models,
  apiAvailable,
  onAddProject,
  onCreateTask,
  onSendError,
}: ChatWorkspaceProps) {
  const [text, setText] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [model, setModel] = useState(task?.model ?? settings.defaultModel)
  const [effort, setEffort] = useState<EffortLevel>(
    task?.effort ?? settings.defaultEffort,
  )
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    task?.permissionMode ?? settings.defaultPermissionMode,
  )
  const [sending, setSending] = useState(false)
  const [previewMessages, setPreviewMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const messages = apiAvailable
    ? (task?.messages ?? [])
    : [...(task?.messages ?? []), ...previewMessages]
  const busy =
    sending || task?.status === "running" || task?.status === "starting"

  useEffect(() => {
    setModel(task?.model ?? settings.defaultModel)
    setEffort(task?.effort ?? settings.defaultEffort)
    setPermissionMode(
      task?.permissionMode ?? settings.defaultPermissionMode,
    )
    setPreviewMessages([])
  }, [task?.id, task?.model, task?.effort, task?.permissionMode, settings])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" })
  }, [messages.length, task?.updatedAt])

  useEffect(() => {
    const area = textareaRef.current
    if (!area) return
    area.style.height = "0px"
    area.style.height = `${Math.min(area.scrollHeight, 180)}px`
  }, [text])

  const addAttachments = async () => {
    if (!window.nolira) {
      onSendError("File attachments are available in the desktop app")
      return
    }
    try {
      const files = await window.nolira.pickAttachments()
      setAttachments((current) => [...current, ...files])
    } catch (error) {
      onSendError(error instanceof Error ? error.message : "Could not attach file")
    }
  }

  const send = async () => {
    const value = text.trim()
    if ((!value && attachments.length === 0) || sending) return
    let targetTask = task
    if (!targetTask) targetTask = await onCreateTask()
    if (!targetTask) return

    setSending(true)
    setText("")
    const selectedAttachments = attachments
    setAttachments([])

    if (!window.nolira) {
      const now = new Date().toISOString()
      const userMessage: ChatMessage = {
        id: `preview-user-${Date.now()}`,
        taskId: targetTask.id,
        role: "user",
        createdAt: now,
        attachments: selectedAttachments,
        parts: [{ id: `preview-text-${Date.now()}`, type: "text", text: value }],
      }
      setPreviewMessages((current) => [...current, userMessage])
      window.setTimeout(() => {
        setPreviewMessages((current) => [
          ...current,
          {
            id: `preview-assistant-${Date.now()}`,
            taskId: targetTask!.id,
            role: "assistant",
            createdAt: new Date().toISOString(),
            parts: [
              {
                id: `preview-response-${Date.now()}`,
                type: "text",
                text: "This is the renderer preview. Start the Electron app to send this prompt through Grok ACP.",
              },
            ],
          },
        ])
        setSending(false)
      }, 450)
      return
    }

    try {
      await window.nolira.sendPrompt({
        taskId: targetTask.id,
        text: value,
        attachments: selectedAttachments,
        model,
        effort,
        permissionMode,
      })
    } catch (error) {
      setText(value)
      setAttachments(selectedAttachments)
      onSendError(error instanceof Error ? error.message : "Prompt failed")
    } finally {
      setSending(false)
    }
  }

  const cancel = async () => {
    if (!task || !window.nolira) return
    try {
      await window.nolira.cancelTask(task.id)
    } catch (error) {
      onSendError(error instanceof Error ? error.message : "Could not stop task")
    }
  }

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const command = isMac(window.nolira?.platform ?? "")
      ? event.metaKey
      : event.ctrlKey
    if (event.key === "Enter" && command) {
      event.preventDefault()
      void send()
    }
  }

  const uniqueModels = Array.from(
    new Set([model, settings.defaultModel, ...models].filter(Boolean)),
  )

  const composer = (
    <div className={`composer ${busy ? "is-busy" : ""}`}>
      {attachments.length > 0 && (
        <div className="attachment-list">
          {attachments.map((attachment, index) => (
            <div className="attachment-chip" key={`${attachment.path}-${index}`}>
              <span className="attachment-preview">
                <Icon
                  name={attachment.mimeType?.startsWith("image/") ? "image" : "code"}
                  size={15}
                />
              </span>
              <span className="attachment-name">
                {attachment.name}
                {attachment.size && <small>{formatBytes(attachment.size)}</small>}
              </span>
              <button
                aria-label={`Remove ${attachment.name}`}
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        aria-label="Message Grok"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onComposerKeyDown}
        placeholder="Plan, add context, or ask Grok anything"
        rows={1}
        value={text}
      />
      <div className="composer-toolbar">
        <div className="composer-tools">
          <SelectControl
            ariaLabel="Permission mode"
            className="composer-mode"
            compact
            onChange={(value) => setPermissionMode(value as PermissionMode)}
            options={[
              { value: "default", label: "Agent" },
              { value: "accept-edits", label: "Auto edit" },
              { value: "full-access", label: "Full access" },
            ]}
            value={permissionMode}
          />
          <SelectControl
            ariaLabel="Model"
            className="composer-model"
            compact
            onChange={setModel}
            options={uniqueModels.map((value) => ({ value, label: value }))}
            value={model}
          />
          <SelectControl
            ariaLabel="Reasoning effort"
            className="composer-effort"
            compact
            onChange={(value) => setEffort(value as EffortLevel)}
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "max", label: "Max" },
            ]}
            value={effort}
          />
        </div>
        <div className="composer-actions">
          <button
            className="composer-icon-button"
            onClick={addAttachments}
            aria-label="Attach files"
            title="Attach files"
          >
            <Icon name="attachment" size={18} />
          </button>
          {busy ? (
            <button
              className="send-button stop-button"
              aria-label="Stop Grok"
              onClick={cancel}
            >
              <Icon name="stop" size={16} />
            </button>
          ) : (
            <button
              className="send-button"
              aria-label="Send prompt"
              disabled={!text.trim() && attachments.length === 0}
              onClick={send}
            >
              <Icon name="arrow-up" size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <main
      className={`chat-workspace ${messages.length === 0 ? "new-workspace" : ""}`}
    >
      {messages.length === 0 ? (
        <div className="new-workspace-stage">
          {project ? (
            <>
              <h2>What do you want to get done?</h2>
              <div className="new-workspace-composer">{composer}</div>
              <div className="new-workspace-context">
                <span>
                  <Icon name="code" size={13} />
                  {project.name}
                </span>
                <span>
                  <Icon name="folder" size={13} />
                  Local
                </span>
              </div>
            </>
          ) : (
            <button className="select-repo-button" onClick={onAddProject}>
              Select repo
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="messages-scroll" ref={scrollRef}>
            <div className="messages-column">
              <div className="conversation-title">
                <h1>{task?.title || "New Chat"}</h1>
                {project && <span>{project.name} • local</span>}
              </div>
              {messages.map((message) => (
                <MessageView key={message.id} message={message} />
              ))}
              {busy && (
                <div className="agent-working">
                  <span className="thinking-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>Grok is working</span>
                </div>
              )}
            </div>
          </div>
          <div className="composer-wrap">{composer}</div>
        </>
      )}
    </main>
  )
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    return (
      <div className="system-message">
        <Icon name="info" size={13} />
        <RichText text={messageText(message)} />
      </div>
    )
  }

  if (message.role === "user") {
    return (
      <article className="message user-message">
        {message.attachments && message.attachments.length > 0 && (
          <div className="message-attachments">
            {message.attachments.map((attachment, index) => (
              <span key={`${attachment.path}-${index}`}>
                <Icon
                  name={attachment.mimeType?.startsWith("image/") ? "image" : "attachment"}
                  size={13}
                />
                {attachment.name}
              </span>
            ))}
          </div>
        )}
        <div className="user-bubble">
          {message.parts.map((part) =>
            part.type === "text" ? (
              <RichText key={part.id} text={part.text} />
            ) : null,
          )}
        </div>
        <time>{formatTime(message.createdAt)}</time>
      </article>
    )
  }

  return (
    <article className="message assistant-message">
      <div className="assistant-gutter">
        <BrandMark size={19} />
      </div>
      <div className="assistant-content">
        {message.parts.map((part) => (
          <MessagePartView key={part.id} part={part} />
        ))}
        {message.streaming && <span className="streaming-cursor" />}
      </div>
    </article>
  )
}

function MessagePartView({ part }: { part: MessagePart }) {
  if (part.type === "text") return <RichText text={part.text} />
  if (part.type === "thinking") {
    return (
      <details
        className="thinking-card"
        open={part.status === "streaming" ? true : undefined}
      >
        <summary>
          <span className="thinking-icon">
            <Icon name="brain" size={16} />
          </span>
          <span>
            {part.status === "streaming" ? "Grok is reasoning" : "Reasoning"}
          </span>
          {part.status === "streaming" && <span className="mini-spinner" />}
          <Icon name="chevron-down" size={14} className="details-chevron" />
        </summary>
        <div className="thinking-content">
          <RichText text={part.text} />
        </div>
      </details>
    )
  }
  if (part.type === "tool") return <ToolCard tool={part} />
  return (
    <div className="error-card">
      <Icon name="warning" size={18} />
      <div>
        <strong>{part.title ?? "Agent error"}</strong>
        <p>{part.text}</p>
      </div>
    </div>
  )
}

function ToolCard({ tool }: { tool: ToolPart }) {
  const icon: IconName =
    tool.kind === "terminal" || tool.kind === "shell" ? "terminal" : "code"
  return (
    <details
      className={`tool-card tool-${tool.status}`}
      open={tool.status === "running" || tool.status === "error" ? true : undefined}
    >
      <summary>
        <span className="tool-icon">
          <Icon name={icon} size={16} />
        </span>
        <span className="tool-summary-text">
          <strong>{tool.title}</strong>
          {tool.description && <small>{tool.description}</small>}
        </span>
        <ToolStatus status={tool.status} />
        <Icon name="chevron-down" size={14} className="details-chevron" />
      </summary>
      {(tool.input || tool.output) && (
        <div className="tool-body">
          {tool.input && (
            <div className="tool-block">
              <span>Input</span>
              <pre>{tool.input}</pre>
            </div>
          )}
          {tool.output && (
            <div className="tool-block">
              <span>Output</span>
              <pre>{tool.output}</pre>
            </div>
          )}
        </div>
      )}
    </details>
  )
}

function ToolStatus({ status }: { status: ToolPart["status"] }) {
  if (status === "running") return <span className="mini-spinner" />
  if (status === "success") {
    return (
      <span className="tool-status success">
        <Icon name="check" size={12} />
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="tool-status error">
        <Icon name="close" size={12} />
      </span>
    )
  }
  return <span className="tool-status pending" />
}

function RichText({ text }: { text: string }) {
  if (!text) return null
  return (
    <div className="rich-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) =>
            href && /^https?:\/\//i.test(href) ? (
              <a
                {...props}
                href={href}
                rel="noreferrer noopener"
                target="_blank"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          pre: ({ children }) => (
            <div className="code-block">
              <pre>{children}</pre>
            </div>
          ),
          img: ({ alt }) => <span className="markdown-image-label">{alt}</span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

interface SelectControlProps {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  compact?: boolean
  prefix?: string
}

function SelectControl({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  compact,
  prefix,
}: SelectControlProps) {
  return (
    <label
      className={`select-control ${compact ? "compact" : ""} ${className}`}
    >
      {prefix && <span>{prefix}</span>}
      <select
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={14} />
    </label>
  )
}

interface ActivityPanelProps {
  task: Task | null
  project: Project | null
  runtime: RuntimeStatus
  onClose: () => void
}

function ActivityPanel({ task, project, runtime, onClose }: ActivityPanelProps) {
  const [tab, setTab] = useState<"activity" | "info">("activity")
  const plan = task?.plan ?? []
  const tools = useMemo(
    () =>
      (task?.messages ?? []).flatMap((message) =>
        message.parts.filter((part): part is ToolPart => part.type === "tool"),
      ),
    [task?.messages],
  )

  return (
    <aside className="activity-panel" id="activity-panel">
      <div className="panel-header drag-region">
        <div
          className="panel-tabs no-drag"
          role="tablist"
          aria-label="Details panel sections"
        >
          <button
            className={tab === "activity" ? "active" : ""}
            onClick={() => setTab("activity")}
            id="activity-details-tab"
            role="tab"
            aria-controls="activity-details-panel"
            aria-selected={tab === "activity"}
          >
            Details
          </button>
          <button
            className={tab === "info" ? "active" : ""}
            onClick={() => setTab("info")}
            id="activity-info-tab"
            role="tab"
            aria-controls="activity-info-panel"
            aria-selected={tab === "info"}
          >
            Info
          </button>
        </div>
        <button
          className="icon-button no-drag"
          onClick={onClose}
          aria-label="Close details panel"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {tab === "activity" ? (
        <div
          className="activity-content"
          id="activity-details-panel"
          role="tabpanel"
          aria-labelledby="activity-details-tab"
        >
          {plan.length > 0 || tools.length > 0 ? (
            <>
              {plan.length > 0 && (
                <div className="activity-plan">
                  <span className="eyebrow">Plan</span>
                  <ol>
                    {plan.map((step, index) => (
                      <li key={`${index}-${step}`}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
              {tools.length > 0 && (
                <div className="activity-timeline">
                  {tools.map((tool) => (
                    <div className="activity-item" key={tool.id}>
                      <span className={`timeline-node node-${tool.status}`}>
                        {tool.status === "success" ? (
                          <Icon name="check" size={11} />
                        ) : (
                          <Icon name={tool.kind === "terminal" ? "terminal" : "code"} size={13} />
                        )}
                      </span>
                      <div>
                        <strong>{tool.title}</strong>
                        {tool.description && <p>{tool.description}</p>}
                        <small>{tool.status}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <PanelEmpty
              icon="activity"
              title="No activity yet"
              text="Tool calls and workspace actions will appear here."
            />
          )}
        </div>
      ) : (
        <div
          className="task-info-content"
          id="activity-info-panel"
          role="tabpanel"
          aria-labelledby="activity-info-tab"
        >
          <InfoRow label="Status">
            {task ? (
              <span className="inline-status"><StatusDot status={task.status} />{task.status}</span>
            ) : "—"}
          </InfoRow>
          <InfoRow label="Workspace">{project?.name ?? "—"}</InfoRow>
          <InfoRow label="Model">{task?.model ?? "—"}</InfoRow>
          <InfoRow label="Effort">{task?.effort ?? "—"}</InfoRow>
          <InfoRow label="Permissions">
            {task?.permissionMode ?? "—"}
          </InfoRow>
          <InfoRow label="Session">
            <code>{task?.sessionId ?? "Not started"}</code>
          </InfoRow>
          <InfoRow label="Context">
            {task?.contextTokens
              ? `${task.contextTokens.toLocaleString()} tokens`
              : "—"}
          </InfoRow>
          <div className="info-section-title">Runtime</div>
          <InfoRow label="Grok">
            <span className="inline-status">
              <RuntimeDot runtime={runtime} />
              {runtime.version ?? runtime.state}
            </span>
          </InfoRow>
          {runtime.binaryPath && (
            <button
              className="runtime-path"
              onClick={() => window.nolira?.openPath(runtime.binaryPath!)}
              title={runtime.binaryPath}
            >
              <Icon name="terminal" size={15} />
              <span>{runtime.binaryPath}</span>
            </button>
          )}
        </div>
      )}
    </aside>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  )
}

function PanelEmpty({
  icon,
  title,
  text,
}: {
  icon: IconName
  title: string
  text: string
}) {
  return (
    <div className="panel-empty">
      <Icon name={icon} size={24} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}

interface SettingsViewProps {
  settings: AppSettings
  runtime: RuntimeStatus
  platform: string
  sidebarOpen: boolean
  onBack: () => void
  toggleSidebar: () => void
  onUpdate: (patch: Partial<AppSettings>) => void
}

function SettingsView({
  settings,
  runtime,
  sidebarOpen,
  onBack,
  toggleSidebar,
  onUpdate,
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>("general")
  const [grokPath, setGrokPath] = useState(settings.grokPath)

  useEffect(() => setGrokPath(settings.grokPath), [settings.grokPath])

  const sections: Array<{
    id: SettingsSection
    label: string
    icon: IconName
  }> = [
    { id: "general", label: "General", icon: "gear" },
    { id: "runtime", label: "Grok runtime", icon: "terminal" },
    { id: "appearance", label: "Appearance", icon: "spark" },
  ]

  return (
    <div className="settings-screen">
      <header className="settings-header drag-region">
        <div className="no-drag settings-header-actions">
          {!sidebarOpen && (
            <button
              className="icon-button sidebar-toggle-open"
              onClick={toggleSidebar}
              aria-label="Open sidebar"
            >
              <Icon name="layout-left" size={18} />
            </button>
          )}
          <button className="back-button" onClick={onBack}>
            <Icon name="chevron-left" size={16} />
            Workspace
          </button>
        </div>
        <h1>Settings</h1>
      </header>
      <div className="settings-layout">
        <nav className="settings-nav">
          {sections.map((item) => (
            <button
              className={section === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setSection(item.id)}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {section === "general" && (
            <SettingsSectionView
              title="General"
              description="Defaults for new Grok tasks in every workspace."
            >
              <SettingRow
                title="Default model"
                description="The ACP model selected when a task starts."
              >
                <input
                  className="settings-input short"
                  value={settings.defaultModel}
                  onChange={(event) =>
                    onUpdate({ defaultModel: event.target.value })
                  }
                />
              </SettingRow>
              <SettingRow
                title="Reasoning effort"
                description="Higher effort can improve complex coding work."
              >
                <SelectControl
                  ariaLabel="Default reasoning effort"
                  onChange={(value) =>
                    onUpdate({ defaultEffort: value as EffortLevel })
                  }
                  options={[
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                    { value: "max", label: "Max" },
                  ]}
                  value={settings.defaultEffort}
                />
              </SettingRow>
              <SettingRow
                title="Permission mode"
                description="Controls when Grok asks before using workspace tools."
              >
                <SelectControl
                  ariaLabel="Default permission mode"
                  onChange={(value) =>
                    onUpdate({ defaultPermissionMode: value as PermissionMode })
                  }
                  options={[
                    { value: "default", label: "Ask every time" },
                    { value: "accept-edits", label: "Accept edits" },
                    { value: "full-access", label: "Full access" },
                  ]}
                  value={settings.defaultPermissionMode}
                />
              </SettingRow>
              <SettingRow
                title="Notifications"
                description="Notify when a background task completes or needs approval."
              >
                <Toggle
                  checked={settings.notifications}
                  onChange={(checked) => onUpdate({ notifications: checked })}
                />
              </SettingRow>
            </SettingsSectionView>
          )}

          {section === "runtime" && (
            <SettingsSectionView
              title="Grok runtime"
              description="Nolira Build starts Grok locally and communicates over ACP stdio."
            >
              <div className={`runtime-card runtime-card-${runtime.state}`}>
                <span className="runtime-card-icon">
                  <Icon name="terminal" size={20} />
                </span>
                <div>
                  <strong>
                    {runtime.state === "ready"
                      ? runtime.version
                        ? runtime.version.replace(/^grok\b/i, "Grok")
                        : "Grok is ready"
                      : runtime.state === "checking"
                        ? "Checking Grok…"
                        : "Grok is unavailable"}
                  </strong>
                  <p>{runtime.message ?? "Local ACP runtime"}</p>
                </div>
                <RuntimeDot runtime={runtime} />
              </div>
              <SettingRow
                title="Grok executable"
                description="Leave empty to discover Grok from the bundled runtime or PATH."
                vertical
              >
                <div className="path-input-wrap">
                  <Icon name="terminal" size={16} />
                  <input
                    className="settings-input"
                    onBlur={() => onUpdate({ grokPath })}
                    onChange={(event) => setGrokPath(event.target.value)}
                    placeholder="Auto-detect"
                    value={grokPath}
                  />
                </div>
              </SettingRow>
              <div className="settings-note">
                <Icon name="info" size={16} />
                <p>
                  The renderer never receives shell access or Node.js APIs. Files,
                  sessions, and permission decisions cross the isolated preload bridge.
                </p>
              </div>
            </SettingsSectionView>
          )}

          {section === "appearance" && (
            <SettingsSectionView
              title="Appearance"
              description="Match the desktop or choose a fixed theme."
            >
              <SettingRow title="Theme" description="Used across every workspace.">
                <div className="theme-picker">
                  {(["system", "light", "dark"] as const).map((theme) => (
                    <button
                      className={settings.theme === theme ? "active" : ""}
                      key={theme}
                      onClick={() => onUpdate({ theme })}
                    >
                      <span className={`theme-preview theme-${theme}`}>
                        <i />
                        <b />
                      </span>
                      {theme.charAt(0).toUpperCase() + theme.slice(1)}
                    </button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow
                title="Activity panel"
                description="Show tool calls beside the conversation by default."
              >
                <Toggle
                  checked={settings.showActivityPanel}
                  onChange={(checked) =>
                    onUpdate({ showActivityPanel: checked })
                  }
                />
              </SettingRow>
            </SettingsSectionView>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingsSectionView({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="settings-card">{children}</div>
    </section>
  )
}

function SettingRow({
  title,
  description,
  children,
  vertical,
}: {
  title: string
  description: string
  children: ReactNode
  vertical?: boolean
}) {
  return (
    <div className={`setting-row ${vertical ? "vertical" : ""}`}>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      aria-checked={checked}
      className={`toggle ${checked ? "checked" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
    >
      <span />
    </button>
  )
}

interface PermissionDialogProps {
  request: PermissionRequest
  apiAvailable: boolean
  onClose: () => void
  onError: (message: string) => void
}

function PermissionDialog({
  request,
  apiAvailable,
  onClose,
  onError,
}: PermissionDialogProps) {
  const [submitting, setSubmitting] = useState<string | null>(null)

  const respond = async (optionId: string) => {
    setSubmitting(optionId)
    if (!window.nolira) {
      window.setTimeout(onClose, 250)
      return
    }
    try {
      await window.nolira.respondPermission({
        requestId: request.id,
        optionId,
      })
      onClose()
    } catch (error) {
      onError(error instanceof Error ? error.message : "Permission response failed")
      setSubmitting(null)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        aria-describedby="permission-description"
        aria-labelledby="permission-title"
        aria-modal="true"
        className="permission-dialog"
        role="dialog"
      >
        <div className="permission-heading">
          <span className="permission-icon">
            <Icon name="warning" size={19} />
          </span>
          <div>
            <span className="eyebrow">Permission request</span>
            <h2 id="permission-title">{request.title}</h2>
          </div>
        </div>
        <p id="permission-description" className="permission-description">
          {request.description ??
            "Grok needs your approval before it can continue this action."}
        </p>
        {(request.tool || request.command) && (
          <div className="permission-command">
            <div>
              <Icon name="terminal" size={13} />
              <span>{request.tool ?? "Command"}</span>
            </div>
            {request.command && <pre>{request.command}</pre>}
          </div>
        )}
        <div className="permission-options">
          {request.options.map((option) => (
            <button
              className={`${option.dangerous ? "danger" : ""} ${
                option.kind?.startsWith("allow") ? "allow" : ""
              }`}
              disabled={Boolean(submitting)}
              key={option.id}
              onClick={() => respond(option.id)}
            >
              <span>
                <strong>{option.label}</strong>
                {option.description && <small>{option.description}</small>}
              </span>
              {submitting === option.id ? (
                <span className="mini-spinner" />
              ) : (
                <Icon name="chevron-right" size={13} />
              )}
            </button>
          ))}
          {!apiAvailable && (
            <button onClick={onClose}>
              <span><strong>Close preview</strong></span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
