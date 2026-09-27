import type { Plan } from '../types'
import { useStore } from '../store'
import { useUi } from '../uiStore'
import { deleteImage, importImageFile, listImagePlanIds, saveImage } from './images'
import { newId } from './id'

export async function importFloorplan(file: File) {
  const { dataUrl, width, height } = await importImageFile(file)
  const id = newId()
  await saveImage(id, dataUrl)
  useStore.getState().addPlan({
    id,
    // Named by the user during setup (see CalibrationBar) — file names like IMG_2041 aren't memorable.
    name: '',
    imageWidth: width,
    imageHeight: height,
    cmPerPx: null,
    calibration: null,
    placements: [],
    createdAt: Date.now(),
  })
  startCalibration(null)
}

export const planLabel = (plan: Plan) => plan.name || 'Untitled floorplan'

export function startCalibration(plan: Plan | null) {
  const ui = useUi.getState()
  const c = plan?.calibration
  ui.setCalLine(c ? { x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 } : null)
  ui.setMode('calibrate')
}

export function removePlan(id: string) {
  // The image is kept so the deletion can be undone; orphaned images are cleaned up on the next launch.
  useStore.getState().deletePlan(id)
  useUi.getState().select(null)
}

/** Delete stored floorplan images whose plan no longer exists (e.g. deleted in an earlier session). */
export async function cleanUpOrphanImages() {
  const live = new Set(useStore.getState().plans.map((p) => p.id))
  for (const planId of await listImagePlanIds()) if (!live.has(planId)) await deleteImage(planId)
}

function afterHistory(verb: string, label: string | null) {
  const ui = useUi.getState()
  if (!label) return
  // Drop selected pieces that no longer exist after the undo/redo.
  const plan = useStore.getState().plans.find((p) => p.id === useStore.getState().activePlanId)
  const live = new Set(plan?.placements.map((p) => p.id))
  ui.setSelection(ui.selectedIds.filter((id) => live.has(id)))
  ui.showToast(`${verb}: ${label}`)
}

export const undo = () => afterHistory('Undone', useStore.getState().undo())
export const redo = () => afterHistory('Redone', useStore.getState().redo())
