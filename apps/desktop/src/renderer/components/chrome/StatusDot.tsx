import { Icon } from "../../icons"
import type { Task } from "../../types"

export function StatusDot({ status }: { status: Task["status"] }) {
  return (
    <span className={`status-dot status-${status}`}>
      {status === "completed" && <Icon name="check" size={9} />}
      {(status === "running" || status === "starting") && (
        <span className="status-pulse" />
      )}
      {status === "waiting" && <span>!</span>}
    </span>
  )
}
