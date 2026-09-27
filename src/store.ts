import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'
import type { CalibrationLine, FurnitureItem, Placement, Plan, Units } from './types'
import { newId } from './lib/id'

const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: (name, value) => set(name, value),
  removeItem: (name) => del(name),
}

export interface PersistedState {
  library: FurnitureItem[]
  plans: Plan[]
  activePlanId: string | null
  units: Units
  floorplanOpacity: number
  /** Show furniture names on the canvas (pieces without a sketch always show theirs). */
  showLabels: boolean
  /** Furniture list sections folded away: 'priority-<n>' or 'placed'. */
  collapsedGroups: string[]
}

interface Actions {
  saveItem: (item: FurnitureItem) => void
  deleteItem: (id: string) => void
  /** Merge items from a furniture pack: same id replaces, new ids are added. */
  importItems: (items: FurnitureItem[]) => void
  addPlan: (plan: Plan) => void
  renamePlan: (id: string, name: string) => void
  deletePlan: (id: string) => void
  setActivePlan: (id: string) => void
  calibratePlan: (id: string, line: CalibrationLine, cmPerPx: number) => void
  addPlacement: (itemId: string, x: number, y: number, rotation?: number) => string
  updatePlacement: (id: string, patch: Partial<Omit<Placement, 'id' | 'itemId'>>) => void
  removePlacement: (id: string) => void
  setUnits: (units: Units) => void
  setFloorplanOpacity: (opacity: number) => void
  setShowLabels: (show: boolean) => void
  toggleGroupCollapsed: (key: string) => void
  replaceAll: (state: PersistedState) => void
}

const initial: PersistedState = {
  library: [],
  plans: [],
  activePlanId: null,
  units: 'metric',
  floorplanOpacity: 1,
  showLabels: true,
  collapsedGroups: [],
}

const mapActivePlan = (s: PersistedState, fn: (p: Plan) => Plan) => ({
  plans: s.plans.map((p) => (p.id === s.activePlanId ? fn(p) : p)),
})

export const useStore = create<PersistedState & Actions>()(
  persist(
    (setState) => ({
      ...initial,

      saveItem: (item) =>
        setState((s) => ({
          library: s.library.some((i) => i.id === item.id)
            ? s.library.map((i) => (i.id === item.id ? item : i))
            : [...s.library, item],
        })),

      deleteItem: (id) =>
        setState((s) => ({
          library: s.library.filter((i) => i.id !== id),
          plans: s.plans.map((p) => ({ ...p, placements: p.placements.filter((pl) => pl.itemId !== id) })),
        })),

      importItems: (items) =>
        setState((s) => {
          const incoming = new Map(items.map((i) => [i.id, i]))
          const library = s.library.map((i) => incoming.get(i.id) ?? i)
          const existing = new Set(s.library.map((i) => i.id))
          return { library: [...library, ...items.filter((i) => !existing.has(i.id))] }
        }),

      addPlan: (plan) => setState((s) => ({ plans: [...s.plans, plan], activePlanId: plan.id })),

      renamePlan: (id, name) => setState((s) => ({ plans: s.plans.map((p) => (p.id === id ? { ...p, name } : p)) })),

      deletePlan: (id) =>
        setState((s) => {
          const plans = s.plans.filter((p) => p.id !== id)
          return { plans, activePlanId: s.activePlanId === id ? (plans[0]?.id ?? null) : s.activePlanId }
        }),

      setActivePlan: (id) => setState({ activePlanId: id }),

      // Re-scaling keeps placed furniture anchored to the same spot on the floorplan
      // while the furniture itself keeps its real-world size.
      calibratePlan: (id, line, cmPerPx) =>
        setState((s) => ({
          plans: s.plans.map((p) => {
            if (p.id !== id) return p
            const k = p.cmPerPx ? cmPerPx / p.cmPerPx : 1
            return {
              ...p,
              cmPerPx,
              calibration: line,
              placements: p.placements.map((pl) => ({ ...pl, x: pl.x * k, y: pl.y * k })),
            }
          }),
        })),

      addPlacement: (itemId, x, y, rotation = 0) => {
        const id = newId()
        setState((s) => mapActivePlan(s, (p) => ({ ...p, placements: [...p.placements, { id, itemId, x, y, rotation }] })))
        return id
      },

      updatePlacement: (id, patch) =>
        setState((s) =>
          mapActivePlan(s, (p) => ({
            ...p,
            placements: p.placements.map((pl) => (pl.id === id ? { ...pl, ...patch } : pl)),
          })),
        ),

      removePlacement: (id) =>
        setState((s) => mapActivePlan(s, (p) => ({ ...p, placements: p.placements.filter((pl) => pl.id !== id) }))),

      setUnits: (units) => setState({ units }),
      setFloorplanOpacity: (floorplanOpacity) => setState({ floorplanOpacity }),
      setShowLabels: (showLabels) => setState({ showLabels }),
      toggleGroupCollapsed: (key) =>
        setState((s) => ({
          collapsedGroups: s.collapsedGroups.includes(key)
            ? s.collapsedGroups.filter((k) => k !== key)
            : [...s.collapsedGroups, key],
        })),
      replaceAll: (state) => setState({ ...initial, ...state }),
    }),
    {
      name: 'floorplan-state',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: ({ library, plans, activePlanId, units, floorplanOpacity, showLabels, collapsedGroups }) => ({
        library,
        plans,
        activePlanId,
        units,
        floorplanOpacity,
        showLabels,
        collapsedGroups,
      }),
    },
  ),
)

export const useActivePlan = () => useStore((s) => s.plans.find((p) => p.id === s.activePlanId) ?? null)

export function snapshot(): PersistedState {
  const { library, plans, activePlanId, units, floorplanOpacity, showLabels, collapsedGroups } = useStore.getState()
  return { library, plans, activePlanId, units, floorplanOpacity, showLabels, collapsedGroups }
}
