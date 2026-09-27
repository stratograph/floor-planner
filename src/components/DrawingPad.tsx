import { useLayoutEffect, useRef, useState } from 'react'
import type { Stroke } from '../types'
import { strokePath, strokesNear } from '../lib/strokes'

export const INK_COLORS = ['#222222', '#6b6b6b', '#8a5a3b', '#2f5d50', '#2c5d8f', '#b8453a', '#ffffff']
const SIZES = [
  { px: 2, label: 'Fine' },
  { px: 4, label: 'Medium' },
  { px: 9, label: 'Bold' },
]

interface Props {
  width: number
  depth: number
  fill: string
  strokes: Stroke[]
  onChange: (strokes: Stroke[]) => void
}

export function DrawingPad({ width, depth, fill, strokes, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [color, setColor] = useState(INK_COLORS[0])
  const [sizePx, setSizePx] = useState(SIZES[1].px)
  const [current, setCurrent] = useState<Stroke | null>(null)
  const [history, setHistory] = useState<Stroke[][]>([])
  const penSeen = useRef(false)
  const active = useRef<number | null>(null)
  const eraseStart = useRef<Stroke[] | null>(null)

  useLayoutEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fit the item's rectangle into the available space, leaving room for dimension labels.
  const pad = 28
  const k = box.w && box.h ? Math.min((box.w - pad * 2) / width, (box.h - pad * 2) / depth) : 0
  const pw = width * k
  const ph = depth * k

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * depth }
  }
  const pressure = (e: PointerEvent) => (e.pointerType === 'pen' ? Math.max(0.05, e.pressure) : 0.5)

  const commit = (next: Stroke[], prev: Stroke[] = strokes) => {
    setHistory((h) => [...h.slice(-49), prev])
    onChange(next)
  }

  const eraseAt = (x: number, y: number, list: Stroke[]) => {
    const hits = strokesNear(list, x, y, 6 / k)
    return hits.size ? list.filter((_, i) => !hits.has(i)) : list
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'pen') penSeen.current = true
    // Palm rejection: once a Pencil has been used, ignore fingers on the drawing surface.
    if (e.pointerType === 'touch' && penSeen.current) return
    if (active.current !== null) return
    active.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toLocal(e)
    if (tool === 'eraser') {
      eraseStart.current = strokes
      onChange(eraseAt(p.x, p.y, strokes))
    } else {
      setCurrent({ points: [[p.x, p.y, pressure(e.nativeEvent)]], color, size: sizePx / k, pen: e.pointerType === 'pen' })
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (active.current !== e.pointerId) return
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    const list = events.length ? events : [e.nativeEvent]
    if (tool === 'eraser') {
      let next = strokes
      for (const ev of list) {
        const p = toLocal(ev)
        next = eraseAt(p.x, p.y, next)
      }
      if (next !== strokes) onChange(next)
    } else {
      setCurrent((c) =>
        c
          ? {
              ...c,
              points: [...c.points, ...list.map((ev) => {
                const p = toLocal(ev)
                return [p.x, p.y, pressure(ev)] as [number, number, number]
              })],
            }
          : c,
      )
    }
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (active.current !== e.pointerId) return
    active.current = null
    if (tool === 'eraser') {
      if (eraseStart.current && eraseStart.current !== strokes) commit(strokes, eraseStart.current)
      eraseStart.current = null
    } else if (current) {
      commit([...strokes, current])
      setCurrent(null)
    }
  }

  const undo = () => {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    onChange(prev)
  }

  // Light 10 cm grid to help keep proportions.
  const gridStep = width / 10 > 60 || depth / 10 > 60 ? 50 : 10
  const grid: string[] = []
  for (let x = gridStep; x < width; x += gridStep) grid.push(`M${x} 0V${depth}`)
  for (let y = gridStep; y < depth; y += gridStep) grid.push(`M0 ${y}H${width}`)

  return (
    <div className="pad">
      <div className="pad-toolbar">
        <div className="seg">
          <button className={tool === 'pen' ? 'on' : ''} onClick={() => setTool('pen')}>
            Pen
          </button>
          <button className={tool === 'eraser' ? 'on' : ''} onClick={() => setTool('eraser')}>
            Eraser
          </button>
        </div>
        <div className="swatches">
          {INK_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${c === color && tool === 'pen' ? 'on' : ''}`}
              style={{ background: c }}
              aria-label={`Ink ${c}`}
              onClick={() => {
                setColor(c)
                setTool('pen')
              }}
            />
          ))}
        </div>
        <div className="seg">
          {SIZES.map((s) => (
            <button key={s.px} className={sizePx === s.px ? 'on' : ''} onClick={() => setSizePx(s.px)} aria-label={s.label}>
              <span className="nib" style={{ width: s.px + 2, height: s.px + 2 }} />
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn small" onClick={undo} disabled={!history.length}>
          Undo
        </button>
        <button className="btn small" onClick={() => strokes.length && commit([])} disabled={!strokes.length}>
          Clear
        </button>
      </div>
      <div className="pad-area" ref={wrapRef}>
        {k > 0 && (
          <div className="pad-sheet" style={{ width: pw, height: ph }}>
            <svg
              ref={svgRef}
              width={pw}
              height={ph}
              viewBox={`0 0 ${width} ${depth}`}
              className={`pad-svg ${tool}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <rect width={width} height={depth} fill={fill} />
              <path d={grid.join('')} stroke="rgba(0,0,0,0.08)" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
              {strokes.map((s, i) => (
                <path key={i} d={strokePath(s)} fill={s.color} />
              ))}
              {current && <path d={strokePath(current, false)} fill={current.color} />}
              <rect width={width} height={depth} fill="none" stroke="#2b2b2b" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
