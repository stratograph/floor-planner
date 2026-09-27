import { useMemo, useRef, useState } from 'react'
import type { FurnitureItem } from '../types'
import { useActivePlan, useStore } from '../store'
import { clientToWorld, useUi, viewCenterWorld } from '../uiStore'
import { formatDims } from '../lib/units'
import { parsePackFile } from '../lib/packs'
import { byPlacementOrder, priorityOf } from '../lib/priority'
import { ItemThumb } from './ItemThumb'

const DRAG_THRESHOLD = 8

export function LibraryPanel() {
  const library = useStore((s) => s.library)
  const units = useStore((s) => s.units)
  const addPlacement = useStore((s) => s.addPlacement)
  const plan = useActivePlan()
  const mode = useUi((s) => s.mode)
  const setEditing = useUi((s) => s.setEditing)
  const setDrag = useUi((s) => s.setDrag)
  const select = useUi((s) => s.select)
  const showToast = useUi((s) => s.showToast)
  const setPackDialog = useUi((s) => s.setPackDialog)
  const collapsed = useStore((s) => s.collapsedGroups)
  const toggleCollapsed = useStore((s) => s.toggleGroupCollapsed)
  const packFile = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const canPlace = !!plan?.cmPerPx && mode === 'arrange'

  const placedCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const pl of plan?.placements ?? []) m.set(pl.itemId, (m.get(pl.itemId) ?? 0) + 1)
    return m
  }, [plan?.placements])

  const rows = [...library].sort(byPlacementOrder).map((item) => {
    const placed = placedCounts.get(item.id) ?? 0
    return { item, placed, remaining: item.count - placed }
  })
  const toPlace = rows.filter((r) => r.remaining > 0)
  const done = rows.filter((r) => r.remaining <= 0)
  const totalLeft = toPlace.reduce((n, r) => n + r.remaining, 0)
  // Only split into priority groups when more than one priority is actually in use.
  const toPlaceGroups = [...new Set(toPlace.map((r) => priorityOf(r.item)))]
  const grouped = toPlaceGroups.length > 1

  const placeAt = (item: FurnitureItem, x: number, y: number) => {
    const id = addPlacement(item.id, x, y)
    select(id)
  }

  /** Tapping a card cycles the selection through that item's placed copies. */
  const cycleSelection = (item: FurnitureItem) => {
    const copies = plan?.placements.filter((p) => p.itemId === item.id) ?? []
    if (!copies.length) {
      if (canPlace) showToast('Drag onto the floorplan, or use + to drop one in the middle')
      return
    }
    const current = copies.findIndex((p) => p.id === useUi.getState().selectedId)
    select(copies[(current + 1) % copies.length].id)
  }

  const onCardPointerDown = (e: React.PointerEvent, item: FurnitureItem, remaining: number) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || (e.target as HTMLElement).closest('button')) return
    const pointerId = e.pointerId
    const sx = e.clientX
    const sy = e.clientY
    let dragging = false

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD) return
        if (!canPlace || remaining <= 0) return
        dragging = true
      }
      ev.preventDefault()
      setDrag({ itemId: item.id, clientX: ev.clientX, clientY: ev.clientY })
    }
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      if (dragging) {
        setDrag(null)
        const w = ev.type === 'pointerup' ? clientToWorld(ev.clientX, ev.clientY) : null
        if (w) placeAt(item, w.x, w.y)
      } else if (ev.type === 'pointerup' && Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD) {
        cycleSelection(item)
      }
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const renderCard = ({ item, placed, remaining }: (typeof rows)[number]) => {
    const over = remaining < 0
    return (
      <li
        key={item.id}
        className={`card ${remaining <= 0 ? 'all-placed' : ''} ${canPlace && remaining > 0 ? 'draggable' : ''}`}
        onPointerDown={(e) => onCardPointerDown(e, item, remaining)}
      >
        <div className="card-thumb">
          <ItemThumb item={item} box={52} />
        </div>
        <div className="card-body">
          <div className="card-name">{item.name}</div>
          <div className="card-dims">{formatDims(item.width, item.depth, units)}</div>
          <div className={`card-count ${over ? 'over' : ''}`}>
            <span className="pips" aria-hidden>
              {Array.from({ length: Math.min(Math.max(item.count, placed), 12) }, (_, i) => (
                <i key={i} className={i < placed ? (i >= item.count ? 'extra' : 'on') : ''} />
              ))}
            </span>
            {over ? `${placed} placed, only ${item.count} owned` : remaining > 0 ? `${remaining} of ${item.count} left` : `all ${item.count} placed`}
          </div>
        </div>
        <div className="card-actions">
          {canPlace && remaining > 0 && (
            <button
              className="icon-btn"
              aria-label={`Place ${item.name} in the middle of the view`}
              onClick={() => {
                const c = viewCenterWorld()
                if (c) placeAt(item, c.x, c.y)
              }}
            >
              +
            </button>
          )}
          <button className="icon-btn" aria-label={`Edit ${item.name}`} onClick={() => setEditing(item.id)}>
            ✎
          </button>
        </div>
      </li>
    )
  }

  return (
    <aside className="library">
      <header className="library-head">
        <div>
          <h2>Furniture</h2>
          {library.length > 0 && (
            <div className="sub">{plan ? `${totalLeft} piece${totalLeft === 1 ? '' : 's'} left to place` : `${library.length} items`}</div>
          )}
        </div>
        <div className="library-head-actions">
          <div className="menu-wrap">
            <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Furniture options" aria-expanded={menuOpen}>
              ⋯
            </button>
            {menuOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="menu menu-left" role="menu">
                  <button
                    disabled={!library.length}
                    onClick={() => {
                      setMenuOpen(false)
                      setPackDialog({ mode: 'export' })
                    }}
                  >
                    Share furniture pack…
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      packFile.current?.click()
                    }}
                  >
                    Import furniture pack…
                  </button>
                </div>
              </>
            )}
            <input
              ref={packFile}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  setPackDialog({ mode: 'import', pack: await parsePackFile(file) })
                } catch (err) {
                  showToast((err as Error).message)
                }
              }}
            />
          </div>
          <button className="btn primary small" onClick={() => setEditing('new')}>
            + New
          </button>
        </div>
      </header>

      {plan && !plan.cmPerPx && library.length > 0 && <p className="library-note">Set the floorplan's scale to start placing furniture.</p>}

      <div className="library-scroll">
        {library.length === 0 ? (
          <div className="library-empty">
            <p>Your furniture library is empty.</p>
            <p>Add each piece you own with its real dimensions — and sketch on it with your Pencil if you like.</p>
            <button className="btn" onClick={() => setEditing('new')}>
              Add your first piece
            </button>
          </div>
        ) : (
          <>
            {toPlace.length > 0 && (
              <section>
                <h3>{plan ? 'Left to place' : 'Library'}</h3>
                {grouped ? (
                  toPlaceGroups.map((p) => {
                    const groupRows = toPlace.filter((r) => priorityOf(r.item) === p)
                    const left = groupRows.reduce((n, r) => n + r.remaining, 0)
                    const key = `priority-${p}`
                    const open = !collapsed.includes(key)
                    return (
                      <div key={p} className="priority-group">
                        <GroupToggle id={key} open={open} onToggle={() => toggleCollapsed(key)} count={`${left} left`} className="priority">
                          Priority {p}
                        </GroupToggle>
                        {open && (
                          <ul className="cards" id={key}>
                            {groupRows.map(renderCard)}
                          </ul>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <ul className="cards">{toPlace.map(renderCard)}</ul>
                )}
              </section>
            )}
            {done.length > 0 && (
              <section>
                <GroupToggle
                  id="placed"
                  open={!collapsed.includes('placed')}
                  onToggle={() => toggleCollapsed('placed')}
                  count={`${done.length} piece${done.length === 1 ? '' : 's'}`}
                  className="section"
                >
                  All placed
                </GroupToggle>
                {!collapsed.includes('placed') && (
                  <ul className="cards" id="placed">
                    {done.map(renderCard)}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

interface GroupToggleProps {
  id: string
  open: boolean
  onToggle: () => void
  count: string
  /** 'section' for top-level headings, 'priority' for groups inside "Left to place". */
  className: string
  children: React.ReactNode
}

/** A collapsible list heading with a chevron and a count that stays visible when folded. */
function GroupToggle({ id, open, onToggle, count, className, children }: GroupToggleProps) {
  const Heading = className === 'section' ? 'h3' : 'h4'
  return (
    <Heading className={`group-toggle ${className} ${open ? 'open' : ''}`}>
      <button onClick={onToggle} aria-expanded={open} aria-controls={id}>
        <svg className="chevron" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {children}
        <span className="group-count">{count}</span>
      </button>
    </Heading>
  )
}

/** The item following your finger while dragging from the library — drawn at real size once over the canvas. */
export function DragGhost() {
  const drag = useUi((s) => s.drag)
  const scale = useUi((s) => s.view.scale)
  const item = useStore((s) => (drag ? s.library.find((i) => i.id === drag.itemId) : undefined))
  if (!drag || !item) return null
  const overCanvas = !!clientToWorld(drag.clientX, drag.clientY)
  const size = overCanvas ? { w: item.width * scale, h: item.depth * scale } : undefined
  return (
    <div className={`drag-ghost ${overCanvas ? 'over' : ''}`} style={{ left: drag.clientX, top: drag.clientY }}>
      <ItemThumb item={item} size={size} box={72} showName />
    </div>
  )
}
