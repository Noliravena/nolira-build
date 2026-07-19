import type { CSSProperties, ReactNode, SVGProps } from "react"

export type IconName =
  | "activity"
  | "add"
  | "arrow-up"
  | "attachment"
  | "brain"
  | "check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "close"
  | "code"
  | "folder"
  | "folder-open"
  | "gear"
  | "image"
  | "info"
  | "layout-left"
  | "layout-right"
  | "more"
  | "pause"
  | "play"
  | "search"
  | "spark"
  | "stop"
  | "terminal"
  | "warning"

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

const stroke: Record<IconName, ReactNode> = {
  activity: <path d="M3 12h3l2.2-6.1L12 18l2.5-8 1.8 4H21" />,
  add: <path d="M12 5v14M5 12h14" />,
  "arrow-up": <path d="m6 10 6-6 6 6M12 4v16" />,
  attachment: (
    <path d="m20.5 11.5-8.8 8.8a6 6 0 0 1-8.5-8.5L13.1 2a4 4 0 0 1 5.7 5.7l-9.9 9.9a2 2 0 0 1-2.8-2.8L15 6" />
  ),
  brain: (
    <>
      <path d="M9.5 4.5A3.5 3.5 0 0 0 6 8v.3A3.5 3.5 0 0 0 4 14a3.5 3.5 0 0 0 5.5 2.9V4.5Z" />
      <path d="M14.5 4.5A3.5 3.5 0 0 1 18 8v.3a3.5 3.5 0 0 1 2 5.7 3.5 3.5 0 0 1-5.5 2.9V4.5ZM9.5 9H7m7.5 3H17m-7.5 4H7" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-left": <path d="m15 18-6-6 6-6" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  code: <path d="m8 9-4 3 4 3m8-6 4 3-4 3m-2-9-4 12" />,
  folder: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z" />,
  "folder-open": <path d="M3 7h6l2 2h8.5a1.5 1.5 0 0 1 1.4 2l-2 6A1.5 1.5 0 0 1 17.5 18h-13A1.5 1.5 0 0 1 3 16.5V7Zm0 4h17" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </>
  ),
  "layout-left": <path d="M4 4h16v16H4V4Zm5 0v16" />,
  "layout-right": <path d="M4 4h16v16H4V4Zm11 0v16" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  pause: <path d="M9 5v14m6-14v14" />,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4 4" />
    </>
  ),
  spark: <path d="m12 2 1.5 5.2L19 9l-5.5 1.8L12 16l-1.5-5.2L5 9l5.5-1.8L12 2Zm7 13 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
  terminal: <path d="m4 7 5 5-5 5m8 0h8" />,
  warning: (
    <>
      <path d="M10.3 3.8 2.5 18a2 2 0 0 0 1.8 3h15.4a2 2 0 0 0 1.8-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4m0 4h.01" />
    </>
  ),
}

export function Icon({
  name,
  size = 16,
  style,
  ...props
}: IconProps) {
  const iconStyle: CSSProperties = { flex: "0 0 auto", ...style }
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      style={iconStyle}
      {...props}
    >
      {stroke[name]}
    </svg>
  )
}
