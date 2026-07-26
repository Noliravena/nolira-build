export const SIDEBAR_MODES = [
  {
    value: "chat",
    label: "Chat",
    description: "Lightweight chat mode coming soon",
    disabled: true,
  },
  {
    value: "build",
    label: "Agents",
    description: "Build, debug, and ship with Grok",
    disabled: false,
  },
] as const

export const ACTIVE_SIDEBAR_MODE_INDEX = 1
