import type { RuntimeStatus } from "../../types"

export function RuntimeDot({ runtime }: { runtime: RuntimeStatus }) {
  return (
    <span
      className={`runtime-dot runtime-${runtime.state}`}
      title={runtime.message ?? runtime.state}
    />
  )
}

