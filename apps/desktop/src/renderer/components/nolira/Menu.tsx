import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"

import { Icon, type IconName } from "../../icons"

export interface MenuOption {
  value: string
  label: string
  hint?: string
  icon?: IconName
  danger?: boolean
}

export interface MenuProps {
  options: MenuOption[]
  value?: string
  onSelect: (value: string) => void
  ariaLabel: string
  /** Trigger flavor from the design: pill (mode), mono (model), box (project), setting (dialog rows). */
  variant?: "pill" | "mono" | "box" | "setting"
  drop?: "up" | "down" | "down-right"
  icon?: IconName
  label?: ReactNode
  mono?: boolean
  minWidth?: number
  className?: string
}

/** Self-drawn dropdown — replaces native selects, per the design handoff. */
export function Menu({
  options,
  value,
  onSelect,
  ariaLabel,
  variant = "pill",
  drop = "down",
  icon,
  label,
  mono = false,
  minWidth,
  className = "",
}: MenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const current = options.find((option) => option.value === value)
  const triggerClass =
    variant === "pill"
      ? "nol-menu-trigger-pill"
      : variant === "mono"
        ? "nol-menu-trigger-mono"
        : variant === "setting"
          ? "nol-menu-trigger-setting"
          : `nol-menu-trigger-box${mono ? " nol-mono" : ""}`
  const popStyle: CSSProperties | undefined = minWidth
    ? { minWidth }
    : undefined

  return (
    <div
      className={`nol-menu ${className}`.trim()}
      data-open={open}
      ref={rootRef}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={triggerClass}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {icon && (
          <Icon name={icon} size={16} style={{ color: "var(--mu)" }} />
        )}
        <span>{label ?? current?.label ?? value}</span>
        <Icon className="nol-menu-chev" name="chevron-down" size={13} />
      </button>
      {open && (
        <div
          className="nol-menu-pop"
          data-drop={drop}
          role="listbox"
          style={popStyle}
        >
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`nol-menu-item${mono ? " nol-mono" : ""}${option.danger ? " nol-danger" : ""}`}
              data-active={option.value === value}
              key={option.value}
              onClick={() => {
                setOpen(false)
                onSelect(option.value)
              }}
            >
              {option.icon && (
                <Icon
                  name={option.icon}
                  size={15}
                  style={{ color: "var(--mu)" }}
                />
              )}
              <span
                className="nol-menu-label"
                style={mono ? { fontFamily: "var(--nol-mono)" } : undefined}
              >
                {option.label}
              </span>
              {option.hint && (
                <span className="nol-menu-hint">{option.hint}</span>
              )}
              {option.value === value && (
                <Icon className="nol-menu-check" name="check" size={14} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export interface ActionMenuAction {
  id: string
  label: string
  danger?: boolean
}

/** The per-card hover “⋯” action menu from the design. */
export function ActionMenu({
  actions,
  onAction,
  open,
  onToggle,
  buttonClassName = "nol-card-menu-btn",
}: {
  actions: ActionMenuAction[]
  onAction: (id: string) => void
  open: boolean
  onToggle: (open: boolean) => void
  buttonClassName?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onToggle(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onToggle(false)
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onToggle])

  return (
    <div className="nol-menu" ref={rootRef} data-open={open}>
      <button
        type="button"
        aria-label="Actions"
        title="Actions"
        className={buttonClassName}
        onClick={(event) => {
          event.stopPropagation()
          onToggle(!open)
        }}
      >
        <Icon name="more" size={16} />
      </button>
      {open && (
        <div
          className="nol-menu-pop"
          data-drop="down-right"
          style={{ minWidth: 186 }}
        >
          {actions.map((action) => (
            <button
              type="button"
              className={`nol-menu-item${action.danger ? " nol-danger" : ""}`}
              key={action.id}
              onClick={(event) => {
                event.stopPropagation()
                onToggle(false)
                onAction(action.id)
              }}
            >
              <span className="nol-menu-label">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
