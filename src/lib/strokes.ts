import { getStroke } from 'perfect-freehand'
import type { Stroke } from '../types'

const r = (n: number) => Math.round(n * 100) / 100

function outlineToPath(outline: number[][]): string {
  if (outline.length < 2) return ''
  const d: (string | number)[] = ['M', r(outline[0][0]), r(outline[0][1]), 'Q']
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i]
    const [x1, y1] = outline[(i + 1) % outline.length]
    d.push(r(x0), r(y0), r((x0 + x1) / 2), r((y0 + y1) / 2))
  }
  d.push('Z')
  return d.join(' ')
}

const cache = new WeakMap<Stroke, string>()

/** SVG path data (filled outline) for a stroke. Shared by the SVG editor and the Konva canvas. */
export function strokePath(stroke: Stroke, last = true): string {
  const cached = last ? cache.get(stroke) : undefined
  if (cached !== undefined) return cached
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    thinning: stroke.pen ? 0.6 : 0.5,
    smoothing: 0.5,
    streamline: 0.35,
    simulatePressure: !stroke.pen,
    last,
  })
  const path = outlineToPath(outline)
  if (last) cache.set(stroke, path)
  return path
}

export function scaleStrokes(strokes: Stroke[], sx: number, sy: number): Stroke[] {
  const s = Math.sqrt(sx * sy)
  return strokes.map((st) => ({
    ...st,
    size: st.size * s,
    points: st.points.map(([x, y, p]) => [x * sx, y * sy, p] as [number, number, number]),
  }))
}

/** Index of strokes that pass within `radius` of (x, y). */
export function strokesNear(strokes: Stroke[], x: number, y: number, radius: number): Set<number> {
  const hits = new Set<number>()
  strokes.forEach((st, i) => {
    const rr = radius + st.size / 2
    const pts = st.points
    for (let j = 0; j < pts.length; j++) {
      const [ax, ay] = pts[j]
      const [bx, by] = pts[Math.min(j + 1, pts.length - 1)]
      if (distToSegment(x, y, ax, ay, bx, by) <= rr) {
        hits.add(i)
        return
      }
    }
  })
  return hits
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
