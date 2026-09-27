import { create } from 'zustand'
import type { ParsedPack } from './lib/packs'

export interface View {
  x: number
  y: number
  /** Screen pixels per cm. */
  scale: number
}

export type Mode = 'arrange' | 'calibrate' | 'measure'

/** Calibration line endpoints, in floorplan image pixels. */
export interface CalLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface UiState {
  view: View
  setView: (view: View) => void
  mode: Mode
  setMode: (mode: Mode) => void
  calLine: CalLine | null
  /** The measuring tool's line, in world cm. Never persisted; cleared whenever the mode changes. */
  measureLine: CalLine | null
  setMeasureLine: (line: CalLine | null) => void
  setCalLine: (line: CalLine | null) => void
  /** Bumped each time the user finishes drawing a calibration line. */
  calLineDrawn: number
  markCalLineDrawn: () => void
  /** Selected placements, in the order they were selected. */
  selectedIds: string[]
  /** Select just this one piece (or clear the selection with null). */
  select: (id: string | null) => void
  setSelection: (ids: string[]) => void
  toggleSelected: (id: string) => void
  /** Touch-friendly multi-select: taps add/remove pieces and one-finger drags on empty floor draw a selection box. */
  multiSelect: boolean
  setMultiSelect: (on: boolean) => void
  /** The furniture item currently open in the editor ('new' for a fresh one). */
  editing: string | null
  setEditing: (id: string | null) => void
  /** Library item being dragged towards the canvas. */
  drag: { itemId: string; clientX: number; clientY: number } | null
  setDrag: (drag: UiState['drag']) => void
  packDialog: { mode: 'export' } | { mode: 'import'; pack: ParsedPack } | null
  setPackDialog: (d: UiState['packDialog']) => void
  canvasEl: HTMLElement | null
  setCanvasEl: (el: HTMLElement | null) => void
  toast: string | null
  showToast: (msg: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useUi = create<UiState>()((set) => ({
  view: { x: 0, y: 0, scale: 1 },
  setView: (view) => set({ view }),
  mode: 'arrange',
  setMode: (mode) => set({ mode, selectedIds: [], measureLine: null, multiSelect: false }),
  measureLine: null,
  setMeasureLine: (measureLine) => set({ measureLine }),
  calLine: null,
  setCalLine: (calLine) => set({ calLine }),
  calLineDrawn: 0,
  markCalLineDrawn: () => set((s) => ({ calLineDrawn: s.calLineDrawn + 1 })),
  selectedIds: [],
  select: (id) => set({ selectedIds: id ? [id] : [] }),
  setSelection: (selectedIds) => set({ selectedIds }),
  toggleSelected: (id) =>
    set((s) => ({ selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id] })),
  multiSelect: false,
  setMultiSelect: (multiSelect) => set({ multiSelect }),
  editing: null,
  setEditing: (editing) => set({ editing }),
  drag: null,
  setDrag: (drag) => set({ drag }),
  packDialog: null,
  setPackDialog: (packDialog) => set({ packDialog }),
  canvasEl: null,
  setCanvasEl: (canvasEl) => set({ canvasEl }),
  toast: null,
  showToast: (toast) => {
    clearTimeout(toastTimer)
    set({ toast })
    toastTimer = setTimeout(() => set({ toast: null }), 2600)
  },
}))

/** Convert a client (page) coordinate to world cm, or null if it's outside the canvas. */
export function clientToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
  const { canvasEl, view } = useUi.getState()
  if (!canvasEl) return null
  const r = canvasEl.getBoundingClientRect()
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null
  return { x: (clientX - r.left - view.x) / view.scale, y: (clientY - r.top - view.y) / view.scale }
}

export function viewCenterWorld(): { x: number; y: number } | null {
  const { canvasEl } = useUi.getState()
  if (!canvasEl) return null
  const r = canvasEl.getBoundingClientRect()
  return clientToWorld(r.left + r.width / 2, r.top + r.height / 2)
}
