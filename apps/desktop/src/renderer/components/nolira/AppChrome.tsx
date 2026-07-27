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
          <Icon name="arrow-left" size={16} />
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
      <div className="nol-header-actions">
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
          <Icon name="bell" size={15} />
          {hasUnreadInbox && <span className="nol-badge-dot" />}
        </button>
        <button
          type="button"
          className="nol-icon-btn"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          <Icon name={theme === "dark" ? "moon" : "sun"} size={15} />
        </button>
        <button
          type="button"
          className="nol-icon-btn"
          onClick={onOpenSettings}
          aria-label="Settings"
          title={mac ? "Settings ⌘," : "Settings Ctrl+,"}
        >
          <Icon name="sliders" size={15} />
        </button>
        <div className="nol-avatar" aria-hidden="true">
          NV
        </div>
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
            title="Minimize"
            onClick={() => window.nolira?.windowControl?.("minimize")}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Maximize window"
            title="Maximize"
            onClick={() => window.nolira?.windowControl?.("maximize")}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect
                x="0.5"
                y="0.5"
                width="9"
                height="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          </button>
          <button
            type="button"
            className="nol-win-close"
            aria-label="Close window"
            title="Close"
            onClick={() => window.nolira?.windowControl?.("close")}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M0 0 10 10M10 0 0 10"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
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
      {path ? <span className="nol-footer-path">{path}</span> : null}
      <div className="nol-flex1" />
      <div className="nol-footer-meta">
        <span>
          {runningCount} running · {reviewCount} to review
        </span>
        <span>{model}</span>
        <span>{isMac(platform) ? "⌘K" : "Ctrl K"}</span>
      </div>
    </footer>
  )
}
