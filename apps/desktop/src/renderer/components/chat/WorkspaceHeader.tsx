import { Icon } from "../../icons"
import type { Project, Task } from "../../types"
import { BrandMark } from "../brand/BrandMark"
import { StatusDot } from "../chrome/StatusDot"

export interface WorkspaceHeaderProps {
  task: Task | null
  project: Project | null
  sidebarOpen: boolean
  activityOpen: boolean
  onToggleSidebar: () => void
  onToggleActivity: () => void
  onCreateTask: () => void
}

export function WorkspaceHeader({
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
            <Icon name="layout-left" size={16} />
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
            <Icon name="add" size={16} />
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
            <Icon name="layout-right" size={16} />
          </button>
        )}
      </div>
    </header>
  )
}
