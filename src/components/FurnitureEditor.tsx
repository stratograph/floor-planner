import { useMemo, useState } from 'react'
import type { FurnitureItem, Stroke } from '../types'
import { useStore } from '../store'
import { useUi } from '../uiStore'
import { newId } from '../lib/id'
import { scaleStrokes } from '../lib/strokes'
import { LengthInput } from './LengthInput'
import { DrawingPad } from './DrawingPad'

const FILLS = ['#ffffff', '#f3eee4', '#e8dcc6', '#d9c3a5', '#c7d4c0', '#c9d6e3', '#e7cfd0', '#d8d8d8']

const PRESETS: { name: string; width: number; depth: number }[] = [
  { name: 'Double bed', width: 140, depth: 200 },
  { name: 'Queen bed', width: 160, depth: 200 },
  { name: 'King bed', width: 180, depth: 200 },
  { name: '3-seat sofa', width: 210, depth: 90 },
  { name: 'Armchair', width: 85, depth: 85 },
  { name: 'Dining table', width: 180, depth: 90 },
  { name: 'Dining chair', width: 45, depth: 50 },
  { name: 'Desk', width: 140, depth: 70 },
  { name: 'Wardrobe', width: 100, depth: 60 },
  { name: 'Bookcase', width: 80, depth: 30 },
  { name: 'Rug', width: 200, depth: 300 },
]

export function FurnitureEditor({ itemId }: { itemId: string }) {
  const existing = useStore((s) => s.library.find((i) => i.id === itemId))
  const plans = useStore((s) => s.plans)
  const saveItem = useStore((s) => s.saveItem)
  const deleteItem = useStore((s) => s.deleteItem)
  const close = useUi((s) => s.setEditing)
  const select = useUi((s) => s.select)

  const [name, setName] = useState(existing?.name ?? '')
  const [width, setWidth] = useState<number | null>(existing?.width ?? null)
  const [depth, setDepth] = useState<number | null>(existing?.depth ?? null)
  const [count, setCount] = useState(existing?.count ?? 1)
  const [fill, setFill] = useState(existing?.fill ?? FILLS[1])
  const [strokes, setStrokes] = useState<Stroke[]>(existing?.strokes ?? [])
  // Remount the length inputs when a preset overwrites them.
  const [presetKey, setPresetKey] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // The drawing keeps the last valid size so it doesn't collapse while a dimension is being retyped.
  const [drawSize, setDrawSize] = useState({ w: existing?.width ?? 100, d: existing?.depth ?? 60 })
  const resize = (w: number | null, d: number | null) => {
    if (w && d && (w !== drawSize.w || d !== drawSize.d)) {
      setStrokes((s) => scaleStrokes(s, w / drawSize.w, d / drawSize.d))
      setDrawSize({ w, d })
    }
  }

  const maxPlaced = useMemo(
    () => Math.max(0, ...plans.map((p) => p.placements.filter((pl) => pl.itemId === itemId).length)),
    [plans, itemId],
  )
  const placedIn = plans.filter((p) => p.placements.some((pl) => pl.itemId === itemId)).length

  const valid = !!width && !!depth && count >= 1
  const save = () => {
    if (!width || !depth) return
    const item: FurnitureItem = {
      id: existing?.id ?? newId(),
      name: name.trim() || 'Untitled',
      width,
      depth,
      count,
      fill,
      strokes,
      createdAt: existing?.createdAt ?? Date.now(),
    }
    saveItem(item)
    close(null)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal editor" role="dialog" aria-modal aria-label={existing ? `Edit ${existing.name}` : 'New furniture'}>
        <header className="modal-head">
          <h2>{existing ? 'Edit furniture' : 'New furniture'}</h2>
          <button className="icon-btn" onClick={() => close(null)} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="editor-body">
          <div className="editor-form">
            <div className="field">
              <label htmlFor="item-name">Name</label>
              <input id="item-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grey sofa" autoFocus={!existing} />
            </div>

            {!existing && (
              <div className="presets">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    className="chip"
                    onClick={() => {
                      if (!name.trim()) setName(p.name)
                      setWidth(p.width)
                      setDepth(p.depth)
                      resize(p.width, p.depth)
                      setPresetKey((k) => k + 1)
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            <div className="row" key={presetKey}>
              <LengthInput
                label="Width"
                valueCm={width}
                onChange={(cm) => {
                  setWidth(cm)
                  resize(cm, depth)
                }}
              />
              <LengthInput
                label="Depth"
                valueCm={depth}
                onChange={(cm) => {
                  setDepth(cm)
                  resize(width, cm)
                }}
              />
            </div>

            <div className="field">
              <label>How many do you own?</label>
              <div className="stepper">
                <button onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="Fewer">
                  −
                </button>
                <span>{count}</span>
                <button onClick={() => setCount((c) => c + 1)} aria-label="More">
                  +
                </button>
              </div>
              {count < maxPlaced && <div className="hint warn">{maxPlaced} are already placed on a floorplan.</div>}
            </div>

            <div className="field">
              <label>Colour</label>
              <div className="swatches">
                {FILLS.map((c) => (
                  <button key={c} className={`swatch ${fill === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setFill(c)} aria-label={`Fill ${c}`} />
                ))}
              </div>
            </div>
          </div>

          <div className="editor-draw">
            <DrawingPad width={drawSize.w} depth={drawSize.d} fill={fill} strokes={strokes} onChange={setStrokes} />
          </div>
        </div>

        <footer className="modal-foot">
          {existing && (
            <button
              className={`btn ${confirmDelete ? 'danger' : 'ghost-danger'}`}
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true)
                deleteItem(existing.id)
                select(null)
                close(null)
              }}
            >
              {confirmDelete ? (placedIn ? `Delete and remove from ${placedIn} plan${placedIn > 1 ? 's' : ''}` : 'Really delete?') : 'Delete'}
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={save}>
            {existing ? 'Save' : 'Add to library'}
          </button>
        </footer>
      </div>
    </div>
  )
}
