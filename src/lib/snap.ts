const STEP = Math.PI / 4

/**
 * Snap (x, y) so the line from (ox, oy) points at a multiple of 45°, keeping its length.
 * Snapping is on by default; holding Ctrl or Option/Alt draws at any angle. Touch input has no
 * modifier keys, so on a tablet it's always snapped.
 */
export function snapAngle(ox: number, oy: number, x: number, y: number, e: { ctrlKey: boolean; altKey: boolean }) {
  if (e.ctrlKey || e.altKey) return { x, y }
  const len = Math.hypot(x - ox, y - oy)
  const a = Math.round(Math.atan2(y - oy, x - ox) / STEP) * STEP
  return { x: ox + len * Math.cos(a), y: oy + len * Math.sin(a) }
}

/** True on devices with a precise pointer (mouse/trackpad), where the modifier-key hint is useful. */
export const hasFinePointer = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches
