import type { Units } from '../types'

export type LengthUnit = 'cm' | 'm' | 'mm' | 'in' | 'ft'

export const TO_CM: Record<LengthUnit, number> = { mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 }

const NUM = String.raw`(\d+(?:\.\d+)?|\.\d+)`
const FEET_INCHES = new RegExp(
  String.raw`^(?:${NUM}\s*(?:'|’|ft|feet|foot))?\s*(?:${NUM}\s*(?:"|”|''|in|inch|inches))?$`,
)
const WITH_UNIT = new RegExp(String.raw`^${NUM}\s*(mm|cm|m|in|ft)?$`)

/**
 * Parse a length typed by the user. Accepts things like "3.45 m", "345cm", "11' 4\"", "11ft 4in", "30in".
 * A bare number is interpreted in `fallback` units. Returns cm, or null if unparseable / non-positive.
 */
export function parseLength(input: string, fallback: LengthUnit): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, '.')
  if (!s) return null

  const withUnit = s.match(WITH_UNIT)
  if (withUnit) {
    const n = parseFloat(withUnit[1])
    const unit = (withUnit[2] as LengthUnit | undefined) ?? fallback
    return n > 0 ? n * TO_CM[unit] : null
  }

  const fi = s.match(FEET_INCHES)
  if (fi && (fi[1] || fi[2])) {
    const inches = parseFloat(fi[1] ?? '0') * 12 + parseFloat(fi[2] ?? '0')
    return inches > 0 ? inches * 2.54 : null
  }
  return null
}

const trim = (n: number, digits: number) => String(parseFloat(n.toFixed(digits)))

export function formatLength(cm: number, units: Units): string {
  if (units === 'metric') {
    return cm >= 100 ? `${trim(cm / 100, 2)} m` : `${trim(cm, 1)} cm`
  }
  const totalIn = Math.round((cm / 2.54) * 2) / 2
  if (totalIn < 12) return `${trim(totalIn, 1)}″`
  const ft = Math.floor(totalIn / 12)
  const inch = totalIn - ft * 12
  return inch ? `${ft}′ ${trim(inch, 1)}″` : `${ft}′`
}

export function formatDims(w: number, d: number, units: Units): string {
  if (units === 'metric') return `${trim(w, 1)} × ${trim(d, 1)} cm`
  return `${formatLength(w, units)} × ${formatLength(d, units)}`
}

/** A human-friendly value for pre-filling an input, e.g. "200" (cm) or "6' 7\"". */
export function lengthInputValue(cm: number, units: Units): string {
  if (units === 'metric') return trim(cm, 1)
  const totalIn = Math.round((cm / 2.54) * 2) / 2
  const ft = Math.floor(totalIn / 12)
  const inch = totalIn - ft * 12
  if (!ft) return `${trim(inch, 1)}"`
  return inch ? `${ft}' ${trim(inch, 1)}"` : `${ft}'`
}

const METRIC_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
const IMPERIAL_STEPS_IN = [1, 2, 3, 6, 12, 24, 36, 60, 120, 240, 600]

/** Pick a round length no longer than `targetCm`, for the scale bar. */
export function niceLength(targetCm: number, units: Units): { cm: number; label: string } {
  if (units === 'metric') {
    const cm = METRIC_STEPS.reduce((best, c) => (c <= targetCm ? c : best), METRIC_STEPS[0])
    return { cm, label: cm >= 100 ? `${cm / 100} m` : `${cm} cm` }
  }
  const inches = IMPERIAL_STEPS_IN.reduce((best, c) => (c * 2.54 <= targetCm ? c : best), 1)
  return { cm: inches * 2.54, label: inches >= 12 ? `${inches / 12} ft` : `${inches} in` }
}
