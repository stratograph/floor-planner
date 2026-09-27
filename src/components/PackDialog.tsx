import { useMemo, useState } from 'react'
import type { FurnitureItem } from '../types'
import { useStore } from '../store'
import { useUi } from '../uiStore'
import { exportPack, sameItem, type ParsedPack } from '../lib/packs'
import { formatDims } from '../lib/units'
import { ItemThumb } from './ItemThumb'

interface Row {
  item: FurnitureItem
  note?: string
  /** Rows that wouldn't change anything are shown but can't be ticked. */
  disabled?: boolean
}

export function PackDialog() {
  const dialog = useUi((s) => s.packDialog)
  if (!dialog) return null
  return dialog.mode === 'export' ? <ExportPack /> : <ImportPack pack={dialog.pack} />
}

function ExportPack() {
  const library = useStore((s) => s.library)
  const close = useUi((s) => s.setPackDialog)
  const showToast = useUi((s) => s.showToast)
  const [name, setName] = useState('')
  const rows = useMemo(() => library.map((item) => ({ item })), [library])
  const [picked, setPicked] = useState(() => new Set(library.map((i) => i.id)))

  const run = async () => {
    const items = library.filter((i) => picked.has(i.id))
    const result = await exportPack(name, items)
    if (result === 'cancelled') return
    close(null)
    if (result === 'downloaded') showToast(`Saved a pack of ${items.length} piece${items.length === 1 ? '' : 's'}`)
  }

  return (
    <PackModal
      title="Share furniture"
      intro="Makes a file with each piece’s name, size, count and sketch. Whoever you send it to can import it into their own library."
      rows={rows}
      picked={picked}
      setPicked={setPicked}
      onClose={() => close(null)}
      action={`Export ${picked.size} piece${picked.size === 1 ? '' : 's'}`}
      onAction={run}
    >
      <div className="field">
        <label htmlFor="pack-name">Pack name</label>
        <input id="pack-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Our living room furniture" autoComplete="off" />
      </div>
    </PackModal>
  )
}

function ImportPack({ pack }: { pack: ParsedPack }) {
  const library = useStore((s) => s.library)
  const importItems = useStore((s) => s.importItems)
  const close = useUi((s) => s.setPackDialog)
  const showToast = useUi((s) => s.showToast)

  const rows: Row[] = useMemo(() => {
    const mine = new Map(library.map((i) => [i.id, i]))
    return pack.items.map((item) => {
      const existing = mine.get(item.id)
      if (!existing) return { item, note: 'New' }
      if (sameItem(existing, item)) return { item, note: 'Already in your library', disabled: true }
      return { item, note: `Replaces your “${existing.name}”` }
    })
  }, [pack, library])

  const [picked, setPicked] = useState(() => new Set(rows.filter((r) => !r.disabled).map((r) => r.item.id)))

  const run = () => {
    const chosen = rows.filter((r) => picked.has(r.item.id))
    importItems(chosen.map((r) => r.item))
    const replaced = chosen.filter((r) => r.note?.startsWith('Replaces')).length
    const added = chosen.length - replaced
    close(null)
    showToast([added && `${added} added`, replaced && `${replaced} updated`].filter(Boolean).join(', ') || 'Nothing imported')
  }

  const skippedNote = pack.skipped ? ` ${pack.skipped} damaged piece${pack.skipped === 1 ? ' was' : 's were'} skipped.` : ''
  return (
    <PackModal
      title={`Import “${pack.name}”`}
      intro={`Choose which pieces to add to your library. Pieces that came from your library before will be updated in place.${skippedNote}`}
      rows={rows}
      picked={picked}
      setPicked={setPicked}
      onClose={() => close(null)}
      action={`Import ${picked.size} piece${picked.size === 1 ? '' : 's'}`}
      onAction={run}
    />
  )
}

interface ModalProps {
  title: string
  intro: string
  rows: Row[]
  picked: Set<string>
  setPicked: (s: Set<string>) => void
  onClose: () => void
  action: string
  onAction: () => void
  children?: React.ReactNode
}

function PackModal({ title, intro, rows, picked, setPicked, onClose, action, onAction, children }: ModalProps) {
  const units = useStore((s) => s.units)
  const selectable = rows.filter((r) => !r.disabled)
  const allOn = selectable.every((r) => picked.has(r.item.id))
  const toggle = (id: string) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pack" role="dialog" aria-modal aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="pack-body">
          <p className="muted">{intro}</p>
          {children}
          <div className="pack-list-head">
            <span>{rows.length} pieces</span>
            {selectable.length > 1 && (
              <button className="btn link" onClick={() => setPicked(new Set(allOn ? [] : selectable.map((r) => r.item.id)))}>
                {allOn ? 'Select none' : 'Select all'}
              </button>
            )}
          </div>
          <ul className="pack-list">
            {rows.map(({ item, note, disabled }) => (
              <li key={item.id} className={disabled ? 'disabled' : ''}>
                <label>
                  <input type="checkbox" checked={picked.has(item.id)} disabled={disabled} onChange={() => toggle(item.id)} />
                  <span className="pack-thumb">
                    <ItemThumb item={item} box={40} />
                  </span>
                  <span className="pack-info">
                    <strong>{item.name}</strong>
                    <span>
                      {formatDims(item.width, item.depth, units)} · ×{item.count}
                      {note && <em className={note.startsWith('Replaces') ? 'warn' : ''}> · {note}</em>}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <footer className="modal-foot">
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!picked.size} onClick={onAction}>
            {action}
          </button>
        </footer>
      </div>
    </div>
  )
}
