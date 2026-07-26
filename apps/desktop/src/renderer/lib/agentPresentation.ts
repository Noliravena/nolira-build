import type { Task } from "../types"

/** Presentation status buckets used by the home grid, board and session view. */
export type CardStatus = "running" | "review" | "done" | "draft" | "error"

export function cardStatus(task: Task): CardStatus {
  switch (task.status) {
    case "running":
    case "starting":
      return "running"
    case "waiting":
      return "review"
    case "completed":
      return "done"
    case "error":
      return "error"
    default:
      return "draft"
  }
}

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  running: "Running",
  review: "Needs review",
  done: "Done",
  draft: "Draft",
  error: "Blocked",
}

export const CARD_STATUS_TONES: Record<CardStatus, string> = {
  running: "var(--ac)",
  review: "var(--wr)",
  done: "var(--ok)",
  draft: "var(--fa)",
  error: "var(--dn)",
}

/** Assumed model context window used for the composer context ring. */
export const CONTEXT_WINDOW_TOKENS = 256_000

export function contextPercent(tokens?: number): number | null {
  if (!tokens || tokens <= 0) return null
  return Math.min(100, Math.round((tokens / CONTEXT_WINDOW_TOKENS) * 100))
}

export function formatRelative(value?: string): string {
  if (!value) return ""
  const time = Date.parse(value)
  if (Number.isNaN(time)) return ""
  const delta = Date.now() - time
  if (delta < 45_000) return "just now"
  const minutes = Math.round(delta / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return "yesterday"
  if (days < 7) return `${days}d ago`
  const date = new Date(time)
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date)
}

export function taskTimeLabel(task: Task): string {
  const status = cardStatus(task)
  if (status === "running") {
    const started = Date.parse(task.updatedAt)
    if (!Number.isNaN(started)) {
      const minutes = Math.max(0, Math.round((Date.now() - started) / 60_000))
      if (minutes <= 90) return `running ${minutes}m`
      return `running · ${formatRelative(task.updatedAt)}`
    }
    return "running"
  }
  if (status === "draft" && task.messages.length === 0) return "draft"
  return formatRelative(task.updatedAt)
}

export function greetingLabel(): string {
  const hour = new Date().getHours()
  if (hour < 5) return "Up late — what should we build?"
  if (hour < 12) return "Good morning — what should we build?"
  if (hour < 18) return "Good afternoon — what should we build?"
  return "Good evening — what should we build?"
}
