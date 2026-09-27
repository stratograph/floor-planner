import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Circle, Group, Image as KImage, Layer, Line, Path, Rect, Stage, Text, Transformer } from 'react-konva'
import type { FurnitureItem, Placement, Plan, Units } from '../types'
import { useStore } from '../store'
import { useUi, type CalLine, type View } from '../uiStore'
import { loadImageElement } from '../lib/images'
import { strokePath } from '../lib/strokes'
import { formatLength, niceLength } from '../lib/units'
import { snapAngle } from '../lib/snap'

// Let a second finger register while the first is dragging, so we can switch to pinch-zoom.
Konva.hitOnDragEnabled = true

const ROTATION_SNAPS = Array.from({ length: 72 }, (_, i) => i * 5)
const MIN_SCALE = 0.01
const MAX_SCALE = 60
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

/** Normalise an angle to [0, 360) and snap it to 5°. */
export const snapRotation = (deg: number) => (((Math.round(deg / 5) * 5) % 360) + 360) % 360

function usePlanImage(planId: string) {
  const [loaded, setLoaded] = useState<{ id: string; img: HTMLImageElement } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setError(null)
    loadImageElement(planId)
      .then((img) => live && setLoaded({ id: planId, img }))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [planId])
  return { image: loaded?.id === planId ? loaded.img : null, error }
}

function zoomAround(view: View, sx: number, sy: number, nextScale: number): View {
  const scale = clampScale(nextScale)
  const wx = (sx - view.x) / view.scale
  const wy = (sy - view.y) / view.scale
  return { scale, x: sx - wx * scale, y: sy - wy * scale }
}

interface Props {
  plan: Plan
}

export function PlanCanvas({ plan }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const nodes = useRef(new Map<string, Konva.Group>())
  const draggingNode = useRef<Konva.Group | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const view = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const mode = useUi((s) => s.mode)
  const selectedId = useUi((s) => s.selectedId)
  const select = useUi((s) => s.select)
  const setCanvasEl = useUi((s) => s.setCanvasEl)
  const calLine = useUi((s) => s.calLine)
  const measureLine = useUi((s) => s.measureLine)
  const units = useStore((s) => s.units)
  const setCalLine = useUi((s) => s.setCalLine)

  const library = useStore((s) => s.library)
  const opacity = useStore((s) => s.floorplanOpacity)
  const showLabels = useStore((s) => s.showLabels)
  const updatePlacement = useStore((s) => s.updatePlacement)
  const removePlacement = useStore((s) => s.removePlacement)
  const { image, error: imageError } = usePlanImage(plan.id)

  const itemsById = useMemo(() => new Map(library.map((i) => [i.id, i])), [library])
  // Until calibrated, one image pixel is drawn as one world unit.
  const cmPerPx = plan.cmPerPx ?? 1

  // ---- Size tracking -------------------------------------------------------
  useLayoutEffect(() => {
    const el = containerRef.current!
    setCanvasEl(el)
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      setCanvasEl(null)
    }
  }, [setCanvasEl])

  // ---- Fitting -------------------------------------------------------------
  const fit = useCallback(() => {
    if (!image || !size.w || !size.h) return
    const w = image.naturalWidth * cmPerPx
    const h = image.naturalHeight * cmPerPx
    const pad = 40
    const scale = clampScale(Math.min((size.w - pad * 2) / w, (size.h - pad * 2) / h))
    setView({ scale, x: (size.w - w * scale) / 2, y: (size.h - h * scale) / 2 })
  }, [image, size.w, size.h, cmPerPx, setView])

  const fittedFor = useRef<string | null>(null)
  useEffect(() => {
    if (image && size.w && fittedFor.current !== plan.id) {
      fittedFor.current = plan.id
      fit()
    }
  }, [image, size.w, plan.id, fit])

  // When the scale changes (re-calibration), rescale the view so the floorplan doesn't jump.
  const prevCmPerPx = useRef({ id: plan.id, cmPerPx })
  useEffect(() => {
    const prev = prevCmPerPx.current
    if (prev.id === plan.id && prev.cmPerPx !== cmPerPx) {
      const v = useUi.getState().view
      setView({ ...v, scale: clampScale((v.scale * prev.cmPerPx) / cmPerPx) })
    }
    prevCmPerPx.current = { id: plan.id, cmPerPx }
  }, [plan.id, cmPerPx, setView])

  // ---- Selection / transformer --------------------------------------------
  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const node = selectedId && mode === 'arrange' ? nodes.current.get(selectedId) : undefined
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, mode, plan.placements])

  // ---- Gestures: pan, pinch, wheel, calibration line ------------------------
  useEffect(() => {
    const el = containerRef.current!
    const pointers = new Map<number, { x: number; y: number }>()
    let pan: { sx: number; sy: number; view: View; moved: boolean } | null = null
    let pinch: { dist: number; cx: number; cy: number; view: View } | null = null
    let draw: { id: number; prev: ReturnType<typeof useUi.getState>['calLine'] } | null = null
    let measure: { id: number } | null = null

    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const toImagePx = (p: { x: number; y: number }) => {
      const v = useUi.getState().view
      const k = useStore.getState().plans.find((pl) => pl.id === plan.id)?.cmPerPx ?? 1
      return { x: (p.x - v.x) / v.scale / k, y: (p.y - v.y) / v.scale / k }
    }
    const toWorld = (p: { x: number; y: number }) => {
      const v = useUi.getState().view
      return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale }
    }
    const snapTo = (line: { x1: number; y1: number }, p: { x: number; y: number }, e: PointerEvent) => {
      const s = snapAngle(line.x1, line.y1, p.x, p.y, e)
      return { x2: s.x, y2: s.y }
    }
    const twoPointers = () => {
      const [a, b] = [...pointers.values()]
      return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
    }
    const startPan = (p: { x: number; y: number }) => {
      pan = { sx: p.x, sy: p.y, view: useUi.getState().view, moved: false }
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
      const p = local(e)
      pointers.set(e.pointerId, p)
      const ui = useUi.getState()

      if (pointers.size === 2) {
        // Second finger: whatever the first finger was doing becomes a pinch.
        draggingNode.current?.stopDrag()
        if (draw) {
          ui.setCalLine(draw.prev)
          draw = null
        }
        if (measure) {
          ui.setMeasureLine(null)
          measure = null
        }
        pan = null
        pinch = { ...twoPointers(), view: ui.view }
        return
      }
      if (pointers.size > 2) return

      const stage = stageRef.current
      const hit = stage?.getIntersection(p)
      if (ui.mode === 'calibrate') {
        if (hit?.hasName('cal-handle')) return // Konva drags the handle
        if (e.pointerType === 'mouse' && e.button === 1) {
          startPan(p)
        } else {
          const ip = toImagePx(p)
          draw = { id: e.pointerId, prev: ui.calLine }
          ui.setCalLine({ x1: ip.x, y1: ip.y, x2: ip.x, y2: ip.y })
        }
      } else if (ui.mode === 'measure') {
        if (e.pointerType === 'mouse' && e.button === 1) {
          startPan(p)
        } else {
          const w = toWorld(p)
          measure = { id: e.pointerId }
          ui.setMeasureLine({ x1: w.x, y1: w.y, x2: w.x, y2: w.y })
        }
      } else if (!hit) {
        startPan(p)
      } else {
        return
      }
      try {
        el.setPointerCapture?.(e.pointerId)
      } catch {
        // The pointer may already be gone (e.g. released before this handler ran); dragging still works via window listeners.
      }
    }

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      const p = local(e)
      pointers.set(e.pointerId, p)
      if (pinch && pointers.size >= 2) {
        const { dist, cx, cy } = twoPointers()
        const v = pinch.view
        const scale = clampScale((v.scale * dist) / pinch.dist)
        const wx = (pinch.cx - v.x) / v.scale
        const wy = (pinch.cy - v.y) / v.scale
        setView({ scale, x: cx - wx * scale, y: cy - wy * scale })
      } else if (pan) {
        const dx = p.x - pan.sx
        const dy = p.y - pan.sy
        if (Math.abs(dx) + Math.abs(dy) > 4) pan.moved = true
        setView({ ...pan.view, x: pan.view.x + dx, y: pan.view.y + dy })
      } else if (draw && draw.id === e.pointerId) {
        const cur = useUi.getState().calLine
        const ip = toImagePx(p)
        if (cur) useUi.getState().setCalLine({ ...cur, ...snapTo(cur, ip, e) })
      } else if (measure && measure.id === e.pointerId) {
        const cur = useUi.getState().measureLine
        if (!cur) return
        useUi.getState().setMeasureLine({ ...cur, ...snapTo(cur, toWorld(p), e) })
      }
    }

    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.delete(e.pointerId)
      if (pinch) {
        if (pointers.size < 2) {
          pinch = null
          // Carry on panning with the remaining finger, without a jump.
          const [rest] = [...pointers.values()]
          if (rest && useUi.getState().mode === 'arrange') startPan(rest)
          else if (rest) pan = { sx: rest.x, sy: rest.y, view: useUi.getState().view, moved: true }
        }
        return
      }
      if (pan) {
        if (!pan.moved && e.type === 'pointerup') useUi.getState().select(null)
        pan = null
      }
      if (draw && draw.id === e.pointerId) {
        const cur = useUi.getState().calLine
        const v = useUi.getState().view
        const k = useStore.getState().plans.find((pl) => pl.id === plan.id)?.cmPerPx ?? 1
        // Ignore taps: a line must be at least ~8 screen px long.
        if (cur && Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1) * k * v.scale < 8) useUi.getState().setCalLine(draw.prev)
        else useUi.getState().markCalLineDrawn()
        draw = null
      }
      if (measure && measure.id === e.pointerId) {
        const cur = useUi.getState().measureLine
        const v = useUi.getState().view
        // A tap (no real line) clears the measurement.
        if (cur && Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1) * v.scale < 8) useUi.getState().setMeasureLine(null)
        measure = null
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = useUi.getState().view
      const p = local(e)
      if (e.ctrlKey || e.metaKey) {
        setView(zoomAround(v, p.x, p.y, v.scale * Math.exp(-e.deltaY * 0.01)))
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
      }
    }

    // Safari (macOS trackpad, iPad trackpad) reports pinches as gesture events.
    // On touch screens pointer events already handle pinch, so only act when no pointers are down.
    let gesture: { view: View } | null = null
    const onGestureStart = (e: Event) => {
      e.preventDefault()
      gesture = { view: useUi.getState().view }
    }
    const onGestureChange = (e: Event) => {
      e.preventDefault()
      const ge = e as Event & { scale: number; clientX: number; clientY: number }
      if (!gesture || pointers.size) return
      const p = local(ge)
      setView(zoomAround(gesture.view, p.x, p.y, gesture.view.scale * ge.scale))
    }
    const onGestureEnd = (e: Event) => {
      e.preventDefault()
      gesture = null
    }

    const onContextMenu = (e: Event) => e.preventDefault()
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', onGestureStart)
    el.addEventListener('gesturechange', onGestureChange)
    el.addEventListener('gestureend', onGestureEnd)
    return () => {
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', onGestureStart)
      el.removeEventListener('gesturechange', onGestureChange)
      el.removeEventListener('gestureend', onGestureEnd)
    }
  }, [plan.id, setView])

  // ---- Keyboard shortcuts --------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return
      const { selectedId: id, mode: m, setMode } = useUi.getState()
      const calibrated = !!useStore.getState().plans.find((p) => p.id === plan.id)?.cmPerPx
      if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && calibrated && m !== 'calibrate') {
        setMode(m === 'measure' ? 'arrange' : 'measure')
        return
      }
      if (e.key === 'Escape' && m === 'measure') {
        setMode('arrange')
        return
      }
      if (m !== 'arrange' || !id) return
      const pl = useStore.getState().plans.find((p) => p.id === plan.id)?.placements.find((p) => p.id === id)
      if (!pl) return
      const step = e.shiftKey ? 10 : 1
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        removePlacement(id)
        select(null)
      } else if (e.key === 'Escape') select(null)
      else if (e.key === 'r' || e.key === 'R') updatePlacement(id, { rotation: snapRotation(pl.rotation + (e.shiftKey ? -90 : 90)) })
      else if (e.key === ']') updatePlacement(id, { rotation: snapRotation(pl.rotation + 5) })
      else if (e.key === '[') updatePlacement(id, { rotation: snapRotation(pl.rotation - 5) })
      else if (moves[e.key]) updatePlacement(id, { x: pl.x + moves[e.key][0], y: pl.y + moves[e.key][1] })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [plan.id, removePlacement, select, updatePlacement])

  const zoomBy = (factor: number) => setView(zoomAround(view, size.w / 2, size.h / 2, view.scale * factor))

  const arranging = mode === 'arrange'
  const handleR = 11 / view.scale

  return (
    <div className="canvas-wrap">
      <div ref={containerRef} className={`canvas ${mode}`}>
        {size.w > 0 && (
          <Stage ref={stageRef} width={size.w} height={size.h} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}>
            <Layer listening={false}>
              {image && (
                <KImage
                  image={image}
                  width={image.naturalWidth * cmPerPx}
                  height={image.naturalHeight * cmPerPx}
                  opacity={mode === 'calibrate' ? 1 : opacity}
                />
              )}
            </Layer>
            <Layer listening={arranging} opacity={mode === 'calibrate' ? 0.35 : 1}>
              {plan.placements.map((pl) => {
                const item = itemsById.get(pl.itemId)
                if (!item) return null
                return (
                  <FurnitureNode
                    key={pl.id}
                    placement={pl}
                    item={item}
                    showLabel={showLabels}
                    draggable={arranging}
                    nodeRef={(n) => (n ? nodes.current.set(pl.id, n) : nodes.current.delete(pl.id))}
                    onSelect={() => select(pl.id)}
                    onDragStart={(n) => (draggingNode.current = n)}
                    onDragEnd={(n) => {
                      draggingNode.current = null
                      updatePlacement(pl.id, { x: n.x(), y: n.y() })
                    }}
                  />
                )
              })}
              <Transformer
                ref={trRef}
                resizeEnabled={false}
                flipEnabled={false}
                rotationSnaps={ROTATION_SNAPS}
                rotationSnapTolerance={2.5}
                rotateAnchorOffset={26}
                anchorSize={22}
                borderStroke="#2f5d50"
                borderStrokeWidth={1.5}
                padding={4}
                anchorStyleFunc={(anchor) => {
                  if (anchor.hasName('rotater')) {
                    anchor.cornerRadius(11)
                    anchor.fill('#2f5d50')
                    anchor.stroke('#ffffff')
                    anchor.strokeWidth(2)
                    anchor.hitStrokeWidth(24)
                  }
                }}
                onTransformEnd={() => {
                  const node = trRef.current?.nodes()[0]
                  const id = useUi.getState().selectedId
                  if (!node || !id) return
                  const rotation = snapRotation(node.rotation())
                  node.rotation(rotation)
                  updatePlacement(id, { rotation, x: node.x(), y: node.y() })
                }}
              />
            </Layer>
            {mode === 'measure' && measureLine && <MeasureLine line={measureLine} scale={view.scale} units={units} />}
            {mode === 'calibrate' && calLine && (
              <Layer>
                <Line
                  points={[calLine.x1 * cmPerPx, calLine.y1 * cmPerPx, calLine.x2 * cmPerPx, calLine.y2 * cmPerPx]}
                  stroke="#e4572e"
                  strokeWidth={3}
                  strokeScaleEnabled={false}
                  lineCap="round"
                  listening={false}
                />
                {(['1', '2'] as const).map((end) => (
                  <Group
                    key={end}
                    name="cal-handle"
                    x={calLine[`x${end}`] * cmPerPx}
                    y={calLine[`y${end}`] * cmPerPx}
                    draggable
                    onDragMove={(e) => {
                      const cur = useUi.getState().calLine
                      if (!cur) return
                      // Snap relative to the other end of the line.
                      const other = end === '1' ? { x: cur.x2, y: cur.y2 } : { x: cur.x1, y: cur.y1 }
                      const s = snapAngle(other.x, other.y, e.target.x() / cmPerPx, e.target.y() / cmPerPx, e.evt)
                      e.target.position({ x: s.x * cmPerPx, y: s.y * cmPerPx })
                      setCalLine({ ...cur, [`x${end}`]: s.x, [`y${end}`]: s.y })
                    }}
                    onDragEnd={() => useUi.getState().markCalLineDrawn()}
                  >
                    <Circle name="cal-handle" radius={handleR * 1.6} fill="rgba(228,87,46,0.18)" stroke="#e4572e" strokeWidth={1.5} strokeScaleEnabled={false} />
                    <Circle name="cal-handle" radius={handleR * 0.22} fill="#e4572e" />
                  </Group>
                ))}
              </Layer>
            )}
          </Stage>
        )}
        {!image && (
          <div className="canvas-status">{imageError ? `Couldn't load floorplan image: ${imageError}` : 'Loading floorplan…'}</div>
        )}
      </div>
      <div className="zoom-controls">
        <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
        <button onClick={fit} aria-label="Fit floorplan" className="fit">Fit</button>
        <button onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
      </div>
      {plan.cmPerPx && mode !== 'calibrate' && <ScaleBar scale={view.scale} />}
    </div>
  )
}

const MEASURE_COLOR = '#2c5d8f'
const LABEL_W = 100

/** The measuring tool's line: end ticks plus a length label that stays the same size on screen. */
function MeasureLine({ line, scale, units }: { line: CalLine; scale: number; units: Units }) {
  const { x1, y1, x2, y2 } = line
  const length = Math.hypot(x2 - x1, y2 - y1)
  const px = 1 / scale // one screen pixel, in world cm
  // Unit normal, for the end ticks.
  const nx = length ? -(y2 - y1) / length : 0
  const ny = length ? (x2 - x1) / length : 1
  const tick = 8 * px
  // The normal that points up the screen (or right, for a horizontal-normal / vertical line).
  const flipN = ny > 0 || (ny === 0 && nx < 0) ? -1 : 1
  const labelNx = nx * flipN
  const labelNy = ny * flipN
  // Far enough along the normal that the label box clears the line at any angle (half-extent + 8px).
  const labelGap = (LABEL_W / 2) * Math.abs(labelNx) + 14 * Math.abs(labelNy) + 8
  return (
    <Layer listening={false}>
      <Line points={[x1, y1, x2, y2]} stroke="#fff" strokeWidth={5} strokeScaleEnabled={false} lineCap="round" opacity={0.8} />
      <Line points={[x1, y1, x2, y2]} stroke={MEASURE_COLOR} strokeWidth={2} strokeScaleEnabled={false} dash={[6 * px, 4 * px]} lineCap="round" />
      {[
        [x1, y1],
        [x2, y2],
      ].map(([x, y], i) => (
        <Line
          key={i}
          points={[x - nx * tick, y - ny * tick, x + nx * tick, y + ny * tick]}
          stroke={MEASURE_COLOR}
          strokeWidth={2}
          strokeScaleEnabled={false}
          lineCap="round"
        />
      ))}
      {length * scale >= 8 && (
        // Beside the middle of the line (on its upper side) so the finger at the end doesn't cover it.
        <Group x={(x1 + x2) / 2 + labelNx * labelGap * px} y={(y1 + y2) / 2 + labelNy * labelGap * px} scaleX={px} scaleY={px}>
          <Rect x={-LABEL_W / 2} y={-14} width={LABEL_W} height={28} fill={MEASURE_COLOR} cornerRadius={7} shadowColor="#000" shadowOpacity={0.2} shadowBlur={4} />
          <Text
            x={-LABEL_W / 2}
            y={-14}
            width={LABEL_W}
            height={28}
            align="center"
            verticalAlign="middle"
            text={formatLength(length, units)}
            fontSize={15}
            fontStyle="600"
            fontFamily="system-ui, -apple-system, sans-serif"
            fill="#fff"
          />
        </Group>
      )}
    </Layer>
  )
}

function ScaleBar({ scale }: { scale: number }) {
  const units = useStore((s) => s.units)
  const { cm, label } = niceLength(140 / scale, units)
  return (
    <div className="scale-bar" aria-label={`Scale: ${label}`}>
      <div className="scale-bar-line" style={{ width: cm * scale }} />
      <span>{label}</span>
    </div>
  )
}

interface NodeProps {
  placement: Placement
  item: FurnitureItem
  showLabel: boolean
  draggable: boolean
  nodeRef: (n: Konva.Group | null) => void
  onSelect: () => void
  onDragStart: (n: Konva.Group) => void
  onDragEnd: (n: Konva.Group) => void
}

function FurnitureNode({ placement, item, showLabel, draggable, nodeRef, onSelect, onDragStart, onDragEnd }: NodeProps) {
  const { width: w, depth: d } = item
  return (
    <Group
      ref={nodeRef}
      x={placement.x}
      y={placement.y}
      rotation={placement.rotation}
      offsetX={w / 2}
      offsetY={d / 2}
      draggable={draggable}
      onPointerDown={onSelect}
      onDragStart={(e) => onDragStart(e.target as unknown as Konva.Group)}
      onDragEnd={(e) => onDragEnd(e.target as unknown as Konva.Group)}
    >
      <Rect
        width={w}
        height={d}
        fill={item.fill}
        stroke="#2b2b2b"
        strokeWidth={1.5}
        strokeScaleEnabled={false}
        shadowColor="#000"
        shadowOpacity={0.18}
        shadowBlur={6}
        shadowOffsetY={2}
        shadowForStrokeEnabled={false}
      />
      <Group clipX={0} clipY={0} clipWidth={w} clipHeight={d} listening={false}>
        {item.strokes.map((s, i) => (
          <Path key={i} data={strokePath(s)} fill={s.color} stroke={s.color} strokeWidth={0.6} strokeScaleEnabled={false} />
        ))}
      </Group>
      {(showLabel || item.strokes.length === 0) && <NameLabel item={item} rotation={placement.rotation} />}
    </Group>
  )
}

/**
 * The piece's name, written along its long side with a light halo so it stays readable over a sketch.
 * Flipped when needed so it never reads upside down.
 */
function NameLabel({ item, rotation }: { item: FurnitureItem; rotation: number }) {
  const { width: w, depth: d } = item
  const along = w >= d ? 0 : -90
  const facing = (((rotation + along) % 360) + 360) % 360
  const flip = facing > 90 && facing <= 270 ? 180 : 0
  const long = Math.max(w, d)
  const short = Math.min(w, d)
  const fontSize = Math.min(24, Math.max(3, Math.min(short * 0.3, (long * 0.9) / (Math.max(item.name.length, 4) * 0.58))))
  return (
    <Text
      x={w / 2}
      y={d / 2}
      rotation={along + flip}
      text={item.name}
      width={long * 0.92}
      offsetX={long * 0.46}
      offsetY={fontSize / 2}
      align="center"
      wrap="none"
      ellipsis
      lineHeight={1}
      fontSize={fontSize}
      fontStyle="600"
      fontFamily="system-ui, -apple-system, sans-serif"
      fill="#222"
      stroke="rgba(255,255,255,0.85)"
      strokeWidth={fontSize * 0.28}
      lineJoin="round"
      fillAfterStrokeEnabled
      listening={false}
    />
  )
}
