export const TRANSPARENT = 'transparent'

interface Props {
  colors: string[]
  value: string
  onChange: (color: string) => void
  /** Offer a "no fill" swatch before the presets. */
  allowTransparent?: boolean
  /** Show the selection ring (e.g. off while the eraser is active). */
  active?: boolean
  label: string
}

/** Preset swatches plus a custom colour picker. A custom colour shows in the picker swatch once chosen. */
export function ColorSwatches({ colors, value, onChange, allowTransparent, active = true, label }: Props) {
  const isPreset = value === TRANSPARENT || colors.some((c) => c.toLowerCase() === value.toLowerCase())
  const on = (c: string) => (active && c.toLowerCase() === value.toLowerCase() ? 'on' : '')

  return (
    <div className="swatches" role="group" aria-label={label}>
      {allowTransparent && (
        <button className={`swatch transparent ${on(TRANSPARENT)}`} onClick={() => onChange(TRANSPARENT)} aria-label={`${label}: transparent`} title="Transparent" />
      )}
      {colors.map((c) => (
        <button key={c} className={`swatch ${on(c)}`} style={{ background: c }} onClick={() => onChange(c)} aria-label={`${label}: ${c}`} />
      ))}
      <label
        className={`swatch picker ${!isPreset ? `custom ${active ? 'on' : ''}` : ''}`}
        style={!isPreset ? { background: value } : undefined}
        title="Pick any colour"
      >
        <input
          type="color"
          // <input type="color"> only accepts #rrggbb.
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#888888'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label}: custom colour`}
        />
      </label>
    </div>
  )
}
