import { Icon } from "../../icons"
import { isMac } from "../../lib/platform"

export function WindowChrome({ platform }: { platform: string }) {
  const showControls = !isMac(platform) && platform !== "web"
  return (
    <div className="window-chrome">
      <div className="window-title" aria-hidden="true">
        Nolira Agents
      </div>
      {showControls && (
        <div
          className="window-controls no-drag"
          role="group"
          aria-label="Window controls"
        >
          <button
            aria-label="Minimize window"
            onClick={() => window.nolira?.windowControl?.("minimize")}
          >
            <span className="window-minimize" />
          </button>
          <button
            aria-label="Maximize window"
            onClick={() => window.nolira?.windowControl?.("maximize")}
          >
            <span className="window-maximize" />
          </button>
          <button
            aria-label="Close window"
            className="window-close"
            onClick={() => window.nolira?.windowControl?.("close")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
