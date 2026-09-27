import type { FurnitureItem } from '../types'

export const PRIORITIES = [1, 2, 3, 4, 5] as const
export const DEFAULT_PRIORITY = 3

export const priorityOf = (item: Pick<FurnitureItem, 'priority'>) => item.priority ?? DEFAULT_PRIORITY

/** Priority group first (1 before 5), then bigger footprint first, then name. */
export function byPlacementOrder(a: FurnitureItem, b: FurnitureItem) {
  return priorityOf(a) - priorityOf(b) || b.width * b.depth - a.width * a.depth || a.name.localeCompare(b.name)
}
