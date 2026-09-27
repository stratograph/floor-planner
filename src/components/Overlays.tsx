import { useEffect, useRef, useState } from 'react'
import type { Plan } from '../types'
import { useStore } from '../store'
import { useUi } from '../uiStore'
import { formatDims, formatLength } from '../lib/units'
import { LengthInput } from './LengthInput'
import { rotateGroup } from '../lib/group'
import { hasFinePointer } from '../lib/snap'

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
    // Same tick, so both form one undo step, labelled by the first ("Set scale").
    calibratePlan(plan.id, { ...calLine, lengthCm }, cmPerPx)
    renamePlan(plan.id, name.trim())
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
          <SnapHint />
        </p>
      ) : (
        <>
          <p>
            Drag the end points to fine-tune, then enter how long that line is.
            <SnapHint />
          </p>
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

/** Lines snap to 45° steps; on a mouse/trackpad device, say how to turn that off. */
function SnapHint() {
  return hasFinePointer() ? <span className="snap-hint"> Snaps to 45° — hold Ctrl or ⌥ for any angle.</span> : null
}

export function MeasureBar() {
  const setMode = useUi((s) => s.setMode)
  return (
    <div className="overlay-card measure-bar">
      <span>
        Drag across the plan to measure. Tap to clear.
        <SnapHint />
      </span>
      <button className="btn small primary" onClick={() => setMode('arrange')}>
        Done
      </button>
    </div>
  )
}

export function SelectionBar({ plan }: { plan: Plan }) {
  const selectedIds = useUi((s) => s.selectedIds)
  const select = useUi((s) => s.select)
  const multiSelect = useUi((s) => s.multiSelect)
  const setMultiSelect = useUi((s) => s.setMultiSelect)
  const units = useStore((s) => s.units)
  const library = useStore((s) => s.library)
  const updatePlacements = useStore((s) => s.updatePlacements)
  const removePlacements = useStore((s) => s.removePlacements)

  const items = new Map(library.map((i) => [i.id, i]))
  const pls = plan.placements.filter((p) => selectedIds.includes(p.id) && items.has(p.itemId))

  if (!pls.length) {
    return multiSelect ? (
      <div className="overlay-card measure-bar">
        <span>Tap pieces to select them, or drag a box around them.</span>
        <button className="btn small primary" onClick={() => setMultiSelect(false)}>
          Done
        </button>
      </div>
    ) : null
  }

  const single = pls.length === 1 ? pls[0] : null
  const item = single && items.get(single.itemId)!
  // Quick repeated taps (e.g. ↻5° six times) undo as one step.
  const rotate = (d: number) => updatePlacements(rotateGroup(pls, items, d), { coalesce: `rotate:${selectedIds.join()}` })

  return (
    <div className="overlay-card selection">
      <div className="selection-info">
        {single && item ? (
          <>
            <strong>{item.name}</strong>
            <span>
              {formatDims(item.width, item.depth, units)} · {single.rotation}°
            </span>
          </>
        ) : (
          <>
            <strong>{pls.length} pieces selected</strong>
            <span>Drag any of them to move the group</span>
          </>
        )}
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
            removePlacements(pls.map((p) => p.id))
            select(null)
          }}
        >
          Put back{pls.length > 1 ? ` ${pls.length}` : ''}
        </button>
        {multiSelect && (
          <button className="btn small primary" onClick={() => setMultiSelect(false)}>
            Done
          </button>
        )}
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
