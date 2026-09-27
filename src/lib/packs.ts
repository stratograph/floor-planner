import type { FurnitureItem, Stroke } from '../types'
import { saveFile, slugify } from './share'

const PACK_APP = 'floorplan-furniture-pack'
const BACKUP_APP = 'floorplan-furnisher'

interface PackFile {
  app: typeof PACK_APP
  version: 1
  name: string
  exportedAt: string
  items: FurnitureItem[]
}

export interface ParsedPack {
  name: string
  items: FurnitureItem[]
  /** Items in the file that were malformed and skipped. */
  skipped: number
}

export function exportPack(name: string, items: FurnitureItem[]) {
  const packName = name.trim() || 'Furniture'
  const pack: PackFile = { app: PACK_APP, version: 1, name: packName, exportedAt: new Date().toISOString(), items }
  const blob = new Blob([JSON.stringify(pack)], { type: 'application/json' })
  return saveFile(blob, `${slugify(packName) || 'furniture'}.furniture.json`, packName)
}

/** Read a furniture pack — or pull the library out of a full backup file. */
export async function parsePackFile(file: File): Promise<ParsedPack> {
  let data: unknown
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't a furniture pack")
  }
  const d = data as Record<string, unknown>
  let name: string
  let raw: unknown
  if (d?.app === PACK_APP) {
    name = typeof d.name === 'string' && d.name ? d.name : file.name
    raw = d.items
  } else if (d?.app === BACKUP_APP) {
    name = `Library from backup (${file.name})`
    raw = (d.state as Record<string, unknown> | undefined)?.library
  } else {
    throw new Error("That file isn't a furniture pack")
  }
  if (!Array.isArray(raw)) throw new Error('No furniture found in that file')
  const items = raw.map(sanitizeItem).filter((i): i is FurnitureItem => i !== null)
  if (!items.length) throw new Error('No usable furniture found in that file')
  return { name, items, skipped: raw.length - items.length }
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

function sanitizeStroke(raw: unknown): Stroke | null {
  const s = raw as Partial<Stroke>
  if (!s || !Array.isArray(s.points) || !isNum(s.size) || typeof s.color !== 'string') return null
  const points = s.points.filter((p) => Array.isArray(p) && p.length >= 2 && isNum(p[0]) && isNum(p[1]))
  if (!points.length) return null
  return {
    points: points.map((p) => [p[0], p[1], isNum(p[2]) ? p[2] : 0.5]),
    color: s.color,
    size: s.size,
    pen: !!s.pen,
  }
}

function sanitizeItem(raw: unknown): FurnitureItem | null {
  const i = raw as Partial<FurnitureItem>
  if (!i || typeof i.id !== 'string' || !i.id || typeof i.name !== 'string') return null
  if (!isNum(i.width) || !isNum(i.depth) || i.width <= 0 || i.depth <= 0) return null
  return {
    id: i.id,
    name: i.name.trim() || 'Unnamed piece',
    width: i.width,
    depth: i.depth,
    count: isNum(i.count) && i.count >= 1 ? Math.round(i.count) : 1,
    fill: typeof i.fill === 'string' ? i.fill : '#f3eee4',
    strokes: Array.isArray(i.strokes) ? i.strokes.map(sanitizeStroke).filter((s): s is Stroke => s !== null) : [],
    createdAt: isNum(i.createdAt) ? i.createdAt : Date.now(),
  }
}

/** Compare the parts of an item a user would notice changing. */
export function sameItem(a: FurnitureItem, b: FurnitureItem) {
  return (
    a.name === b.name &&
    a.width === b.width &&
    a.depth === b.depth &&
    a.count === b.count &&
    a.fill === b.fill &&
    JSON.stringify(a.strokes) === JSON.stringify(b.strokes)
  )
}
