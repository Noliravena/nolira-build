import type { CSSProperties, ReactNode, SVGProps } from "react"

/**
 * Icon set aligned to Cursor Agents / codicon + Lucide stroke language:
 * 24 viewBox, 1.5 stroke, rounded caps, secondary opacity for chrome icons.
 */
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
  | "compose"
  | "folder"
  | "folder-open"
  | "gear"
  | "image"
  | "inbox"
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
  // activity / pulse
  activity: (
    <path d="M3 12h4l2-7 4 14 2-7h6" />
  ),
  // plus (codicon-add)
  add: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  // send / arrow up
  "arrow-up": (
    <>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </>
  ),
  // paperclip
  attachment: (
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  ),
  // reasoning
  brain: (
    <>
      <path d="M12 5a3 3 0 0 0-3 3v1a3 3 0 0 0-2 2.7A3 3 0 0 0 9 17h.5" />
      <path d="M12 5a3 3 0 0 1 3 3v1a3 3 0 0 1 2 2.7A3 3 0 0 1 15 17h-.5" />
      <path d="M9.5 17v2M14.5 17v2M9.5 9H8M14.5 12H16" />
    </>
  ),
  check: <path d="m5 12 5 5L20 7" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-left": <path d="m15 18-6-6 6-6" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </>
  ),
  code: (
    <>
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
      <path d="m14 5-4 14" />
    </>
  ),
  // compose / new agent (pen-square-ish)
  compose: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
    </>
  ),
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  ),
  "folder-open": (
    <path d="M3 7h6l2 2h8a2 2 0 0 1 1.9 2.6l-1.8 6A2 2 0 0 1 17.2 19H5a2 2 0 0 1-2-2V7Z" />
  ),
  // settings gear simplified
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5-5-4 4-2-2-5 5" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  // panel left
  "layout-left": (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  "layout-right": (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),
  pause: (
    <>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7V5Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  // sparkle (codicon-sparkle)
  spark: (
    <>
      <path d="m12 3 1.4 4.3L18 9l-4.6 1.7L12 15l-1.4-4.3L6 9l4.6-1.7L12 3Z" />
      <path d="m19 14 .8 2.4L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.6L19 14Z" />
    </>
  ),
  // stop square (filled feel via thicker path)
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  terminal: (
    <>
      <path d="m5 8 5 4-5 4" />
      <path d="M12 16h7" />
    </>
  ),
  warning: (
    <>
      <path d="m10.3 4.3-7.6 13A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.7l-7.6-13a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
    </>
  ),
}

export function Icon({
  name,
  size = 16,
  style,
  className,
  ...props
}: IconProps) {
  const iconStyle: CSSProperties = { flex: "0 0 auto", ...style }
  return (
    <svg
      aria-hidden="true"
      className={className ? `ui-icon ${className}` : "ui-icon"}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      style={iconStyle}
      {...props}
    >
      {stroke[name]}
    </svg>
  )
}
