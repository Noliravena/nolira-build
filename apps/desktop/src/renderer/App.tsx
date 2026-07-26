import { useCallback, useEffect, useMemo, useState } from "react"

import { PermissionDialog } from "./components/screens/PermissionDialog"
import { AppHeader, StatusFooter } from "./components/nolira/AppChrome"
import {
  CommandPalette,
  InboxDialog,
  type PaletteCommand,
} from "./components/nolira/dialogs"
import { HomeView, type HomeViewMode } from "./components/nolira/HomeView"
import { SessionView } from "./components/nolira/SessionView"
import { SettingsDialog } from "./components/nolira/SettingsDialog"
import { demoSnapshot } from "./lib/demoSnapshot"
import { pathName } from "./lib/format"
import { cardStatus } from "./lib/agentPresentation"
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

type Screen = "home" | "session"

export function App() {
  const api = window.nolira
  const platform =
    api?.platform ??
    (navigator.userAgent.toLowerCase().includes("mac") ? "darwin" : "web")
  const [projects, setProjects] = useState<Project[]>(
    api ? [] : demoSnapshot.projects,
  )
  const [tasks, setTasks] = useState<Task[]>(api ? [] : demoSnapshot.tasks)
  const [settings, setSettings] = useState<AppSettings>(demoSnapshot.settings)
  const [runtime, setRuntime] = useState<RuntimeStatus>(
    api ? { state: "checking" } : demoSnapshot.runtime,
  )
  const [models, setModels] = useState(api ? [] : (demoSnapshot.models ?? []))
  const [activeTaskId, setActiveTaskId] = useState<string | null>(
    api ? null : (demoSnapshot.activeTaskId ?? null),
  )
  const [permission, setPermission] = useState<PermissionRequest | null>(null)
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [screen, setScreen] = useState<Screen>("home")
  const [view, setView] = useState<HomeViewMode>("grid")
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  )
  const [paneOpen, setPaneOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [loading, setLoading] = useState(Boolean(api))
  const [toast, setToast] = useState<string | null>(null)

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks],
  )
  const activeProject = useMemo(
    () =>
      projects.find((project) => project.id === activeTask?.projectId) ??
      projects.find((project) => project.id === selectedProjectId) ??
      projects[0] ??
      null,
    [activeTask?.projectId, projects, selectedProjectId],
  )
  const homeProject = useMemo(
    () =>
      projects.find((project) => project.id === selectedProjectId) ??
      projects[0] ??
      null,
    [projects, selectedProjectId],
  )

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case "snapshot":
          setProjects(event.payload.projects)
          setTasks(event.payload.tasks)
          setSettings(event.payload.settings)
          setPaneOpen(event.payload.settings.showActivityPanel)
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
          setActiveTaskId(event.taskId)
          setScreen("session")
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
    [showToast],
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
        setPaneOpen(snapshot.settings.showActivityPanel)
        setRuntime(snapshot.runtime)
        setModels(snapshot.models ?? [])
        setInbox(snapshot.inbox ?? [])
        setActiveTaskId(snapshot.activeTaskId ?? snapshot.tasks[0]?.id ?? null)
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

  // Resolved theme (system → media query) applied via data attributes.
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  )
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystemDark(media.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])
  const resolvedTheme: "dark" | "light" =
    settings.theme === "dark" || (settings.theme === "system" && systemDark)
      ? "dark"
      : "light"
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolvedTheme
    root.dataset.accent = settings.accent ?? "ember"
  }, [resolvedTheme, settings.accent])

  const selectTask = useCallback(
    async (taskId: string) => {
      setActiveTaskId(taskId)
      setScreen("session")
      if (!api) return
      try {
        const task = await api.selectTask(taskId)
        if (task) setTasks((current) => upsertTask(current, task))
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Could not load task",
        )
      }
    },
    [api, showToast],
  )

  const goHome = useCallback(() => setScreen("home"), [])

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
      setSelectedProjectId(project.id)
      showToast(`Added ${project.name}`)
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not add workspace",
      )
    }
  }, [api, showToast])

  const createTask = useCallback(
    async (projectId?: string) => {
      const targetProjectId = projectId ?? homeProject?.id
      if (!targetProjectId) {
        await addProject()
        return null
      }

      if (!api) {
        const date = new Date().toISOString()
        const task: Task = {
          id: `preview-${Date.now()}`,
          projectId: targetProjectId,
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
        const task = await api.createTask({
          projectId: targetProjectId,
          title: "New task",
        })
        setTasks((current) => upsertTask(current, task))
        await selectTask(task.id)
        return task
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Could not create task",
        )
        return null
      }
    },
    [addProject, api, homeProject?.id, selectTask, settings, showToast],
  )

  const refreshSessions = useCallback(async () => {
    if (!api) return
    try {
      const response = await api.invoke("sessions.refresh", {
        includeArchived: true,
      })
      if (!response.ok) throw new Error(response.error.message)
      setTasks((current) => response.data.tasks.reduce(upsertTask, current))
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
        projectId: homeProject?.id,
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
  }, [api, homeProject?.id, selectTask, showToast])

  const stopTask = useCallback(
    async (task: Task) => {
      if (!api) return
      try {
        await api.cancelTask(task.id)
        showToast("Stopping after the current step")
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Could not stop task",
        )
      }
    },
    [api, showToast],
  )

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
          setScreen("home")
        }
        showToast(archived ? "Session archived" : "Session restored")
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Could not archive session",
        )
      }
    },
    [activeTaskId, api, showToast],
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
        setPaneOpen(patch.showActivityPanel)
      }
      if (!api) return
      try {
        const saved = await api.updateSettings(patch)
        setSettings(saved)
      } catch (error) {
        setSettings(previous)
        showToast(
          error instanceof Error ? error.message : "Could not save settings",
        )
      }
    },
    [api, settings, showToast],
  )

  const toggleTheme = useCallback(() => {
    void updateSettings({
      theme: resolvedTheme === "dark" ? "light" : "dark",
    })
  }, [resolvedTheme, updateSettings])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const command = isMac(platform) ? event.metaKey : event.ctrlKey
      if (event.key === "Escape") {
        setPaletteOpen(false)
        setSettingsOpen(false)
        setInboxOpen(false)
        return
      }
      if (!command) return
      if (event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
      if (event.key === ",") {
        event.preventDefault()
        setSettingsOpen(true)
      }
      if (event.key === "\\") {
        event.preventDefault()
        setPaneOpen((open) => !open)
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault()
        void createTask()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [createTask, platform])

  const unreadInbox = inbox.filter((item) => !item.read).length
  const runningCount = tasks.filter(
    (task) => !task.archived && cardStatus(task) === "running",
  ).length
  const reviewCount = tasks.filter(
    (task) =>
      !task.archived &&
      (cardStatus(task) === "review" || cardStatus(task) === "error"),
  ).length

  const inSession = screen === "session" && activeTask !== null
  const crumb = inSession
    ? `${activeProject?.name ?? ""} / ${activeTask?.title ?? ""}`
    : `Nolira workspace · ${projects.length} ${projects.length === 1 ? "project" : "projects"}`

  const paletteCommands: PaletteCommand[] = [
    {
      id: "new-task",
      label: "New task",
      icon: "add",
      meta: isMac(platform) ? "⌘ N" : "Ctrl N",
      run: () => void createTask(),
    },
    {
      id: "inbox",
      label: "Open Inbox",
      icon: "bell",
      run: () => setInboxOpen(true),
    },
    {
      id: "theme",
      label: "Toggle theme",
      icon: resolvedTheme === "dark" ? "sun" : "moon",
      run: toggleTheme,
    },
    {
      id: "board",
      label: "Board view",
      icon: "board",
      run: () => {
        setScreen("home")
        setView("board")
      },
    },
    {
      id: "grid",
      label: "Grid view",
      icon: "grid",
      run: () => {
        setScreen("home")
        setView("grid")
      },
    },
    {
      id: "settings",
      label: "Open settings",
      icon: "sliders",
      meta: isMac(platform) ? "⌘ ," : "Ctrl ,",
      run: () => setSettingsOpen(true),
    },
    {
      id: "refresh",
      label: "Refresh Grok sessions",
      icon: "refresh",
      run: () => void refreshSessions(),
    },
    {
      id: "continue",
      label: "Continue recent session",
      icon: "history",
      run: () => void continueRecentSession(),
    },
    {
      id: "add-project",
      label: "Add project",
      icon: "folder-plus",
      run: () => void addProject(),
    },
  ]

  const taskActions = {
    onOpen: (task: Task) => void selectTask(task.id),
    onStop: (task: Task) => void stopTask(task),
    onRename: (task: Task) => void renameSession(task),
    onExport: (task: Task) => void exportSession(task),
    onArchive: (task: Task) => void archiveSession(task),
  }

  return (
    <div className="nol-shell" data-platform={platform}>
      <AppHeader
        crumb={crumb}
        hasUnreadInbox={unreadInbox > 0}
        inSession={inSession}
        onGoHome={goHome}
        onOpenInbox={() => setInboxOpen(true)}
        onOpenSearch={() => setPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleTheme={toggleTheme}
        platform={platform}
        theme={resolvedTheme}
      />

      {inSession && activeTask ? (
        <SessionView
          apiAvailable={Boolean(api)}
          key={activeTask.id}
          models={models}
          onArchive={taskActions.onArchive}
          onCreateTask={createTask}
          onExport={taskActions.onExport}
          onRename={taskActions.onRename}
          onSendError={showToast}
          onStop={taskActions.onStop}
          onTogglePane={() => setPaneOpen((open) => !open)}
          paneOpen={paneOpen}
          project={activeProject}
          runtime={runtime}
          settings={settings}
          task={activeTask}
        />
      ) : (
        <HomeView
          apiAvailable={Boolean(api)}
          models={models}
          onAddProject={() => void addProject()}
          onCreateTask={createTask}
          onRefresh={refreshSessions}
          onSelectProject={setSelectedProjectId}
          onSendError={showToast}
          onViewChange={setView}
          projects={projects}
          selectedProjectId={homeProject?.id ?? null}
          settings={settings}
          taskActions={taskActions}
          tasks={tasks}
          view={view}
        />
      )}

      <StatusFooter
        model={settings.defaultModel}
        path={homeProject?.path ?? ""}
        platform={platform}
        reviewCount={reviewCount}
        runningCount={runningCount}
        runtime={runtime}
      />

      {inboxOpen && (
        <InboxDialog
          inbox={inbox}
          onClose={() => setInboxOpen(false)}
          onDismiss={(id) => void updateInbox("inbox.dismiss", { id })}
          onMarkAllRead={() => void updateInbox("inbox.markAllRead", {})}
          onOpenItem={(item) => {
            if (!item.read) {
              void updateInbox("inbox.markRead", { id: item.id, read: true })
            }
            setInboxOpen(false)
            if (item.taskId) void selectTask(item.taskId)
          }}
          projects={projects}
          tasks={tasks}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          models={models}
          onClose={() => setSettingsOpen(false)}
          onNotify={showToast}
          onUpdate={(patch) => void updateSettings(patch)}
          platform={platform}
          projects={projects}
          runtime={runtime}
          settings={settings}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          commands={paletteCommands}
          onClose={() => setPaletteOpen(false)}
          onOpenTask={(taskId) => void selectTask(taskId)}
          projects={projects}
          tasks={tasks}
        />
      )}

      {loading && (
        <div className="nol-loading">
          <div className="nol-loading-mark" aria-hidden="true" />
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

      {toast && <div className="nol-toast">{toast}</div>}
    </div>
  )
}
