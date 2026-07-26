export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.2 14.15 9.85 21.8 12l-7.65 2.15L12 21.8l-2.15-7.65L2.2 12l7.65-2.15L12 2.2Z" />
        <circle cx="12" cy="12" r="2.2" />
      </svg>
    </span>
  )
}
