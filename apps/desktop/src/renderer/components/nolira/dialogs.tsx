import { useEffect, useMemo, useRef, useState } from "react"

import { Icon, type IconName } from "../../icons"
import { formatRelative } from "../../lib/agentPresentation"
import type { InboxItem, Project, Task } from "../../types"

/* ---------- Inbox dialog ---------- */

const INBOX_KINDS: Record<
  InboxItem["type"],
  { label: string; tone: string }
> = {
  permission: { label: "Approval", tone: "var(--wr)" },
  background_task: { label: "Task", tone: "var(--bl)" },
  monitor: { label: "Monitor", tone: "var(--vi)" },
  error: { label: "Blocked", tone: "var(--dn)" },
  automation: { label: "Automation", tone: "var(--ok)" },
}

export function InboxDialog({
  inbox,
  projects,
  tasks,
  onClose,
  onOpenItem,
  onDismiss,
  onMarkAllRead,
}: {
  inbox: InboxItem[]
  projects: Project[]
  tasks: Task[]
  onClose: () => void
  onOpenItem: (item: InboxItem) => void
  onDismiss: (id: string) => void
  onMarkAllRead: () => void
}) {
  const unread = inbox.filter((item) => !item.read).length
  const projectOf = (item: InboxItem): string => {
    const task = tasks.find((candidate) => candidate.id === item.taskId)
    if (!task) return ""
    return (
      projects.find((project) => project.id === task.projectId)?.name ?? ""
    )
  }

  return (
    <div className="nol-overlay" onClick={onClose}>
      <div
        className="nol-dialog nol-inbox-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Inbox"
      >
        <div className="nol-dialog-head">
          <Icon name="bell" size={17} style={{ color: "var(--mu)" }} />
          <span className="nol-dialog-title">Inbox</span>
          <span className="nol-dialog-sub">
            {inbox.length === 0
              ? "Nothing waiting on you"
              : `${inbox.length} items · approvals, results and blockers`}
          </span>
          <div className="nol-flex1" />
          {unread > 0 && (
            <button
              type="button"
              className="nol-btn-ghost"
              onClick={onMarkAllRead}
            >
              Mark all read
            </button>
          )}
          <button
            type="button"
            className="nol-dialog-close"
            onClick={onClose}
            aria-label="Close inbox"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="nol-inbox-list">
          {inbox.map((item) => {
            const kind = INBOX_KINDS[item.type]
            return (
              <div
                className="nol-inbox-item"
                data-unread={!item.read}
                key={item.id}
              >
                <div className="nol-inbox-item-top">
                  <span
                    className="nol-inbox-kind"
                    style={{ color: kind.tone }}
                  >
                    {kind.label}
                  </span>
                  <span className="nol-inbox-meta">{projectOf(item)}</span>
                  <div className="nol-flex1" />
                  <span className="nol-inbox-time">
                    {formatRelative(item.createdAt)}
                  </span>
                </div>
                <div className="nol-inbox-title">{item.title}</div>
                {item.body && (
                  <div className="nol-inbox-detail">{item.body}</div>
                )}
                <div className="nol-inbox-actions">
                  {item.taskId && (
                    <button
                      type="button"
                      className="nol-btn-solid"
                      onClick={() => onOpenItem(item)}
                    >
                      {item.type === "permission"
                        ? "Review approval"
                        : "Open session"}
                    </button>
                  )}
                  {item.type !== "permission" && (
                    <button
                      type="button"
                      className="nol-btn-outline"
                      onClick={() => onDismiss(item.id)}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {inbox.length === 0 && (
            <div className="nol-pane-empty">
              <Icon name="bell" size={24} />
              <strong>Inbox is clear</strong>
              <p>
                Approvals, background task results and blockers will appear
                here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- Command palette (⌘K) ---------- */

export interface PaletteCommand {
  id: string
  label: string
  icon: IconName
  meta?: string
  run: () => void
}

type PaletteEntry =
  | { kind: "head"; label: string }
  | {
      kind: "item"
      id: string
      label: string
      icon: IconName
      meta?: string
      run: () => void
    }

export function CommandPalette({
  tasks,
  projects,
  commands,
  onOpenTask,
  onClose,
}: {
  tasks: Task[]
  projects: Project[]
  commands: PaletteCommand[]
  onOpenTask: (taskId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const entries = useMemo<PaletteEntry[]>(() => {
    const lowered = query.trim().toLowerCase()
    const agentHits = tasks
      .filter((task) => !task.archived)
      .filter(
        (task) => !lowered || task.title.toLowerCase().includes(lowered),
      )
      .slice(0, 5)
    const commandHits = commands.filter(
      (command) =>
        !lowered || command.label.toLowerCase().includes(lowered),
    )

    const result: PaletteEntry[] = []
    if (agentHits.length > 0) {
      result.push({ kind: "head", label: "Agents" })
      for (const task of agentHits) {
        const project = projects.find(
          (candidate) => candidate.id === task.projectId,
        )
        result.push({
          kind: "item",
          id: `task:${task.id}`,
          label: task.title || "New task",
          icon: "branch",
          meta: project?.name,
          run: () => onOpenTask(task.id),
        })
      }
    }
    if (commandHits.length > 0) {
      result.push({ kind: "head", label: "Commands" })
      for (const command of commandHits) {
        result.push({
          kind: "item",
          id: `command:${command.id}`,
          label: command.label,
          icon: command.icon,
          meta: command.meta,
          run: command.run,
        })
      }
    }
    return result
  }, [commands, onOpenTask, projects, query, tasks])

  const items = entries.filter(
    (entry): entry is Extract<PaletteEntry, { kind: "item" }> =>
      entry.kind === "item",
  )

  useEffect(() => {
    setActive(0)
  }, [query])

  const runActive = () => {
    const item = items[active]
    if (!item) return
    onClose()
    item.run()
  }

  return (
    <div className="nol-palette-overlay" onClick={onClose}>
      <div
        className="nol-palette"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="nol-palette-input">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault()
                const direction = event.key === "ArrowDown" ? 1 : -1
                setActive(
                  (current) =>
                    (current + direction + Math.max(items.length, 1)) %
                    Math.max(items.length, 1),
                )
              }
              if (event.key === "Enter") {
                event.preventDefault()
                runActive()
              }
            }}
            placeholder="Search agents, run a command…"
            value={query}
          />
          <span className="nol-kbd">esc</span>
        </div>
        <div className="nol-palette-list">
          {entries.map((entry, index) => {
            if (entry.kind === "head") {
              return (
                <div className="nol-palette-head" key={`head-${index}`}>
                  {entry.label}
                </div>
              )
            }
            const itemIndex = items.indexOf(entry)
            return (
              <button
                type="button"
                className="nol-palette-item"
                data-active={itemIndex === active}
                key={entry.id}
                onClick={() => {
                  onClose()
                  entry.run()
                }}
                onMouseEnter={() => setActive(itemIndex)}
              >
                <Icon name={entry.icon} size={15} />
                <span className="nol-palette-label">{entry.label}</span>
                {entry.meta && (
                  <span className="nol-palette-meta">{entry.meta}</span>
                )}
              </button>
            )
          })}
          {items.length === 0 && (
            <div className="nol-palette-empty">No matches</div>
          )}
        </div>
      </div>
    </div>
  )
}
