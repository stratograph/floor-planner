import { useRef, useState } from 'react'
import { useActivePlan, useStore } from '../store'
import { useUi } from '../uiStore'
import { importFloorplan, planLabel, redo, removePlan, startCalibration, undo } from '../lib/actions'
import { useHistory } from '../history'
import { exportBackup, importBackup } from '../lib/backup'

export function TopBar() {
  const plans = useStore((s) => s.plans)
  const plan = useActivePlan()
  const units = useStore((s) => s.units)
  const setUnits = useStore((s) => s.setUnits)
  const opacity = useStore((s) => s.floorplanOpacity)
  const setOpacity = useStore((s) => s.setFloorplanOpacity)
  const showLabels = useStore((s) => s.showLabels)
  const setShowLabels = useStore((s) => s.setShowLabels)
  const setActivePlan = useStore((s) => s.setActivePlan)
  const renamePlan = useStore((s) => s.renamePlan)
  const mode = useUi((s) => s.mode)
  const setMode = useUi((s) => s.setMode)
  const canUndo = useHistory((s) => s.canUndo)
  const canRedo = useHistory((s) => s.canRedo)
  const multiSelect = useUi((s) => s.multiSelect)
  const setMultiSelect = useUi((s) => s.setMultiSelect)
  const showToast = useUi((s) => s.showToast)

  const planFile = useRef<HTMLInputElement>(null)
  const backupFile = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const closeMenu = () => {
    setMenuOpen(false)
    setConfirmDelete(false)
  }

  return (
    <header className="topbar">
      <div className="brand">
        <img src="./icon.svg" alt="" width={26} height={26} />
        <span>Floorplan</span>
      </div>

      <div className="history-btns">
        <button className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path d="M7 4L3 8l4 4M3 8h8a4 4 0 010 8H9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path d="M11 4l4 4-4 4M15 8H7a4 4 0 000 8h2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="plan-picker">
        {plan &&
          (renaming ? (
            <input
              className="plan-name-input"
              defaultValue={plan.name}
              autoFocus
              onBlur={(e) => {
                renamePlan(plan.id, e.target.value.trim() || plan.name)
                setRenaming(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <select
              value={plan.id}
              onChange={(e) => {
                setActivePlan(e.target.value)
                setMode('arrange')
              }}
              aria-label="Floorplan"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {planLabel(p)}
                </option>
              ))}
            </select>
          ))}
        <button className="btn small" onClick={() => planFile.current?.click()}>
          + Floorplan
        </button>
        <input
          ref={planFile}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              await importFloorplan(file)
            } catch (err) {
              showToast(`Couldn't import: ${(err as Error).message}`)
            }
          }}
        />
      </div>

      <div className="spacer" />

      {plan?.cmPerPx && mode !== 'calibrate' && (
        <>
          <button
            className={`btn small toggle ${multiSelect ? 'on' : ''}`}
            aria-pressed={multiSelect}
            onClick={() => {
              if (mode !== 'arrange') setMode('arrange')
              setMultiSelect(!multiSelect)
            }}
            title="Select several pieces (or Shift-click / Shift-drag)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <rect x="1.5" y="1.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.6" />
              <rect x="6.5" y="6.5" width="8" height="8" rx="1" fill="currentColor" opacity="0.35" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            Select
          </button>
          <button
            className={`btn small toggle ${mode === 'measure' ? 'on' : ''}`}
            aria-pressed={mode === 'measure'}
            onClick={() => setMode(mode === 'measure' ? 'arrange' : 'measure')}
            title="Measure (M)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M1.5 10.5l9-9 4 4-9 9zM4 8l1.5 1.5M6 6l2 2M8 4l1.5 1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            Measure
          </button>
          <label className="opacity" title="Floorplan opacity">
            <span aria-hidden>◐</span>
            <input type="range" min={0.15} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} aria-label="Floorplan opacity" />
          </label>
          <button className={`btn small toggle ${showLabels ? 'on' : ''}`} aria-pressed={showLabels} onClick={() => setShowLabels(!showLabels)}>
            Labels
          </button>
          <button className="btn small" onClick={() => startCalibration(plan)}>
            Scale
          </button>
        </>
      )}

      <div className="seg" role="group" aria-label="Units">
        <button className={units === 'metric' ? 'on' : ''} onClick={() => setUnits('metric')}>
          cm
        </button>
        <button className={units === 'imperial' ? 'on' : ''} onClick={() => setUnits('imperial')}>
          ft
        </button>
      </div>

      <div className="menu-wrap">
        <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="More" aria-expanded={menuOpen}>
          ⋯
        </button>
        {menuOpen && (
          <>
            <div className="menu-backdrop" onClick={closeMenu} />
            <div className="menu" role="menu">
              {plan && (
                <button
                  onClick={() => {
                    setRenaming(true)
                    closeMenu()
                  }}
                >
                  Rename floorplan
                </button>
              )}
              <button
                onClick={() => {
                  closeMenu()
                  exportBackup().catch((err) => showToast(`Export failed: ${err.message}`))
                }}
              >
                Export backup…
              </button>
              <button
                onClick={() => {
                  closeMenu()
                  backupFile.current?.click()
                }}
              >
                Restore from backup…
              </button>
              {plan && (
                <button
                  className="danger"
                  onClick={() => {
                    if (!confirmDelete) return setConfirmDelete(true)
                    closeMenu()
                    removePlan(plan.id)
                  }}
                >
                  {confirmDelete ? `Really delete “${planLabel(plan)}”?` : 'Delete floorplan'}
                </button>
              )}
            </div>
          </>
        )}
        <input
          ref={backupFile}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              await importBackup(file)
              useUi.getState().setMode('arrange')
              showToast('Backup restored')
            } catch (err) {
              showToast(`Couldn't restore: ${(err as Error).message}`)
            }
          }}
        />
      </div>
    </header>
  )
}
