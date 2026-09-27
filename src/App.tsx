import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useActivePlan, useStore } from './store'
import { useUi } from './uiStore'
import { cleanUpOrphanImages, importFloorplan, redo, undo } from './lib/actions'
import { TopBar } from './components/TopBar'
import { DragGhost, LibraryPanel } from './components/LibraryPanel'
import { PlanCanvas } from './components/PlanCanvas'
import { FurnitureEditor } from './components/FurnitureEditor'
import { CalibrationBar, MeasureBar, SelectionBar, Toast } from './components/Overlays'
import { PackDialog } from './components/PackDialog'

const useHydrated = () =>
  useSyncExternalStore(
    (cb) => useStore.persist.onFinishHydration(cb),
    () => useStore.persist.hasHydrated(),
  )

export default function App() {
  const hydrated = useHydrated()
  const plan = useActivePlan()
  const mode = useUi((s) => s.mode)
  const setMode = useUi((s) => s.setMode)
  const editing = useUi((s) => s.editing)

  // Tidy up images left behind by floorplans deleted in earlier sessions (kept until then so deletion can be undone).
  useEffect(() => {
    if (hydrated) cleanUpOrphanImages().catch(() => {})
  }, [hydrated])

  // Undo / redo shortcuts: ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k !== 'z' && k !== 'y') return
      // Leave text fields their own undo, and don't undo behind an open dialog.
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return
      const ui = useUi.getState()
      if (ui.editing || ui.packDialog) return
      e.preventDefault()
      if (k === 'y' || e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // An uncalibrated floorplan can only be calibrated.
  useEffect(() => {
    if (plan && !plan.cmPerPx && mode !== 'calibrate') setMode('calibrate')
    if (!plan && mode !== 'arrange') setMode('arrange')
  }, [plan, mode, setMode])

  if (!hydrated) return <div className="boot">Loading…</div>

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <LibraryPanel />
        <main className="stage-area">
          {plan ? (
            <>
              <PlanCanvas key={plan.id} plan={plan} />
              {mode === 'calibrate' ? (
                <CalibrationBar key={`cal-${plan.id}`} plan={plan} />
              ) : mode === 'measure' ? (
                <MeasureBar />
              ) : (
                <SelectionBar plan={plan} />
              )}
            </>
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
      {editing && <FurnitureEditor key={editing} itemId={editing} />}
      <PackDialog />
      <DragGhost />
      <Toast />
    </div>
  )
}

function EmptyState() {
  const input = useRef<HTMLInputElement>(null)
  const showToast = useUi((s) => s.showToast)
  return (
    <div className="empty">
      <div className="empty-card">
        <h1>Try out furniture layouts on a real floorplan</h1>
        <ol>
          <li>Import a floorplan image from a listing.</li>
          <li>Draw a line over a known dimension and enter its length to set the scale.</li>
          <li>Add your furniture to the library with real dimensions — sketch on it with your Pencil.</li>
          <li>Drag pieces onto the plan, rotate them, and see what's left over.</li>
        </ol>
        <button className="btn primary" onClick={() => input.current?.click()}>
          Import a floorplan
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) await importFloorplan(file).catch((err: Error) => showToast(`Couldn't import: ${err.message}`))
          }}
        />
        <p className="muted">Everything is stored on this device only. Use ⋯ → Export backup to move it elsewhere.</p>
      </div>
    </div>
  )
}
