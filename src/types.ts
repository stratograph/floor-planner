export type Units = 'metric' | 'imperial'

/** A freehand stroke. Points are [x, y, pressure] in cm, relative to the item's top-left corner. */
export interface Stroke {
  points: [number, number, number][]
  color: string
  /** Nib diameter in cm. */
  size: number
  /** True when drawn with a stylus (real pressure data). */
  pen: boolean
}

/** A piece of furniture in the library. `count` is how many of them you own. */
export interface FurnitureItem {
  id: string
  name: string
  /** Size along the x axis, in cm. */
  width: number
  /** Size along the y axis, in cm. */
  depth: number
  count: number
  fill: string
  strokes: Stroke[]
  createdAt: number
}

/** One placed instance of a furniture item. x/y is the item's centre in world cm. */
export interface Placement {
  id: string
  itemId: string
  x: number
  y: number
  rotation: number
}

export interface CalibrationLine {
  /** Endpoints in image pixel coordinates. */
  x1: number
  y1: number
  x2: number
  y2: number
  lengthCm: number
}

export interface Plan {
  id: string
  name: string
  imageWidth: number
  imageHeight: number
  /** Real-world cm per image pixel. null until the plan has been calibrated. */
  cmPerPx: number | null
  calibration: CalibrationLine | null
  placements: Placement[]
  createdAt: number
}
