import { useEffect, useRef, useState } from "react"
import { Icon } from "../../icons"
import { formatTime } from "../../lib/format"
import type { Project, Task } from "../../types"
import { StatusDot } from "../chrome/StatusDot"

export interface SidebarTaskRowProps {
  task: Task
  project?: Project
  active: boolean
  compact?: boolean
  onSelect: () => void
  onRename: () => void
  onArchive: () => void
  onExport: () => void
}

export function SidebarTaskRow({
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
