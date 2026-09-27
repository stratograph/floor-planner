import type { FurnitureItem, Placement } from '../types'

/** Normalise an angle to [0, 360) and snap it to 5°. */
export const snapRotation = (deg: number) => (((Math.round(deg / 5) * 5) % 360) + 360) % 360

/** Centre of the axis-aligned box around the pieces' rotated footprints — the same pivot the on-canvas rotate handle uses. */
export function groupCenter(pls: Placement[], items: Map<string, FurnitureItem>) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const pl of pls) {
    const item = items.get(pl.itemId)
    const hw = (item?.width ?? 0) / 2
    const hd = (item?.depth ?? 0) / 2
    const a = (pl.rotation * Math.PI) / 180
    const ex = Math.abs(hw * Math.cos(a)) + Math.abs(hd * Math.sin(a))
    const ey = Math.abs(hw * Math.sin(a)) + Math.abs(hd * Math.cos(a))
    minX = Math.min(minX, pl.x - ex)
    maxX = Math.max(maxX, pl.x + ex)
    minY = Math.min(minY, pl.y - ey)
    maxY = Math.max(maxY, pl.y + ey)
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

/** Rotate a group of pieces together by `delta` degrees around their shared centre. */
export function rotateGroup(pls: Placement[], items: Map<string, FurnitureItem>, delta: number) {
  if (pls.length === 1) return [{ id: pls[0].id, rotation: snapRotation(pls[0].rotation + delta) }]
  const c = groupCenter(pls, items)
  const a = (delta * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return pls.map((pl) => {
    const dx = pl.x - c.x
    const dy = pl.y - c.y
    return { id: pl.id, x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos, rotation: snapRotation(pl.rotation + delta) }
  })
}
