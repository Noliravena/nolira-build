import { Icon } from "../../icons"

export interface SelectControlProps {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  compact?: boolean
  prefix?: string
}

export function SelectControl({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  compact,
  prefix,
}: SelectControlProps) {
  return (
    <label
      className={`select-control ${compact ? "compact" : ""} ${className}`}
    >
      {prefix && <span>{prefix}</span>}
      <select
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={14} />
    </label>
  )
}
