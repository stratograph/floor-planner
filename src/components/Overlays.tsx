import { useEffect, useRef, useState } from 'react'
import type { Plan } from '../types'
import { useStore } from '../store'
import { useUi } from '../uiStore'
import { formatDims, formatLength } from '../lib/units'
import { LengthInput } from './LengthInput'
import { snapRotation } from './PlanCanvas'

export function CalibrationBar({ plan }: { plan: Plan }) {
  const calLine = useUi((s) => s.calLine)
  const setMode = useUi((s) => s.setMode)
  const showToast = useUi((s) => s.showToast)
  const units = useStore((s) => s.units)
  const calibratePlan = useStore((s) => s.calibratePlan)
  const renamePlan = useStore((s) => s.renamePlan)
  const [name, setName] = useState(plan.name)
  const [lengthCm, setLengthCm] = useState<number | null>(plan.calibration?.lengthCm ?? null)

  // After each line is drawn, move focus to the next thing to fill in: the name if it's blank, else the length.
  // (Done on pointer-up; focusing on pointer-down would be undone by the canvas taking focus.)
  const cardRef = useRef<HTMLDivElement>(null)
  const calLineDrawn = useUi((s) => s.calLineDrawn)
  useEffect(() => {
    if (!calLineDrawn) return
    const t = setTimeout(() => {
      const card = cardRef.current
      const target = card?.querySelector<HTMLInputElement>('#plan-name')?.value.trim() ? '.length-input input' : '#plan-name'
      card?.querySelector<HTMLInputElement>(target)?.focus({ preventScroll: true })
    }, 0)
    return () => clearTimeout(t)
  }, [calLineDrawn])

  const linePx = calLine ? Math.hypot(calLine.x2 - calLine.x1, calLine.y2 - calLine.y1) : 0
  const canApply = !!calLine && linePx > 1 && !!lengthCm && !!name.trim()

  const apply = () => {
    if (!calLine || !lengthCm || !canApply) return
    const cmPerPx = lengthCm / linePx
    renamePlan(plan.id, name.trim())
    calibratePlan(plan.id, { ...calLine, lengthCm }, cmPerPx)
    setMode('arrange')
    const w = formatLength(plan.imageWidth * cmPerPx, units)
    const h = formatLength(plan.imageHeight * cmPerPx, units)
    showToast(`Scale set — the whole image is ${w} × ${h}`)
  }

  return (
    <div className="overlay-card calibration" ref={cardRef}>
      <h3>{plan.cmPerPx ? 'Set the scale' : 'Set up this floorplan'}</h3>
      <div className="field plan-name-field">
        <label htmlFor="plan-name">Floorplan name</label>
        <input
          id="plan-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. 14 Elm Road — 2 bed flat"
          autoComplete="off"
        />
      </div>
      {!calLine ? (
        <p>
          Draw a line along something whose length is printed on the plan — ideally a long room dimension. Pinch or use the
          zoom buttons for precision.
        </p>
      ) : (
        <>
          <p>Drag the end points to fine-tune, then enter how long that line is.</p>
          <div className="calibration-row">
            <LengthInput
              label="Line length"
              valueCm={lengthCm}
              onChange={setLengthCm}
              defaultUnit={units === 'metric' ? 'm' : 'ft'}
              placeholder={units === 'metric' ? 'e.g. 3.45 m' : `e.g. 11' 4"`}
              onEnter={apply}
            />
            <button className="btn primary" disabled={!canApply} onClick={apply}>
              Set scale
            </button>
          </div>
          {!name.trim() && <div className="hint warn">Name the floorplan to finish.</div>}
        </>
      )}
      {plan.cmPerPx && (
        <button className="btn small link" onClick={() => setMode('arrange')}>
          Cancel — keep current scale
        </button>
      )}
    </div>
  )
}

export function MeasureBar() {
  const setMode = useUi((s) => s.setMode)
  return (
    <div className="overlay-card measure-bar">
      <span>Drag across the plan to measure. Tap to clear.</span>
      <button className="btn small primary" onClick={() => setMode('arrange')}>
        Done
      </button>
    </div>
  )
}

export function SelectionBar({ plan }: { plan: Plan }) {
  const selectedId = useUi((s) => s.selectedId)
  const select = useUi((s) => s.select)
  const units = useStore((s) => s.units)
  const library = useStore((s) => s.library)
  const updatePlacement = useStore((s) => s.updatePlacement)
  const removePlacement = useStore((s) => s.removePlacement)

  const pl = plan.placements.find((p) => p.id === selectedId)
  const item = pl && library.find((i) => i.id === pl.itemId)
  if (!pl || !item) return null

  const rotate = (d: number) => updatePlacement(pl.id, { rotation: snapRotation(pl.rotation + d) })

  return (
    <div className="overlay-card selection">
      <div className="selection-info">
        <strong>{item.name}</strong>
        <span>
          {formatDims(item.width, item.depth, units)} · {pl.rotation}°
        </span>
      </div>
      <div className="selection-actions">
        <button className="btn small" onClick={() => rotate(-5)} aria-label="Rotate 5° anticlockwise">
          ↺ 5°
        </button>
        <button className="btn small" onClick={() => rotate(5)} aria-label="Rotate 5° clockwise">
          ↻ 5°
        </button>
        <button className="btn small" onClick={() => rotate(90)} aria-label="Rotate 90° clockwise">
          ↻ 90°
        </button>
        <button
          className="btn small"
          onClick={() => {
            removePlacement(pl.id)
            select(null)
          }}
        >
          Put back
        </button>
      </div>
    </div>
  )
}

export function Toast() {
  const toast = useUi((s) => s.toast)
  return toast ? (
    <div className="toast" role="status">
      {toast}
    </div>
  ) : null
}
