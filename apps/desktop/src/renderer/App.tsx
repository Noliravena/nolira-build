import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  ActivityPanel,
  BrandMark,
  ChatWorkspace,
  InboxView,
  PermissionDialog,
  SettingsView,
  Sidebar,
  WindowChrome,
  WorkspaceHeader,
} from "./components/agents"
import { demoSnapshot } from "./lib/demoSnapshot"
import { pathName } from "./lib/format"
import { isMac } from "./lib/platform"
import {
  applyMessageDelta,
  upsertMessage,
  upsertProject,
  upsertTask,
} from "./lib/taskState"
import type {
  AgentEvent,
  AppSettings,
  InboxItem,
  PermissionRequest,
  Project,
  RuntimeStatus,
  Task,
} from "./types"

type Screen = "workspace" | "settings" | "inbox"

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
    <div className="app-shell agents-shell" data-agents="true" data-platform={platform}>
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
        <div className="loading-cover agents-loading">
          <div className="agents-welcome-splash" aria-hidden="true">
            <div className="agents-welcome-glow" />
            <div className="agents-welcome-mark">
              <BrandMark size={40} />
            </div>
          </div>
          <span>Opening Agents…</span>
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
