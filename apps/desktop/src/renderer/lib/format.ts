export function pathName(path: string) {
  const cleanPath = path.replace(/[\\/]+$/, "")
  return cleanPath.split(/[\\/]/).pop() || "Workspace"
}

export function formatTime(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function formatBytes(size?: number) {
  if (!size) return ""
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(milliseconds: number) {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1_000)} sec`
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = Math.round((milliseconds % 60_000) / 1_000)
  return seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} min`
}
