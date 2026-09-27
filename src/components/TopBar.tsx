import { useRef, useState } from 'react'
import { useActivePlan, useStore } from '../store'
import { useUi } from '../uiStore'
import { importFloorplan, removePlan, startCalibration } from '../lib/actions'
import { exportBackup, importBackup } from '../lib/backup'

export function TopBar() {
  const plans = useStore((s) => s.plans)
  const plan = useActivePlan()
  const units = useStore((s) => s.units)
  const setUnits = useStore((s) => s.setUnits)
  const opacity = useStore((s) => s.floorplanOpacity)
  const setOpacity = useStore((s) => s.setFloorplanOpacity)
  const setActivePlan = useStore((s) => s.setActivePlan)
  const renamePlan = useStore((s) => s.renamePlan)
  const mode = useUi((s) => s.mode)
  const setMode = useUi((s) => s.setMode)
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
                  {p.name}
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

      {plan && mode === 'arrange' && (
        <>
          <label className="opacity" title="Floorplan opacity">
            <span aria-hidden>◐</span>
            <input type="range" min={0.15} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} aria-label="Floorplan opacity" />
          </label>
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
                  {confirmDelete ? `Really delete “${plan.name}”?` : 'Delete floorplan'}
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
