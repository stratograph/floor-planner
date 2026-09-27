import type { Plan } from '../types'
import { useStore } from '../store'
import { useUi } from '../uiStore'
import { deleteImage, importImageFile, saveImage } from './images'
import { newId } from './id'

export async function importFloorplan(file: File) {
  const { dataUrl, width, height } = await importImageFile(file)
  const id = newId()
  await saveImage(id, dataUrl)
  useStore.getState().addPlan({
    id,
    name: file.name.replace(/\.[^.]+$/, '') || 'Floorplan',
    imageWidth: width,
    imageHeight: height,
    cmPerPx: null,
    calibration: null,
    placements: [],
    createdAt: Date.now(),
  })
  startCalibration(null)
}

export function startCalibration(plan: Plan | null) {
  const ui = useUi.getState()
  const c = plan?.calibration
  ui.setCalLine(c ? { x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 } : null)
  ui.setMode('calibrate')
}

export async function removePlan(id: string) {
  useStore.getState().deletePlan(id)
  useUi.getState().select(null)
  await deleteImage(id)
}
