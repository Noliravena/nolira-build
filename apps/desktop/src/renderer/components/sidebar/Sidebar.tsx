import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Icon } from "../../icons"
import { isMac } from "../../lib/platform"
import type { Project, RuntimeStatus, Task } from "../../types"
import { BrandMark } from "../brand/BrandMark"
import { RuntimeDot } from "../chrome/RuntimeDot"
import { ACTIVE_SIDEBAR_MODE_INDEX, SIDEBAR_MODES } from "./sidebarModes"
import { SidebarProjectGroup } from "./SidebarProjectGroup"
import { SidebarTaskRow } from "./SidebarTaskRow"

export interface SidebarProps {
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

export function Sidebar({
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
            <Icon name="layout-left" size={16} />
          </button>
          <button
            type="button"
            className="icon-button sidebar-history-button"
            onClick={onGoBack}
            aria-label="Go back"
            title={canGoBack ? "Previous workspace" : "No previous workspace"}
            disabled={!canGoBack}
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <button
            type="button"
            className="icon-button sidebar-history-button"
            onClick={onGoForward}
            aria-label="Go forward"
            title={canGoForward ? "Next workspace" : "No next workspace"}
            disabled={!canGoForward}
          >
            <Icon name="chevron-right" size={16} />
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
          <Icon name="search" size={16} />
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
          <Icon name="compose" size={16} />
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
          <Icon name="inbox" size={16} />
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
            <strong>Nolira Agents</strong>
            <small>
              {runtime.state === "ready"
                ? runtime.version?.replace(/^grok\b/i, "Grok") ?? "Runtime ready"
                : runtime.state === "checking"
                  ? "Checking runtime…"
                  : runtime.message ?? "Runtime unavailable"}
            </small>
          </span>
          <RuntimeDot runtime={runtime} />
          <Icon name="gear" size={16} />
        </button>
      </div>
    </aside>
  )
}
