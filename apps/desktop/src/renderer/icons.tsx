import type { CSSProperties, ReactNode, SVGProps } from "react"

/**
 * Icon set aligned to Cursor Agents / codicon + Lucide stroke language:
 * 24 viewBox, 1.5 stroke, rounded caps, secondary opacity for chrome icons.
 */
export type IconName =
  | "activity"
  | "add"
  | "archive"
  | "arrow-left"
  | "arrow-up"
  | "attachment"
  | "bell"
  | "board"
  | "brain"
  | "branch"
  | "check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "close"
  | "code"
  | "compose"
  | "download"
  | "folder"
  | "folder-open"
  | "folder-plus"
  | "gear"
  | "grid"
  | "history"
  | "image"
  | "inbox"
  | "infinity"
  | "info"
  | "layout-left"
  | "layout-right"
  | "moon"
  | "more"
  | "pause"
  | "play"
  | "refresh"
  | "search"
  | "shield"
  | "sliders"
  | "spark"
  | "stop"
  | "sun"
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
  archive: (
    <>
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </>
  ),
  "arrow-left": (
    <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
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
  bell: (
    <>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </>
  ),
  board: (
    <>
      <rect x="3.5" y="4" width="4.6" height="16" rx="1.4" />
      <rect x="9.7" y="4" width="4.6" height="10" rx="1.4" />
      <rect x="15.9" y="4" width="4.6" height="13" rx="1.4" />
    </>
  ),
  // reasoning
  brain: (
    <>
      <path d="M12 5a3 3 0 0 0-3 3v1a3 3 0 0 0-2 2.7A3 3 0 0 0 9 17h.5" />
      <path d="M12 5a3 3 0 0 1 3 3v1a3 3 0 0 1 2 2.7A3 3 0 0 1 15 17h-.5" />
      <path d="M9.5 17v2M14.5 17v2M9.5 9H8M14.5 12H16" />
    </>
  ),
  branch: (
    <>
      <path d="M6 3v12" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
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
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  ),
  "folder-open": (
    <path d="M3 7h6l2 2h8a2 2 0 0 1 1.9 2.6l-1.8 6A2 2 0 0 1 17.2 19H5a2 2 0 0 1-2-2V7Z" />
  ),
  "folder-plus": (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M12 10v6" />
      <path d="M9 13h6" />
    </>
  ),
  // settings gear simplified
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5-5-4 4-2-2-5 5" />
    </>
  ),
  infinity: (
    <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />
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
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
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
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  shield: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  sliders: (
    <>
      <path d="M21 4h-7" />
      <path d="M10 4H3" />
      <path d="M21 12h-9" />
      <path d="M8 12H3" />
      <path d="M21 20h-5" />
      <path d="M12 20H3" />
      <path d="M14 2v4" />
      <path d="M8 10v4" />
      <path d="M16 18v4" />
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
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </>
  ),
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
