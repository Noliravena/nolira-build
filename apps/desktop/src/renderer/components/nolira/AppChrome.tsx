import { Icon } from "../../icons"
import { isMac } from "../../lib/platform"
import type { RuntimeStatus } from "../../types"

export interface AppHeaderProps {
  platform: string
  crumb: string
  inSession: boolean
  theme: "dark" | "light"
  hasUnreadInbox: boolean
  onGoHome: () => void
  onOpenSearch: () => void
  onOpenInbox: () => void
  onToggleTheme: () => void
  onOpenSettings: () => void
}

export function AppHeader({
  platform,
  crumb,
  inSession,
  theme,
  hasUnreadInbox,
  onGoHome,
  onOpenSearch,
  onOpenInbox,
  onToggleTheme,
  onOpenSettings,
}: AppHeaderProps) {
  const mac = isMac(platform)
  const showWinControls = !mac && platform !== "web"
  const modKey = mac ? "⌘K" : "Ctrl K"

  return (
    <header
      className="nol-header"
      data-platform={mac ? "darwin" : platform}
    >
      {platform === "web" && (
        <div className="nol-traffic" aria-hidden="true">
          <span style={{ background: "#e0564f" }} />
          <span style={{ background: "#e0a33e" }} />
          <span style={{ background: "#59b357" }} />
        </div>
      )}
      {inSession && (
        <button
          type="button"
          className="nol-icon-btn"
          onClick={onGoHome}
          aria-label="Back to workspace"
          title="Back"
        >
          <Icon name="arrow-left" size={18} />
        </button>
      )}
      <div
        className="nol-logo nol-no-drag"
        onClick={onGoHome}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onGoHome()
        }}
      >
        <span className="nol-logo-mark" />
        <span className="nol-logo-name">nolira</span>
        <span className="nol-logo-sub">agents</span>
      </div>
      <div className="nol-header-divider" />
      <div className="nol-crumb">
        <span>{crumb}</span>
      </div>
      <div className="nol-flex1" />
      <button type="button" className="nol-search-btn" onClick={onOpenSearch}>
        <Icon name="search" size={15} />
        <span>Search</span>
        <span className="nol-kbd">{modKey}</span>
      </button>
      <button
        type="button"
        className="nol-icon-btn"
        onClick={onOpenInbox}
        aria-label="Inbox"
        title="Inbox"
      >
        <Icon name="bell" size={18} />
        {hasUnreadInbox && <span className="nol-badge-dot" />}
      </button>
      <button
        type="button"
        className="nol-icon-btn"
        onClick={onToggleTheme}
        aria-label="Toggle theme"
        title="Toggle theme"
      >
        <Icon name={theme === "dark" ? "moon" : "sun"} size={17} />
      </button>
      <button
        type="button"
        className="nol-icon-btn"
        onClick={onOpenSettings}
        aria-label="Settings"
        title={mac ? "Settings ⌘," : "Settings Ctrl+,"}
      >
        <Icon name="sliders" size={18} />
      </button>
      <div className="nol-avatar" aria-hidden="true">
        NV
      </div>
      {showWinControls && (
        <div
          className="nol-win-controls"
          role="group"
          aria-label="Window controls"
        >
          <button
            type="button"
            aria-label="Minimize window"
            onClick={() => window.nolira?.windowControl?.("minimize")}
          >
            <span className="nol-win-min" />
          </button>
          <button
            type="button"
            aria-label="Maximize window"
            onClick={() => window.nolira?.windowControl?.("maximize")}
          >
            <span className="nol-win-glyph" />
          </button>
          <button
            type="button"
            className="nol-win-close"
            aria-label="Close window"
            onClick={() => window.nolira?.windowControl?.("close")}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </header>
  )
}

export interface StatusFooterProps {
  runtime: RuntimeStatus
  path: string
  runningCount: number
  reviewCount: number
  model: string
  platform: string
}

export function StatusFooter({
  runtime,
  path,
  runningCount,
  reviewCount,
  model,
  platform,
}: StatusFooterProps) {
  const runtimeTone =
    runtime.state === "ready"
      ? "var(--ok)"
      : runtime.state === "checking"
        ? "var(--wr)"
        : "var(--dn)"
  const runtimeLabel =
    runtime.state === "ready"
      ? `runtime up${runtime.version ? ` · ${runtime.version}` : ""}`
      : runtime.state === "checking"
        ? "runtime starting…"
        : `runtime ${runtime.state}`

  return (
    <footer className="nol-footer">
      <span className="nol-footer-runtime">
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: runtimeTone,
          }}
        />
        {runtimeLabel}
      </span>
      <span className="nol-footer-path">{path}</span>
      <div className="nol-flex1" />
      <span>
        {runningCount} running · {reviewCount} to review
      </span>
      <span>{model}</span>
      <span>{isMac(platform) ? "⌘K" : "Ctrl K"}</span>
    </footer>
  )
}
