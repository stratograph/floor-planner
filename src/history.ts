import { create } from 'zustand'
import type { FurnitureItem, Plan } from './types'

/** The parts of the saved state that count as "your work" and can be undone. View preferences aren't included. */
export interface DocSnapshot {
  library: FurnitureItem[]
  plans: Plan[]
  activePlanId: string | null
}

interface Entry {
  /** State before the change. Snapshots share structure with live state, so they're cheap. */
  before: DocSnapshot
  label: string
  coalesceKey?: string
  at: number
}

const LIMIT = 100
const COALESCE_MS = 1000

let past: Entry[] = []
let future: Entry[] = []
// Several store updates in one tick (e.g. every piece of a dragged group firing dragend) form one step.
let batchOpen = false

/** Buttons subscribe to this; the stacks themselves live outside React. */
export const useHistory = create<{ canUndo: boolean; canRedo: boolean }>()(() => ({ canUndo: false, canRedo: false }))
const sync = () => useHistory.setState({ canUndo: past.length > 0, canRedo: future.length > 0 })

/**
 * Call before applying a change. `coalesceKey` merges repeated quick changes (e.g. arrow-key nudges)
 * into one step when they arrive within a second of each other.
 */
export function record(before: DocSnapshot, label: string, coalesceKey?: string) {
  const now = Date.now()
  const last = past[past.length - 1]
  if (batchOpen) return
  batchOpen = true
  setTimeout(() => (batchOpen = false), 0)
  if (coalesceKey && last?.coalesceKey === coalesceKey && now - last.at < COALESCE_MS) {
    last.at = now
    return
  }
  past = [...past.slice(-(LIMIT - 1)), { before, label, coalesceKey, at: now }]
  future = []
  sync()
}

/** Pops the last change: returns the state to restore and pushes `current` onto the redo stack. */
export function takeUndo(current: DocSnapshot): Entry | null {
  const entry = past.pop()
  if (!entry) return null
  future.push({ ...entry, before: current })
  sync()
  return entry
}

export function takeRedo(current: DocSnapshot): Entry | null {
  const entry = future.pop()
  if (!entry) return null
  past.push({ ...entry, before: current, coalesceKey: undefined })
  sync()
  return entry
}
