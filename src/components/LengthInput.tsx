import { useId, useState } from 'react'
import { useStore } from '../store'
import { formatLength, parseLength, TO_CM, type LengthUnit } from '../lib/units'

interface Props {
  label: string
  valueCm: number | null
  onChange: (cm: number | null) => void
  /** Unit used for bare numbers. Defaults to cm (metric) or in (imperial). */
  defaultUnit?: LengthUnit
  autoFocus?: boolean
  onEnter?: () => void
  placeholder?: string
}

const UNITS: LengthUnit[] = ['cm', 'm', 'mm', 'in', 'ft']

export function LengthInput({ label, valueCm, onChange, defaultUnit, autoFocus, onEnter, placeholder }: Props) {
  const units = useStore((s) => s.units)
  const id = useId()
  const [unit, setUnit] = useState<LengthUnit>(defaultUnit ?? (units === 'metric' ? 'cm' : 'in'))
  const [text, setText] = useState(() => (valueCm ? String(parseFloat((valueCm / TO_CM[unit]).toFixed(2))) : ''))
  const parsed = parseLength(text, unit)
  const invalid = text.trim() !== '' && parsed === null

  const update = (t: string, u: LengthUnit) => {
    setText(t)
    setUnit(u)
    onChange(parseLength(t, u))
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`length-input ${invalid ? 'invalid' : ''}`}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          placeholder={placeholder}
          onChange={(e) => update(e.target.value, unit)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        />
        <select value={unit} onChange={(e) => update(text, e.target.value as LengthUnit)} aria-label={`${label} unit`}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <div className="hint">
        {invalid ? 'Not a length I understand' : parsed ? `${formatLength(parsed, 'metric')} · ${formatLength(parsed, 'imperial')}` : ' '}
      </div>
    </div>
  )
}
