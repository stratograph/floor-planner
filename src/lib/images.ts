import { del, get, keys, set } from 'idb-keyval'

// Floorplan images live in IndexedDB separately from the main state so that
// saving a furniture move doesn't re-serialize multi-megabyte images.
const PREFIX = 'plan-image:'
const key = (planId: string) => `${PREFIX}${planId}`

export async function listImagePlanIds(): Promise<string[]> {
  return (await keys()).filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length))
}

const elements = new Map<string, Promise<HTMLImageElement>>()

export const saveImage = (planId: string, dataUrl: string) => set(key(planId), dataUrl)
export const loadImageData = (planId: string) => get<string>(key(planId))
export const deleteImage = (planId: string) => {
  elements.delete(planId)
  return del(key(planId))
}

export function loadImageElement(planId: string): Promise<HTMLImageElement> {
  let p = elements.get(planId)
  if (!p) {
    p = loadImageData(planId).then((data) => {
      if (!data) throw new Error('Floorplan image missing')
      return decodeImage(data)
    })
    elements.set(planId, p)
    p.catch(() => elements.delete(planId))
  }
  return p
}

export function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read image'))
    img.src = src
  })
}

// iPad Safari caps canvas area at ~16 megapixels; keep well under.
const MAX_SIDE = 4096

/** Read an uploaded file into a (possibly downscaled) data URL plus its pixel size. */
export async function importImageFile(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  const img = await decodeImage(original)
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  if (scale === 1) return { dataUrl: original, width: img.naturalWidth, height: img.naturalHeight }

  const width = Math.round(img.naturalWidth * scale)
  const height = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  return { dataUrl: canvas.toDataURL(type, 0.92), width, height }
}
