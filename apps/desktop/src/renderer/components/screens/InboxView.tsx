import { Icon, type IconName } from "../../icons"
import { formatTime } from "../../lib/format"
import type { InboxItem } from "../../types"
import { PanelEmpty } from "../activity/ActivityPanel"

export function InboxView({
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
              <Icon name="layout-left" size={16} />
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
