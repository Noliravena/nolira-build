import type { PermissionRequest } from "../types"

export interface PermissionQueue {
  items: PermissionRequest[]
  activeId?: string
  open: boolean
}

export function createPermissionQueue(
  items: PermissionRequest[] = [],
): PermissionQueue {
  const unique = items.reduce<PermissionRequest[]>((current, request) => {
    const index = current.findIndex((entry) => entry.id === request.id)
    if (index >= 0) current[index] = request
    else current.push(request)
    return current
  }, [])
  return {
    items: unique,
    activeId: unique[0]?.id,
    open: unique.length > 0,
  }
}

export function enqueuePermission(
  queue: PermissionQueue,
  request: PermissionRequest,
): PermissionQueue {
  const index = queue.items.findIndex((entry) => entry.id === request.id)
  const items =
    index >= 0
      ? queue.items.map((entry) => (entry.id === request.id ? request : entry))
      : [...queue.items, request]

  if (queue.items.length > 0) return { ...queue, items }
  return { items, activeId: request.id, open: true }
}

export function resolvePermission(
  queue: PermissionQueue,
  requestId: string,
): PermissionQueue {
  const items = queue.items.filter((entry) => entry.id !== requestId)
  if (queue.activeId !== requestId) return { ...queue, items }

  return {
    items,
    activeId: items[0]?.id,
    open: items.length > 0,
  }
}

export function deferPermission(queue: PermissionQueue): PermissionQueue {
  return { ...queue, open: false }
}

export function openPermission(
  queue: PermissionQueue,
  requestId: string,
): PermissionQueue {
  if (!queue.items.some((entry) => entry.id === requestId)) return queue
  return { ...queue, activeId: requestId, open: true }
}

export function activePermission(
  queue: PermissionQueue,
): PermissionRequest | null {
  return (
    queue.items.find((entry) => entry.id === queue.activeId) ??
    queue.items[0] ??
    null
  )
}
