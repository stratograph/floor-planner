import { create } from 'zustand'

export interface View {
  x: number
  y: number
  /** Screen pixels per cm. */
  scale: number
}

export type Mode = 'arrange' | 'calibrate'

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
  setCalLine: (line: CalLine | null) => void
  selectedId: string | null
  select: (id: string | null) => void
  /** The furniture item currently open in the editor ('new' for a fresh one). */
  editing: string | null
  setEditing: (id: string | null) => void
  /** Library item being dragged towards the canvas. */
  drag: { itemId: string; clientX: number; clientY: number } | null
  setDrag: (drag: UiState['drag']) => void
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
  setMode: (mode) => set({ mode, selectedId: null }),
  calLine: null,
  setCalLine: (calLine) => set({ calLine }),
  selectedId: null,
  select: (selectedId) => set({ selectedId }),
  editing: null,
  setEditing: (editing) => set({ editing }),
  drag: null,
  setDrag: (drag) => set({ drag }),
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
