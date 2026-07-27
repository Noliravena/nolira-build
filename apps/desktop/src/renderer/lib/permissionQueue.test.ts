import { describe, expect, it } from "vitest"

import type { PermissionRequest } from "../types"
import {
  activePermission,
  createPermissionQueue,
  deferPermission,
  enqueuePermission,
  openPermission,
  resolvePermission,
} from "./permissionQueue"

function request(id: string): PermissionRequest {
  return {
    id,
    taskId: `task-${id}`,
    title: `Approval ${id}`,
    options: [{ id: "allow", label: "Allow" }],
  }
}

describe("permission queue", () => {
  it("keeps concurrent requests in arrival order", () => {
    let queue = enqueuePermission(createPermissionQueue(), request("one"))
    queue = enqueuePermission(queue, request("two"))

    expect(queue.items.map((entry) => entry.id)).toEqual(["one", "two"])
    expect(activePermission(queue)?.id).toBe("one")

    queue = resolvePermission(queue, "one")
    expect(activePermission(queue)?.id).toBe("two")
    expect(queue.open).toBe(true)
  })

  it("defers without discarding and can reopen a queued approval", () => {
    let queue = createPermissionQueue([request("one"), request("two")])
    queue = deferPermission(queue)
    expect(queue.items).toHaveLength(2)
    expect(queue.open).toBe(false)

    queue = openPermission(queue, "two")
    expect(activePermission(queue)?.id).toBe("two")
    expect(queue.open).toBe(true)
  })

  it("upserts duplicate request events instead of duplicating them", () => {
    const original = request("one")
    const updated = { ...original, title: "Updated approval" }
    const queue = enqueuePermission(
      enqueuePermission(createPermissionQueue(), original),
      updated,
    )

    expect(queue.items).toEqual([updated])
  })
})
