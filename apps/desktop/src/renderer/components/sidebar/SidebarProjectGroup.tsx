import { useEffect, useRef, useState } from "react"
import { Icon } from "../../icons"
import type { Project, Task } from "../../types"
import { SidebarTaskRow } from "./SidebarTaskRow"

export const PROJECT_TASK_PREVIEW_LIMIT = 8

export interface SidebarProjectGroupProps {
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

export function SidebarProjectGroup({
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
