import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
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
  type AutomationDefinition,
  type ChatMessage,
  type EffortLevel,
  type InboxItem,
  type McpServerConfig,
  type MessagePart,
  type PermissionMode,
  type PermissionRequest,
  type Project,
  type ProviderSummary,
  type RuntimeStatus,
  type SkillSummary,
  type Task,
  type ToolPart,
  type WorkspaceChange,
  type WorkspaceDiff,
  type WorkspaceFile,
  type WorkspaceFileContent,
  type WorkspaceMemory,
} from "./types"

type Screen = "workspace" | "settings" | "inbox"
type SettingsSection = "general" | "runtime" | "appearance" | "integrations"

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

interface ComposerCommand {
  name: string
  description: string
  prompt: string
}

const COMPOSER_COMMANDS: ComposerCommand[] = [
  {
    name: "plan",
    description: "Plan the work before editing",
    prompt:
      "Create a concise implementation plan first. Do not modify files until I approve the plan. ",
  },
  {
    name: "review",
    description: "Review the current changes",
    prompt:
      "Review the current changes for correctness, regressions, security issues, and missing tests. Lead with actionable findings. ",
  },
  {
    name: "test",
    description: "Run the relevant checks",
    prompt:
      "Run the relevant tests and checks for this change. Diagnose any failures and report the exact verification performed. ",
  },
  {
    name: "fix",
    description: "Diagnose and implement a fix",
    prompt:
      "Diagnose the root cause, implement the smallest complete fix, and verify it with relevant tests. ",
  },
  {
    name: "explain",
    description: "Explain selected code or behavior",
    prompt:
      "Explain this clearly, including the important control flow, assumptions, and likely pitfalls. ",
  },
  {
    name: "init",
    description: "Orient to this repository",
    prompt:
      "Inspect this repository and summarize its architecture, development workflow, and the safest place to make the requested change. ",
  },
  {
    name: "goal",
    description: "Create a persistent execution goal",
    prompt:
      "Create a persistent goal for the following objective and keep working toward it across turns until it is complete or genuinely blocked: ",
  },
  {
    name: "monitor",
    description: "Run and monitor a background check",
    prompt:
      "Start the following check as a background monitor. Report meaningful state changes and wake this session when attention is needed: ",
  },
]

type ComposerTrigger = {
  marker: "@" | "/"
  query: string
  start: number
  end: number
}

type ComposerSuggestion =
  | { id: string; kind: "file"; file: WorkspaceFile }
  | { id: string; kind: "command"; command: ComposerCommand }
  | { id: string; kind: "skill"; skill: SkillSummary }

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

function formatDuration(milliseconds: number) {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1_000)} sec`
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = Math.round((milliseconds % 60_000) / 1_000)
  return seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} min`
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

function composerTriggerAt(text: string, cursor: number): ComposerTrigger | null {
  const beforeCursor = text.slice(0, cursor)
  const match = beforeCursor.match(/(^|\s)([@/])([^\s@/]*)$/)
  if (!match || (match[2] !== "@" && match[2] !== "/")) return null
  const query = match[3] ?? ""
  return {
    marker: match[2],
    query,
    start: cursor - query.length - 1,
    end: cursor,
  }
}

function fileAsAttachment(file: WorkspaceFile): Attachment {
  return {
    name: file.name,
    path: file.path,
    mimeType: file.mimeType,
    size: file.size,
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"))
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      const separator = result.indexOf(",")
      if (separator < 0) reject(new Error("Clipboard image data is invalid"))
      else resolve(result.slice(separator + 1))
    }
    reader.readAsDataURL(file)
  })
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
  const [inbox, setInbox] = useState<InboxItem[]>([])
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
          setInbox(event.payload.inbox ?? [])
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
        case "sessions.indexed":
          break
        case "inbox.updated":
          setInbox(event.payload)
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
        setInbox(snapshot.inbox ?? [])
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

  const refreshSessions = useCallback(async () => {
    if (!api) return
    try {
      const response = await api.invoke("sessions.refresh", {
        includeArchived: true,
      })
      if (!response.ok) throw new Error(response.error.message)
      setTasks((current) =>
        response.data.tasks.reduce(upsertTask, current),
      )
      showToast(
        response.data.sessions.length === 1
          ? "1 Grok session refreshed"
          : `${response.data.sessions.length} Grok sessions refreshed`,
      )
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not refresh sessions",
      )
    }
  }, [api, showToast])

  const continueRecentSession = useCallback(async () => {
    if (!api) {
      showToast("Session history is available in the desktop app")
      return
    }
    try {
      const response = await api.invoke("sessions.continueRecent", {
        projectId: activeProject?.id,
      })
      if (!response.ok) throw new Error(response.error.message)
      if (!response.data.task) {
        showToast("No Grok session found for this repository")
        return
      }
      setTasks((current) => upsertTask(current, response.data.task!))
      await selectTask(response.data.task.id)
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not continue session",
      )
    }
  }, [activeProject?.id, api, selectTask, showToast])

  const renameSession = useCallback(
    async (task: Task) => {
      if (!api || !task.sessionId) return
      const title = window.prompt("Rename session", task.title)?.trim()
      if (!title || title === task.title) return
      try {
        const response = await api.invoke("sessions.rename", {
          sessionId: task.sessionId,
          title,
        })
        if (!response.ok) throw new Error(response.error.message)
        setTasks((current) => upsertTask(current, response.data.task))
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Could not rename session",
        )
      }
    },
    [api, showToast],
  )

  const archiveSession = useCallback(
    async (task: Task) => {
      if (!api || !task.sessionId) return
      const archived = !task.archived
      try {
        const response = await api.invoke("sessions.archive", {
          sessionId: task.sessionId,
          archived,
        })
        if (!response.ok) throw new Error(response.error.message)
        setTasks((current) => upsertTask(current, response.data.task))
        if (archived && activeTaskId === task.id) {
          const fallback = tasks.find(
            (candidate) => candidate.id !== task.id && !candidate.archived,
          )
          if (fallback) await selectTask(fallback.id)
          else setActiveTaskId(null)
        }
        showToast(archived ? "Session archived" : "Session restored")
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Could not archive session",
        )
      }
    },
    [activeTaskId, api, selectTask, showToast, tasks],
  )

  const exportSession = useCallback(
    async (task: Task) => {
      if (!api || !task.sessionId) return
      try {
        const response = await api.invoke("sessions.exportMarkdown", {
          sessionId: task.sessionId,
        })
        if (!response.ok) throw new Error(response.error.message)
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(response.data.markdown)
          showToast(`Copied ${response.data.suggestedName}`)
        } else {
          window.prompt("Copy session Markdown", response.data.markdown)
        }
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Could not export session",
        )
      }
    },
    [api, showToast],
  )

  const updateInbox = useCallback(
    async (
      method: "inbox.markRead" | "inbox.markAllRead" | "inbox.dismiss",
      params: { id: string; read?: boolean } | Record<string, never>,
    ) => {
      if (!api) return
      try {
        const response =
          method === "inbox.markRead"
            ? await api.invoke(method, params as { id: string; read?: boolean })
            : method === "inbox.dismiss"
              ? await api.invoke(method, params as { id: string })
              : await api.invoke(method, {})
        if (!response.ok) throw new Error(response.error.message)
        setInbox(response.data.items)
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Could not update inbox",
        )
      }
    },
    [api, showToast],
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
          onContinueRecent={continueRecentSession}
          onRefreshSessions={refreshSessions}
          onRenameSession={renameSession}
          onArchiveSession={archiveSession}
          onExportSession={exportSession}
          onOpenSettings={() => setScreen("settings")}
          onOpenInbox={() => setScreen("inbox")}
          onSelectTask={selectTask}
          onToggleSidebar={() => setSidebarOpen(false)}
          platform={platform}
          projects={projects}
          runtime={runtime}
          tasks={tasks}
          unreadInboxCount={inbox.filter((item) => !item.read).length}
        />
      )}

      <div className="workspace-shell">
        {screen === "settings" ? (
          <SettingsView
            onBack={() => setScreen("workspace")}
            onNotify={showToast}
            onUpdate={updateSettings}
            platform={platform}
            projects={projects}
            runtime={runtime}
            settings={settings}
            sidebarOpen={sidebarOpen}
            toggleSidebar={() => setSidebarOpen((open) => !open)}
          />
        ) : screen === "inbox" ? (
          <InboxView
            inbox={inbox}
            onBack={() => setScreen("workspace")}
            onDismiss={(id) => void updateInbox("inbox.dismiss", { id })}
            onMarkAllRead={() => void updateInbox("inbox.markAllRead", {})}
            onOpenItem={(item) => {
              if (!item.read) {
                void updateInbox("inbox.markRead", { id: item.id, read: true })
              }
              if (item.taskId) void selectTask(item.taskId)
            }}
            platform={platform}
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
                onNotify={showToast}
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
  unreadInboxCount: number
  platform: string
  onSelectTask: (id: string) => void
  onCreateTask: (projectId?: string) => void
  onGoBack: () => void
  onGoForward: () => void
  onContinueRecent: () => void
  onRefreshSessions: () => void
  onRenameSession: (task: Task) => void
  onArchiveSession: (task: Task) => void
  onExportSession: (task: Task) => void
  onAddProject: () => void
  onOpenSettings: () => void
  onOpenInbox: () => void
  onToggleSidebar: () => void
}

function Sidebar({
  projects,
  tasks,
  activeTaskId,
  canGoBack,
  canGoForward,
  runtime,
  unreadInboxCount,
  platform,
  onSelectTask,
  onCreateTask,
  onGoBack,
  onGoForward,
  onContinueRecent,
  onRefreshSessions,
  onRenameSession,
  onArchiveSession,
  onExportSession,
  onAddProject,
  onOpenSettings,
  onOpenInbox,
  onToggleSidebar,
}: SidebarProps) {
  const [query, setQuery] = useState("")
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [expandedTaskProjectIds, setExpandedTaskProjectIds] = useState<
    Set<string>
  >(() => new Set())
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
  const archivedCount = tasks.filter((task) => task.archived).length
  const activeTask = tasks.find((task) => task.id === activeTaskId)
  const activeProjectId = activeTask?.projectId ?? null
  const visibleTasks = [...tasks]
    .filter((task) => (showArchived ? Boolean(task.archived) : !task.archived))
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
  const taskMatchesQuery = (task: Task) => {
    if (!normalizedQuery) return true
    const project = projectMap.get(task.projectId)
    return `${task.title} ${project?.name ?? ""}`
      .toLowerCase()
      .includes(normalizedQuery)
  }
  const pinnedTasks = visibleTasks.filter(
    (task) => task.pinned && taskMatchesQuery(task),
  )
  const visibleProjects = projects.filter((project) => {
    const projectMatches = project.name.toLowerCase().includes(normalizedQuery)
    const projectTasks = visibleTasks.filter(
      (task) => task.projectId === project.id,
    )

    if (!normalizedQuery) {
      return !showArchived || projectTasks.length > 0
    }

    return (
      projectMatches ||
      projectTasks.some((task) =>
        task.title.toLowerCase().includes(normalizedQuery),
      )
    )
  })
  const unassignedTasks = visibleTasks.filter(
    (task) =>
      !task.pinned &&
      !projectMap.has(task.projectId) &&
      taskMatchesQuery(task),
  )

  const selectedMode = SIDEBAR_MODES[ACTIVE_SIDEBAR_MODE_INDEX]

  useEffect(() => {
    if (!activeProjectId) return
    setCollapsedProjectIds((current) => {
      if (!current.has(activeProjectId)) return current
      const next = new Set(current)
      next.delete(activeProjectId)
      return next
    })
  }, [activeProjectId])

  const toggleProject = (projectId: string) => {
    setCollapsedProjectIds((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const toggleProjectTaskLimit = (projectId: string) => {
    setExpandedTaskProjectIds((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

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
          aria-label={
            searchOpen ? "Close sidebar search" : "Search projects and chats"
          }
          aria-controls="sidebar-search-panel"
          aria-expanded={searchOpen}
          title={searchOpen ? "Close search" : "Search projects and chats"}
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
              aria-label="Search projects and chats"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeSearch()
              }}
              placeholder="Search projects and chats..."
              value={query}
            />
            <button
              type="button"
              className="sidebar-search-clear"
              onClick={() => closeSearch()}
              aria-label="Close sidebar search"
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
          <Icon name="compose" size={18} />
          <span>New chat</span>
          <kbd>{isMac(platform) ? "⌘N" : "Ctrl N"}</kbd>
        </button>
        <button
          type="button"
          className="continue-session-button"
          onClick={onContinueRecent}
        >
          <Icon name="play" size={16} />
          <span>Continue recent session</span>
        </button>
        <button
          type="button"
          className="sidebar-nav-button"
          onClick={onOpenInbox}
        >
          <Icon name="inbox" size={17} />
          <span>Inbox</span>
          {unreadInboxCount > 0 && (
            <span className="inbox-unread-badge">
              {unreadInboxCount > 99 ? "99+" : unreadInboxCount}
            </span>
          )}
        </button>
      </div>

      <div className="workspace-list">
        {pinnedTasks.length > 0 && (
          <section className="sidebar-content-section sidebar-pinned-section">
            <div className="workspace-section-title">
              <span>Pinned</span>
            </div>
            <div className="task-list sidebar-flat-task-list">
              {pinnedTasks.map((task) => {
                const project = projectMap.get(task.projectId)
                return (
                  <SidebarTaskRow
                    active={task.id === activeTaskId}
                    compact
                    key={task.id}
                    onArchive={() => onArchiveSession(task)}
                    onExport={() => onExportSession(task)}
                    onRename={() => onRenameSession(task)}
                    onSelect={() => onSelectTask(task.id)}
                    project={project}
                    task={task}
                  />
                )
              })}
            </div>
          </section>
        )}

        <section className="sidebar-content-section sidebar-projects-section">
          <div className="workspace-section-title">
            <span>{showArchived ? "Archived" : "Projects"}</span>
            <span className="workspace-section-actions">
              <button
                type="button"
                onClick={onRefreshSessions}
                title="Refresh Grok sessions"
                aria-label="Refresh Grok sessions"
              >
                <Icon name="activity" size={13} />
              </button>
              {archivedCount > 0 && (
                <button
                  type="button"
                  className={showArchived ? "active" : ""}
                  onClick={() => setShowArchived((visible) => !visible)}
                  title={showArchived ? "Back to projects" : "Show archived chats"}
                >
                  {showArchived ? "Back" : archivedCount}
                </button>
              )}
              {!showArchived && (
                <button
                  type="button"
                  onClick={onAddProject}
                  title="Add project"
                  aria-label="Add project"
                >
                  <Icon name="add" size={14} />
                </button>
              )}
            </span>
          </div>

          <div className="sidebar-project-list">
            {visibleProjects.map((project) => {
              const projectMatches = project.name
                .toLowerCase()
                .includes(normalizedQuery)
              const projectTasks = visibleTasks.filter(
                (task) =>
                  task.projectId === project.id &&
                  !task.pinned &&
                  (projectMatches || taskMatchesQuery(task)),
              )

              return (
                <SidebarProjectGroup
                  activeProject={project.id === activeProjectId}
                  activeTaskId={activeTaskId}
                  collapsed={
                    normalizedQuery.length === 0 &&
                    collapsedProjectIds.has(project.id)
                  }
                  key={project.id}
                  onArchiveSession={onArchiveSession}
                  onCreateTask={() => onCreateTask(project.id)}
                  onExportSession={onExportSession}
                  onRenameSession={onRenameSession}
                  onSelectTask={onSelectTask}
                  onToggle={() => toggleProject(project.id)}
                  onToggleTaskLimit={() => toggleProjectTaskLimit(project.id)}
                  project={project}
                  showAllTasks={expandedTaskProjectIds.has(project.id)}
                  tasks={projectTasks}
                />
              )
            })}
          </div>

          {!showArchived && (
            <button
              type="button"
              className="sidebar-add-project-row"
              onClick={onAddProject}
            >
              <Icon name="folder" size={16} />
              <span>Add project</span>
            </button>
          )}
        </section>

        {unassignedTasks.length > 0 && (
          <section className="sidebar-content-section sidebar-chats-section">
            <div className="workspace-section-title">
              <span>Chats</span>
            </div>
            <div className="task-list sidebar-flat-task-list">
              {unassignedTasks.map((task) => (
                <SidebarTaskRow
                  active={task.id === activeTaskId}
                  compact
                  key={task.id}
                  onArchive={() => onArchiveSession(task)}
                  onExport={() => onExportSession(task)}
                  onRename={() => onRenameSession(task)}
                  onSelect={() => onSelectTask(task.id)}
                  task={task}
                />
              ))}
            </div>
          </section>
        )}

        {visibleProjects.length === 0 &&
          pinnedTasks.length === 0 &&
          unassignedTasks.length === 0 && (
            <div className="sidebar-empty">
              <p>
                {projects.length === 0
                  ? "Add a project to start a chat."
                  : showArchived
                    ? "No archived chats."
                    : "No matching projects or chats."}
              </p>
            </div>
          )}
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-runtime-card"
          onClick={onOpenSettings}
          aria-label="Open settings"
        >
          <span className="sidebar-runtime-mark">
            <BrandMark size={16} />
          </span>
          <span className="sidebar-runtime-copy">
            <strong>Grok runtime</strong>
            <small>
              {runtime.state === "ready"
                ? runtime.version?.replace(/^grok\b/i, "Grok") ?? "Ready"
                : runtime.state === "checking"
                  ? "Checking…"
                  : runtime.message ?? "Unavailable"}
            </small>
          </span>
          <RuntimeDot runtime={runtime} />
          <Icon name="gear" size={16} />
        </button>
      </div>
    </aside>
  )
}

const PROJECT_TASK_PREVIEW_LIMIT = 8

interface SidebarProjectGroupProps {
  project: Project
  tasks: Task[]
  activeTaskId: string | null
  activeProject: boolean
  collapsed: boolean
  showAllTasks: boolean
  onToggle: () => void
  onToggleTaskLimit: () => void
  onCreateTask: () => void
  onSelectTask: (id: string) => void
  onRenameSession: (task: Task) => void
  onArchiveSession: (task: Task) => void
  onExportSession: (task: Task) => void
}

function SidebarProjectGroup({
  project,
  tasks,
  activeTaskId,
  activeProject,
  collapsed,
  showAllTasks,
  onToggle,
  onToggleTaskLimit,
  onCreateTask,
  onSelectTask,
  onRenameSession,
  onArchiveSession,
  onExportSession,
}: SidebarProjectGroupProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const displayedTasks = showAllTasks
    ? tasks
    : tasks.slice(0, PROJECT_TASK_PREVIEW_LIMIT)
  const hiddenTaskCount = tasks.length - displayedTasks.length

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("pointerdown", close, true)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", close, true)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [menuOpen])

  const runAction = (action: () => void) => {
    setMenuOpen(false)
    action()
  }

  return (
    <div
      className={`sidebar-project-group ${activeProject ? "active" : ""}`}
    >
      <div className="sidebar-project-row-shell" ref={menuRef}>
        <button
          type="button"
          className="sidebar-project-row"
          aria-expanded={!collapsed}
          onClick={onToggle}
          title={project.path}
        >
          <span className="project-disclosure" aria-hidden="true">
            <Icon name="chevron-right" size={13} />
          </span>
          <Icon name={collapsed ? "folder" : "folder-open"} size={16} />
          <span className="sidebar-project-name">{project.name}</span>
        </button>

        <span className="sidebar-project-actions">
          <button
            type="button"
            aria-label={`New chat in ${project.name}`}
            title="New chat"
            onClick={onCreateTask}
          >
            <Icon name="add" size={14} />
          </button>
          <button
            type="button"
            aria-label={`Project actions for ${project.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Project actions"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name="more" size={15} />
          </button>
        </span>

        {menuOpen && (
          <div className="task-context-menu project-context-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onCreateTask)}
            >
              New chat
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                runAction(() => void window.nolira?.openPath(project.path))
              }
            >
              Open folder
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                runAction(() => void navigator.clipboard.writeText(project.path))
              }
            >
              Copy path
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="sidebar-project-task-list">
          {displayedTasks.map((task) => (
            <SidebarTaskRow
              active={task.id === activeTaskId}
              compact
              key={task.id}
              onArchive={() => onArchiveSession(task)}
              onExport={() => onExportSession(task)}
              onRename={() => onRenameSession(task)}
              onSelect={() => onSelectTask(task.id)}
              project={project}
              task={task}
            />
          ))}

          {tasks.length > PROJECT_TASK_PREVIEW_LIMIT && (
            <button
              type="button"
              className="sidebar-show-more"
              onClick={onToggleTaskLimit}
            >
              {showAllTasks ? "Show less" : `Show ${hiddenTaskCount} more`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface SidebarTaskRowProps {
  task: Task
  project?: Project
  active: boolean
  compact?: boolean
  onSelect: () => void
  onRename: () => void
  onArchive: () => void
  onExport: () => void
}

function SidebarTaskRow({
  task,
  project,
  active,
  compact = false,
  onSelect,
  onRename,
  onArchive,
  onExport,
}: SidebarTaskRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const manageable = Boolean(task.sessionId && task.sessionSource === "grok")

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("pointerdown", close, true)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", close, true)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [menuOpen])

  const runAction = (action: () => void) => {
    setMenuOpen(false)
    action()
  }

  return (
    <div className="task-row-shell" ref={menuRef}>
      <button
        type="button"
        className={`task-row ${compact ? "task-row-compact" : ""} ${
          active ? "active" : ""
        }`}
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        title={project?.path}
      >
        <span className="task-copy">
          <span className="task-title">{task.title}</span>
          {!compact && (
            <span className="task-meta">
              <span>{project?.name ?? "Local project"}</span>
              <span>•</span>
              <span>{formatTime(task.updatedAt)}</span>
            </span>
          )}
        </span>
        <StatusDot status={task.status} />
      </button>

      {manageable && (
        <button
          type="button"
          className="task-menu-trigger"
          aria-label={`Session actions for ${task.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name="more" size={16} />
        </button>
      )}

      {menuOpen && (
        <div className="task-context-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => runAction(onRename)}>
            Rename
          </button>
          <button type="button" role="menuitem" onClick={() => runAction(onExport)}>
            Copy as Markdown
          </button>
          <button type="button" role="menuitem" onClick={() => runAction(onArchive)}>
            {task.archived ? "Restore" : "Archive"}
          </button>
        </div>
      )}
    </div>
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
  const [cursorPosition, setCursorPosition] = useState(0)
  const [fileMatches, setFileMatches] = useState<WorkspaceFile[]>([])
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const trigger = useMemo(
    () => composerTriggerAt(text, cursorPosition),
    [cursorPosition, text],
  )
  const suggestions = useMemo<ComposerSuggestion[]>(() => {
    if (!trigger || suggestionsDismissed) return []
    const query = trigger.query.toLowerCase()
    if (trigger.marker === "@") {
      return fileMatches.map((file) => ({
        id: `file:${file.path}`,
        kind: "file" as const,
        file,
      }))
    }

    const commands = COMPOSER_COMMANDS.filter(
      (command) => !query || command.name.includes(query),
    ).map((command) => ({
      id: `command:${command.name}`,
      kind: "command" as const,
      command,
    }))
    const skillQuery = query.startsWith("skill:")
      ? query.slice("skill:".length)
      : ""
    const skillItems = query.startsWith("skill")
      ? skills
          .filter(
            (skill) =>
              !skillQuery ||
              `${skill.name} ${skill.description ?? ""}`
                .toLowerCase()
                .includes(skillQuery),
          )
          .slice(0, 12)
          .map((skill) => ({
            id: `skill:${skill.id}`,
            kind: "skill" as const,
            skill,
          }))
      : []
    return [...commands, ...skillItems].slice(0, 14)
  }, [fileMatches, skills, suggestionsDismissed, trigger])

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

  useEffect(() => {
    if (!window.nolira) return
    let alive = true
    void window.nolira
      .invoke("skills.list", { projectId: project?.id })
      .then((response) => {
        if (alive && response.ok) setSkills(response.data.skills)
      })
    return () => {
      alive = false
    }
  }, [project?.id])

  useEffect(() => {
    if (
      !window.nolira ||
      !project?.id ||
      trigger?.marker !== "@" ||
      suggestionsDismissed
    ) {
      setFileMatches([])
      return
    }

    let alive = true
    const timer = window.setTimeout(() => {
      void window.nolira!
        .invoke("workspace.files", {
          projectId: project.id,
          query: trigger.query,
          limit: 30,
        })
        .then((response) => {
          if (alive && response.ok) setFileMatches(response.data.files)
        })
    }, 80)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [project?.id, suggestionsDismissed, trigger?.marker, trigger?.query])

  useEffect(() => {
    setActiveSuggestion(0)
  }, [trigger?.marker, trigger?.query, suggestions.length])

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

  const applySuggestion = (suggestion: ComposerSuggestion) => {
    if (!trigger) return
    let replacement = ""

    if (suggestion.kind === "file") {
      const pathLabel = suggestion.file.relativePath.includes(" ")
        ? `@"${suggestion.file.relativePath}" `
        : `@${suggestion.file.relativePath} `
      replacement = pathLabel
      const attachment = fileAsAttachment(suggestion.file)
      setAttachments((current) =>
        current.some((item) => item.path === attachment.path)
          ? current
          : [...current, attachment],
      )
    } else if (suggestion.kind === "command") {
      replacement = suggestion.command.prompt
    } else {
      replacement = `Use the "${suggestion.skill.name}" skill for this task. `
    }

    const nextText = `${text.slice(0, trigger.start)}${replacement}${text.slice(
      trigger.end,
    )}`
    const nextCursor = trigger.start + replacement.length
    setText(nextText)
    setCursorPosition(nextCursor)
    setSuggestionsDismissed(true)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const importPastedImages = async (
    event: ReactClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const images = Array.from(event.clipboardData.files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 5)
    if (images.length === 0) return
    event.preventDefault()
    if (!window.nolira) {
      onSendError("Image paste is available in the desktop app")
      return
    }

    try {
      const imported = await Promise.all(
        images.map(async (file, index) => {
          if (file.size > 8 * 1024 * 1024) {
            throw new Error(`${file.name || "Pasted image"} is larger than 8 MB`)
          }
          const response = await window.nolira!.invoke("attachments.importData", {
            name: file.name || `pasted-image-${Date.now()}-${index + 1}`,
            mimeType: file.type,
            dataBase64: await fileToBase64(file),
          })
          if (!response.ok) throw new Error(response.error.message)
          return response.data.attachment
        }),
      )
      setAttachments((current) => [...current, ...imported])
    } catch (error) {
      onSendError(
        error instanceof Error ? error.message : "Could not import pasted image",
      )
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
      return
    }
    if (suggestions.length === 0) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const direction = event.key === "ArrowDown" ? 1 : -1
      setActiveSuggestion(
        (current) => (current + direction + suggestions.length) % suggestions.length,
      )
      return
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const suggestion = suggestions[activeSuggestion]
      if (!suggestion) return
      event.preventDefault()
      applySuggestion(suggestion)
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      setSuggestionsDismissed(true)
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
      {suggestions.length > 0 && (
        <div className="composer-suggestions" id="composer-suggestions" role="listbox">
          {suggestions.map((suggestion, index) => {
            const label =
              suggestion.kind === "file"
                ? suggestion.file.relativePath
                : suggestion.kind === "command"
                  ? `/${suggestion.command.name}`
                  : `/skill:${suggestion.skill.name}`
            const detail =
              suggestion.kind === "file"
                ? formatBytes(suggestion.file.size)
                : suggestion.kind === "command"
                  ? suggestion.command.description
                  : `${suggestion.skill.source} · ${suggestion.skill.description ?? "Installed skill"}`
            return (
              <button
                type="button"
                id={`composer-suggestion-${index}`}
                role="option"
                aria-selected={index === activeSuggestion}
                className={index === activeSuggestion ? "active" : ""}
                key={suggestion.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applySuggestion(suggestion)}
              >
                <span className="composer-suggestion-icon">
                  <Icon
                    name={
                      suggestion.kind === "file"
                        ? "code"
                        : suggestion.kind === "skill"
                          ? "spark"
                          : "terminal"
                    }
                    size={14}
                  />
                </span>
                <span className="composer-suggestion-copy">
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </button>
            )
          })}
        </div>
      )}
      <textarea
        ref={textareaRef}
        aria-label="Message Grok"
        aria-autocomplete="list"
        aria-controls={suggestions.length > 0 ? "composer-suggestions" : undefined}
        aria-activedescendant={
          suggestions.length > 0
            ? `composer-suggestion-${activeSuggestion}`
            : undefined
        }
        onChange={(event) => {
          setText(event.target.value)
          setCursorPosition(event.target.selectionStart)
          setSuggestionsDismissed(false)
        }}
        onKeyDown={onComposerKeyDown}
        onPaste={(event) => void importPastedImages(event)}
        onSelect={(event) =>
          setCursorPosition(event.currentTarget.selectionStart)
        }
        placeholder="Ask Grok, @ a file, or type / for commands"
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
  onNotify: (message: string) => void
}

type ActivityPanelTab = "activity" | "files" | "changes" | "info"

function ActivityPanel({
  task,
  project,
  runtime,
  onClose,
  onNotify,
}: ActivityPanelProps) {
  const [tab, setTab] = useState<ActivityPanelTab>("activity")
  const [requestedFile, setRequestedFile] = useState<string>()
  const plan = task?.plan ?? []
  const goal = task?.goal
  const subagents = task?.subagents ?? []
  const backgroundTasks = task?.backgroundTasks ?? []
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
          {(
            [
              ["activity", "Activity"],
              ["files", "Files"],
              ["changes", "Changes"],
              ["info", "Info"],
            ] as const
          ).map(([value, label]) => (
            <button
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
              id={`activity-${value}-tab`}
              role="tab"
              aria-controls={`activity-${value}-panel`}
              aria-selected={tab === value}
              key={value}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="icon-button no-drag"
          onClick={onClose}
          aria-label="Close details panel"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {tab === "activity" && (
        <div
          className="activity-content"
          id="activity-activity-panel"
          role="tabpanel"
          aria-labelledby="activity-activity-tab"
        >
          {goal ||
          plan.length > 0 ||
          tools.length > 0 ||
          subagents.length > 0 ||
          backgroundTasks.length > 0 ? (
            <>
              {goal && (
                <div className={`activity-goal goal-${goal.status}`}>
                  <span className="eyebrow">Goal · {goal.status}</span>
                  <strong>{goal.objective || "Active goal"}</strong>
                  {(goal.message || goal.lastEvent) && (
                    <p>{goal.message ?? goal.lastEvent}</p>
                  )}
                  {goal.elapsedMs !== undefined && (
                    <small>{formatDuration(goal.elapsedMs)}</small>
                  )}
                </div>
              )}
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
              {subagents.length > 0 && (
                <div className="activity-group">
                  <span className="eyebrow">Subagents</span>
                  <div className="subagent-list">
                    {subagents.map((subagent) => (
                      <div className="subagent-item" key={subagent.id}>
                        <span className={`subagent-node subagent-${subagent.status}`}>
                          {subagent.phase === "finished" ? (
                            <Icon
                              name={subagent.error ? "close" : "check"}
                              size={11}
                            />
                          ) : (
                            <span className="status-pulse" />
                          )}
                        </span>
                        <div>
                          <strong>{subagent.type ?? "Subagent"}</strong>
                          <p>{subagent.description ?? subagent.id}</p>
                          <small>
                            {[
                              subagent.status,
                              subagent.turnCount !== undefined
                                ? `${subagent.turnCount} turns`
                                : undefined,
                              subagent.toolCallCount !== undefined
                                ? `${subagent.toolCallCount} tools`
                                : undefined,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {backgroundTasks.length > 0 && (
                <div className="activity-group">
                  <span className="eyebrow">Background tasks</span>
                  <div className="background-task-list">
                    {backgroundTasks.map((backgroundTask) => (
                      <div className="background-task-item" key={backgroundTask.id}>
                        <span
                          className={`background-task-node task-${backgroundTask.phase}`}
                        >
                          {backgroundTask.phase === "completed" ? (
                            <Icon
                              name={backgroundTask.success === false ? "close" : "check"}
                              size={11}
                            />
                          ) : backgroundTask.isMonitor ? (
                            <Icon name="activity" size={12} />
                          ) : (
                            <span className="status-pulse" />
                          )}
                        </span>
                        <div>
                          <strong>
                            {backgroundTask.description ??
                              backgroundTask.command ??
                              backgroundTask.id}
                          </strong>
                          {(backgroundTask.eventText || backgroundTask.output) && (
                            <p>
                              {backgroundTask.eventText ?? backgroundTask.output}
                            </p>
                          )}
                          <small>
                            {[
                              backgroundTask.phase,
                              backgroundTask.exitCode !== undefined &&
                              backgroundTask.exitCode !== null
                                ? `exit ${backgroundTask.exitCode}`
                                : undefined,
                              backgroundTask.durationMs !== undefined
                                ? formatDuration(backgroundTask.durationMs)
                                : undefined,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
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
      )}

      {tab === "files" && (
        <WorkspaceFilesPanel
          onNotify={onNotify}
          project={project}
          requestedPath={requestedFile}
        />
      )}

      {tab === "changes" && (
        <WorkspaceChangesPanel
          onNotify={onNotify}
          onOpenFile={(path) => {
            setRequestedFile(path)
            setTab("files")
          }}
          project={project}
        />
      )}

      {tab === "info" && (
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

function WorkspaceFilesPanel({
  project,
  requestedPath,
  onNotify,
}: {
  project: Project | null
  requestedPath?: string
  onNotify: (message: string) => void
}) {
  const [query, setQuery] = useState("")
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [opened, setOpened] = useState<WorkspaceFileContent | null>(null)
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const dirty = Boolean(opened && draft !== opened.content)

  useEffect(() => {
    if (!window.nolira || !project) {
      setFiles([])
      return
    }
    let alive = true
    const timer = window.setTimeout(() => {
      void window.nolira!
        .invoke("workspace.files", {
          projectId: project.id,
          query,
          limit: 120,
        })
        .then((response) => {
          if (!alive) return
          if (!response.ok) throw new Error(response.error.message)
          setFiles(response.data.files)
        })
        .catch((error: unknown) => {
          if (alive) {
            onNotify(
              error instanceof Error ? error.message : "Could not list files",
            )
          }
        })
    }, 90)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [project, query, refreshKey, onNotify])

  const openFile = async (path: string) => {
    if (!window.nolira || !project) return
    if (
      dirty &&
      opened?.file.relativePath !== path &&
      !window.confirm("Discard the unsaved editor changes?")
    ) {
      return
    }
    setLoading(true)
    try {
      const response = await window.nolira.invoke("workspace.readFile", {
        projectId: project.id,
        path,
      })
      if (!response.ok) throw new Error(response.error.message)
      setOpened(response.data)
      setDraft(response.data.content)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not open file")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (requestedPath) void openFile(requestedPath)
    // requestedPath is an explicit navigation request; editor state is read inside openFile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, requestedPath])

  const save = async () => {
    if (!window.nolira || !project || !opened || !dirty || saving) return
    setSaving(true)
    try {
      const response = await window.nolira.invoke("workspace.writeFile", {
        projectId: project.id,
        path: opened.file.relativePath,
        content: draft,
        expectedMtimeMs: opened.mtimeMs,
      })
      if (!response.ok) throw new Error(response.error.message)
      setOpened(response.data)
      setDraft(response.data.content)
      setRefreshKey((value) => value + 1)
      onNotify(`Saved ${response.data.file.relativePath}`)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not save file")
    } finally {
      setSaving(false)
    }
  }

  if (!project) {
    return (
      <PanelEmpty
        icon="folder"
        title="No repository selected"
        text="Choose a repository to browse and edit files."
      />
    )
  }

  return (
    <div
      className={`workspace-files-panel ${opened ? "has-editor" : ""}`}
      id="activity-files-panel"
      role="tabpanel"
      aria-labelledby="activity-files-tab"
    >
      <div className="panel-search-row">
        <Icon name="search" size={14} />
        <input
          aria-label="Filter repository files"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files"
          value={query}
        />
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          aria-label="Refresh files"
          title="Refresh files"
        >
          <Icon name="activity" size={14} />
        </button>
      </div>

      <div className="workspace-file-list">
        {files.map((file) => (
          <button
            type="button"
            className={opened?.file.relativePath === file.relativePath ? "active" : ""}
            key={file.path}
            onClick={() => void openFile(file.relativePath)}
            title={file.relativePath}
          >
            <Icon name="code" size={13} />
            <span>{file.relativePath}</span>
            <small>{formatBytes(file.size)}</small>
          </button>
        ))}
        {files.length === 0 && (
          <span className="panel-list-empty">No matching files</span>
        )}
      </div>

      {opened && (
        <div className="workspace-editor">
          <div className="workspace-editor-header">
            <span title={opened.file.relativePath}>
              {opened.file.relativePath}
              {dirty && <i> • edited</i>}
            </span>
            <button type="button" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <textarea
            aria-label={`Edit ${opened.file.relativePath}`}
            disabled={loading}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              const command = isMac(window.nolira?.platform ?? "")
                ? event.metaKey
                : event.ctrlKey
              if (command && event.key.toLowerCase() === "s") {
                event.preventDefault()
                void save()
              }
            }}
            spellCheck={false}
            value={draft}
          />
        </div>
      )}
    </div>
  )
}

function WorkspaceChangesPanel({
  project,
  onOpenFile,
  onNotify,
}: {
  project: Project | null
  onOpenFile: (path: string) => void
  onNotify: (message: string) => void
}) {
  const [changes, setChanges] = useState<WorkspaceChange[]>([])
  const [branch, setBranch] = useState<string>()
  const [selected, setSelected] = useState<WorkspaceChange>()
  const [diff, setDiff] = useState<WorkspaceDiff>()
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!window.nolira || !project) return
    let alive = true
    setLoading(true)
    void window.nolira
      .invoke("workspace.changes", { projectId: project.id })
      .then((response) => {
        if (!alive) return
        if (!response.ok) throw new Error(response.error.message)
        setChanges(response.data.changes)
        setBranch(response.data.branch)
        if (
          selected &&
          !response.data.changes.some((change) => change.path === selected.path)
        ) {
          setSelected(undefined)
          setDiff(undefined)
        }
      })
      .catch((error: unknown) => {
        if (alive) onNotify(error instanceof Error ? error.message : "Could not read Git status")
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [project, refreshKey])

  const openDiff = async (change: WorkspaceChange) => {
    if (!window.nolira || !project) return
    setSelected(change)
    setLoading(true)
    try {
      const response = await window.nolira.invoke("workspace.diff", {
        projectId: project.id,
        path: change.path,
        staged: change.staged,
      })
      if (!response.ok) throw new Error(response.error.message)
      setDiff(response.data)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not load diff")
    } finally {
      setLoading(false)
    }
  }

  if (!project) {
    return (
      <PanelEmpty
        icon="code"
        title="No repository selected"
        text="Choose a Git repository to inspect changes."
      />
    )
  }

  return (
    <div
      className="workspace-changes-panel"
      id="activity-changes-panel"
      role="tabpanel"
      aria-labelledby="activity-changes-tab"
    >
      <div className="changes-toolbar">
        <span>{branch || "Detached HEAD"}</span>
        <small>{changes.length} changed</small>
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          aria-label="Refresh changes"
          title="Refresh changes"
        >
          <Icon name="activity" size={14} />
        </button>
      </div>
      <div className="workspace-change-list">
        {changes.map((change) => (
          <button
            type="button"
            className={selected?.path === change.path ? "active" : ""}
            key={`${change.indexStatus}${change.worktreeStatus}:${change.path}`}
            onClick={() => void openDiff(change)}
            title={change.path}
          >
            <span className={`change-badge change-${change.status}`}>
              {change.status.slice(0, 1).toUpperCase()}
            </span>
            <span>{change.path}</span>
            {change.staged && <small>staged</small>}
          </button>
        ))}
        {!loading && changes.length === 0 && (
          <span className="panel-list-empty">Working tree is clean</span>
        )}
      </div>
      {selected && (
        <div className="workspace-diff-shell">
          <div className="workspace-diff-header">
            <span>{selected.path}</span>
            {selected.status !== "deleted" && (
              <button type="button" onClick={() => onOpenFile(selected.path)}>
                Open file
              </button>
            )}
          </div>
          <DiffView diff={diff?.diff ?? (loading ? "Loading diff…" : "No diff available")} />
        </div>
      )}
    </div>
  )
}

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="workspace-diff-view">
      {diff.split("\n").map((line, index) => {
        const className = line.startsWith("+")
          ? "diff-added"
          : line.startsWith("-")
            ? "diff-removed"
            : line.startsWith("@@")
              ? "diff-hunk"
              : line.startsWith("diff ") || line.startsWith("index ")
                ? "diff-meta"
                : ""
        return (
          <span className={className} key={`${index}-${line.slice(0, 24)}`}>
            {line || " "}
            {"\n"}
          </span>
        )
      })}
    </pre>
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

function InboxView({
  inbox,
  sidebarOpen,
  onBack,
  onDismiss,
  onMarkAllRead,
  onOpenItem,
  toggleSidebar,
}: {
  inbox: InboxItem[]
  platform: string
  sidebarOpen: boolean
  onBack: () => void
  onDismiss: (id: string) => void
  onMarkAllRead: () => void
  onOpenItem: (item: InboxItem) => void
  toggleSidebar: () => void
}) {
  const unread = inbox.filter((item) => !item.read).length
  return (
    <div className="inbox-screen">
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
        <h1>Inbox</h1>
      </header>
      <div className="inbox-content">
        <div className="inbox-heading">
          <div>
            <h2>Notifications</h2>
            <p>Permission requests, monitors, and background task results.</p>
          </div>
          {unread > 0 && (
            <button type="button" onClick={onMarkAllRead}>
              Mark all read
            </button>
          )}
        </div>
        <div className="inbox-list">
          {inbox.map((item) => {
            const icon: IconName =
              item.type === "background_task"
                ? "terminal"
                : item.type === "automation"
                  ? "spark"
                  : item.type === "monitor"
                    ? "activity"
                    : "warning"
            return (
              <div className={`inbox-item ${item.read ? "" : "unread"}`} key={item.id}>
                <button
                  type="button"
                  className="inbox-item-main"
                  onClick={() => onOpenItem(item)}
                >
                  <span className={`inbox-item-icon inbox-${item.type}`}>
                    <Icon name={icon} size={16} />
                  </span>
                  <span className="inbox-item-copy">
                    <strong>{item.title}</strong>
                    {item.body && <span>{item.body}</span>}
                    <small>{formatTime(item.createdAt)}</small>
                  </span>
                  {!item.read && <i aria-label="Unread" />}
                </button>
                <button
                  type="button"
                  className="inbox-dismiss"
                  onClick={() => onDismiss(item.id)}
                  aria-label={`Dismiss ${item.title}`}
                  title="Dismiss"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            )
          })}
          {inbox.length === 0 && (
            <PanelEmpty
              icon="activity"
              title="Inbox is clear"
              text="Background task results and items needing attention will appear here."
            />
          )}
        </div>
      </div>
    </div>
  )
}

interface SettingsViewProps {
  settings: AppSettings
  runtime: RuntimeStatus
  projects: Project[]
  platform: string
  sidebarOpen: boolean
  onBack: () => void
  onNotify: (message: string) => void
  toggleSidebar: () => void
  onUpdate: (patch: Partial<AppSettings>) => void
}

function SettingsView({
  settings,
  runtime,
  projects,
  sidebarOpen,
  onBack,
  onNotify,
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
    { id: "integrations", label: "Integrations", icon: "code" },
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

          {section === "integrations" && (
            <IntegrationsSettings onNotify={onNotify} projects={projects} />
          )}
        </div>
      </div>
    </div>
  )
}

type IntegrationTab = "provider" | "skills" | "mcp" | "memory" | "automations"

function IntegrationsSettings({
  projects,
  onNotify,
}: {
  projects: Project[]
  onNotify: (message: string) => void
}) {
  const api = window.nolira
  const [tab, setTab] = useState<IntegrationTab>("provider")
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "")
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [memory, setMemory] = useState<WorkspaceMemory>()
  const [memoryContent, setMemoryContent] = useState("")
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [automations, setAutomations] = useState<AutomationDefinition[]>([])
  const [mcpName, setMcpName] = useState("")
  const [mcpCommand, setMcpCommand] = useState("")
  const [mcpArgs, setMcpArgs] = useState("")
  const [automationName, setAutomationName] = useState("")
  const [automationPrompt, setAutomationPrompt] = useState("")
  const [automationInterval, setAutomationInterval] = useState(60)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id)
  }, [projectId, projects])

  useEffect(() => {
    if (!api) return
    let alive = true
    void api.invoke("providers.list", {}).then((response) => {
      if (alive && response.ok) setProviders(response.data.providers)
    })
    void api.invoke("mcp.list", {}).then((response) => {
      if (alive && response.ok) setServers(response.data.servers)
    })
    void api.invoke("automations.list", {}).then((response) => {
      if (alive && response.ok) setAutomations(response.data.automations)
    })
    return () => {
      alive = false
    }
  }, [api])

  useEffect(() => {
    if (!api) return
    let alive = true
    void api
      .invoke("skills.list", { projectId: projectId || undefined })
      .then((response) => {
        if (alive && response.ok) setSkills(response.data.skills)
      })
    if (projectId) {
      void api.invoke("memory.get", { projectId }).then((response) => {
        if (!alive || !response.ok) return
        setMemory(response.data.memory)
        setMemoryContent(response.data.memory.content)
        setMemoryEnabled(response.data.memory.enabled)
      })
    }
    return () => {
      alive = false
    }
  }, [api, projectId])

  const saveNewMcp = async () => {
    if (!api || !mcpName.trim() || !mcpCommand.trim()) return
    setSaving(true)
    try {
      const response = await api.invoke("mcp.save", {
        name: mcpName.trim(),
        command: mcpCommand.trim(),
        args: mcpArgs
          .split("\n")
          .map((argument) => argument.trim())
          .filter(Boolean),
        enabled: true,
      })
      if (!response.ok) throw new Error(response.error.message)
      setServers(response.data.servers)
      setMcpName("")
      setMcpCommand("")
      setMcpArgs("")
      onNotify("MCP server saved; it will be used by new sessions")
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not save MCP server")
    } finally {
      setSaving(false)
    }
  }

  const updateMcp = async (server: McpServerConfig, enabled: boolean) => {
    if (!api) return
    const response = await api.invoke("mcp.save", { ...server, enabled })
    if (response.ok) setServers(response.data.servers)
    else onNotify(response.error.message)
  }

  const removeMcp = async (server: McpServerConfig) => {
    if (!api || !window.confirm(`Remove MCP server “${server.name}”?`)) return
    const response = await api.invoke("mcp.remove", { id: server.id })
    if (response.ok) setServers(response.data.servers)
    else onNotify(response.error.message)
  }

  const saveMemory = async () => {
    if (!api || !projectId) return
    setSaving(true)
    try {
      const response = await api.invoke("memory.set", {
        projectId,
        enabled: memoryEnabled,
        content: memoryContent,
      })
      if (!response.ok) throw new Error(response.error.message)
      setMemory(response.data.memory)
      onNotify("Workspace memory saved for new sessions")
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not save memory")
    } finally {
      setSaving(false)
    }
  }

  const saveNewAutomation = async () => {
    if (!api || !projectId || !automationName.trim() || !automationPrompt.trim()) {
      return
    }
    setSaving(true)
    try {
      const response = await api.invoke("automations.save", {
        name: automationName.trim(),
        projectId,
        prompt: automationPrompt.trim(),
        intervalMinutes: automationInterval,
        enabled: true,
      })
      if (!response.ok) throw new Error(response.error.message)
      setAutomations(response.data.automations)
      setAutomationName("")
      setAutomationPrompt("")
      onNotify("Automation scheduled")
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not save automation")
    } finally {
      setSaving(false)
    }
  }

  const updateAutomation = async (
    automation: AutomationDefinition,
    enabled: boolean,
  ) => {
    if (!api) return
    const response = await api.invoke("automations.save", {
      id: automation.id,
      name: automation.name,
      projectId: automation.projectId,
      prompt: automation.prompt,
      intervalMinutes: automation.intervalMinutes,
      enabled,
    })
    if (response.ok) setAutomations(response.data.automations)
    else onNotify(response.error.message)
  }

  const removeAutomation = async (automation: AutomationDefinition) => {
    if (!api || !window.confirm(`Remove automation “${automation.name}”?`)) return
    const response = await api.invoke("automations.remove", { id: automation.id })
    if (response.ok) setAutomations(response.data.automations)
    else onNotify(response.error.message)
  }

  const runAutomationNow = async (automation: AutomationDefinition) => {
    if (!api) return
    const response = await api.invoke("automations.runNow", { id: automation.id })
    if (!response.ok) {
      onNotify(response.error.message)
      return
    }
    setAutomations((current) =>
      current.map((item) =>
        item.id === response.data.automation.id
          ? response.data.automation
          : item,
      ),
    )
    onNotify(`Started ${automation.name}`)
  }

  const integrationTabs: Array<{
    id: IntegrationTab
    label: string
  }> = [
    { id: "provider", label: "Provider" },
    { id: "skills", label: "Skills" },
    { id: "mcp", label: "MCP" },
    { id: "memory", label: "Memory" },
    { id: "automations", label: "Automations" },
  ]

  return (
    <section className="settings-section integrations-settings">
      <div className="settings-section-heading">
        <h2>Integrations</h2>
        <p>Connect the Grok runtime to your tools and recurring workflows.</p>
      </div>
      <div className="integration-tabs" role="tablist">
        {integrationTabs.map((item) => (
          <button
            type="button"
            className={tab === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setTab(item.id)}
            role="tab"
            aria-selected={tab === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(tab === "skills" || tab === "memory" || tab === "automations") && (
        <label className="integration-project-picker">
          <span>Repository</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {tab === "provider" && (
        <div className="integration-card-list">
          {providers.map((provider) => (
            <div className="integration-card provider-card" key={provider.id}>
              <span className="integration-card-icon">
                <BrandMark size={20} />
              </span>
              <div>
                <strong>{provider.name}</strong>
                <p>
                  Authentication is owned by the Grok CLI; Nolira Build never stores
                  or copies the account token.
                </p>
                <small>
                  {provider.version ?? provider.state}
                  {provider.models.length > 0
                    ? ` · ${provider.models.length} models`
                    : ""}
                </small>
              </div>
              <RuntimeDot runtime={{ state: provider.state }} />
            </div>
          ))}
        </div>
      )}

      {tab === "skills" && (
        <div className="integration-card-list compact-list">
          {skills.map((skill) => (
            <div className="integration-card" key={skill.id}>
              <span className="integration-card-icon"><Icon name="spark" size={17} /></span>
              <div>
                <strong>{skill.name}</strong>
                <p>{skill.description ?? "Installed skill"}</p>
                <small>{skill.source}</small>
              </div>
            </div>
          ))}
          {skills.length === 0 && <div className="integration-empty">No skills found.</div>}
        </div>
      )}

      {tab === "mcp" && (
        <>
          <div className="integration-card-list compact-list">
            {servers.map((server) => (
              <div className="integration-card integration-manage-row" key={server.id}>
                <span className="integration-card-icon"><Icon name="terminal" size={17} /></span>
                <div>
                  <strong>{server.name}</strong>
                  <p><code>{server.command} {server.args.join(" ")}</code></p>
                </div>
                <Toggle
                  checked={server.enabled}
                  onChange={(enabled) => void updateMcp(server, enabled)}
                />
                <button type="button" onClick={() => void removeMcp(server)} aria-label={`Remove ${server.name}`}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="integration-form">
            <h3>Add stdio MCP server</h3>
            <input placeholder="Name" value={mcpName} onChange={(event) => setMcpName(event.target.value)} />
            <input placeholder="Command, e.g. npx" value={mcpCommand} onChange={(event) => setMcpCommand(event.target.value)} />
            <textarea placeholder="Arguments, one per line" value={mcpArgs} onChange={(event) => setMcpArgs(event.target.value)} />
            <button type="button" disabled={saving || !mcpName.trim() || !mcpCommand.trim()} onClick={() => void saveNewMcp()}>
              Add MCP server
            </button>
          </div>
        </>
      )}

      {tab === "memory" && (
        <div className="integration-form memory-form">
          <div className="integration-form-heading">
            <div>
              <h3>Workspace memory</h3>
              <p>Injected as ACP session rules when a new session connects.</p>
            </div>
            <Toggle checked={memoryEnabled} onChange={setMemoryEnabled} />
          </div>
          <textarea
            className="memory-editor"
            placeholder="Repository conventions, verification expectations, and durable context…"
            value={memoryContent}
            onChange={(event) => setMemoryContent(event.target.value)}
          />
          <div className="integration-form-footer">
            <small>{memory?.updatedAt && Date.parse(memory.updatedAt) > 0 ? `Last saved ${formatTime(memory.updatedAt)}` : "Not saved yet"}</small>
            <button type="button" disabled={saving || !projectId} onClick={() => void saveMemory()}>
              Save memory
            </button>
          </div>
        </div>
      )}

      {tab === "automations" && (
        <>
          <div className="integration-card-list compact-list">
            {automations.map((automation) => (
              <div className="integration-card automation-row" key={automation.id}>
                <span className="integration-card-icon"><Icon name="activity" size={17} /></span>
                <div>
                  <strong>{automation.name}</strong>
                  <p>{automation.prompt}</p>
                  <small>
                    Every {automation.intervalMinutes} min
                    {automation.nextRunAt ? ` · next ${formatTime(automation.nextRunAt)}` : ""}
                  </small>
                </div>
                <div className="automation-actions">
                  <button type="button" onClick={() => void runAutomationNow(automation)}>Run</button>
                  <Toggle checked={automation.enabled} onChange={(enabled) => void updateAutomation(automation, enabled)} />
                  <button type="button" onClick={() => void removeAutomation(automation)} aria-label={`Remove ${automation.name}`}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="integration-form">
            <h3>New recurring automation</h3>
            <input placeholder="Name" value={automationName} onChange={(event) => setAutomationName(event.target.value)} />
            <textarea placeholder="Prompt to run" value={automationPrompt} onChange={(event) => setAutomationPrompt(event.target.value)} />
            <label className="automation-interval">
              <span>Every</span>
              <input type="number" min={5} max={10080} value={automationInterval} onChange={(event) => setAutomationInterval(Number(event.target.value))} />
              <span>minutes</span>
            </label>
            <button type="button" disabled={saving || !projectId || !automationName.trim() || !automationPrompt.trim()} onClick={() => void saveNewAutomation()}>
              Create automation
            </button>
          </div>
        </>
      )}
    </section>
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
