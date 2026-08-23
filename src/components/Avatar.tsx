export default function Avatar({
  emoji,
  color,
  size = 34,
}: {
  emoji: string
  color: string
  size?: number
}) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-full shrink-0 select-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.52,
        background: `color-mix(in srgb, ${color} 22%, #182130)`,
        border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
      }}
    >
      {emoji}
    </span>
  )
}
