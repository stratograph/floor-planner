import { snapshot, useStore, type PersistedState } from '../store'
import { loadImageData, saveImage } from './images'
import { saveFile } from './share'

interface Backup {
  app: 'floorplan-furnisher'
  version: 1
  exportedAt: string
  state: PersistedState
  images: Record<string, string>
}

export async function exportBackup() {
  const state = snapshot()
  const images: Record<string, string> = {}
  for (const p of state.plans) {
    const data = await loadImageData(p.id)
    if (data) images[p.id] = data
  }
  const backup: Backup = { app: 'floorplan-furnisher', version: 1, exportedAt: new Date().toISOString(), state, images }
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  await saveFile(blob, `floorplan-backup-${new Date().toISOString().slice(0, 10)}.json`, 'Floorplan backup')
}

export async function importBackup(file: File) {
  const backup = JSON.parse(await file.text()) as Backup
  if (backup.app !== 'floorplan-furnisher' || !backup.state) throw new Error('Not a floorplan backup file')
  for (const [planId, data] of Object.entries(backup.images ?? {})) await saveImage(planId, data)
  useStore.getState().replaceAll(backup.state)
}
