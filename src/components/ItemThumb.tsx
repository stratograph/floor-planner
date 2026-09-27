import type { FurnitureItem } from '../types'
import { strokePath } from '../lib/strokes'

interface Props {
  item: Pick<FurnitureItem, 'width' | 'depth' | 'fill' | 'strokes' | 'name'>
  /** Fit inside this box (px), preserving aspect ratio. */
  box?: number
  /** Or render at an explicit pixel size. */
  size?: { w: number; h: number }
  showName?: boolean
}

export function ItemThumb({ item, box = 56, size, showName }: Props) {
  const { width: w, depth: d } = item
  const k = size ? 1 : box / Math.max(w, d)
  const pw = size?.w ?? w * k
  const ph = size?.h ?? d * k
  return (
    <svg className="thumb" width={pw} height={ph} viewBox={`0 0 ${w} ${d}`} aria-hidden>
      <defs>
        <clipPath id={`clip-${w}-${d}`}>
          <rect width={w} height={d} />
        </clipPath>
      </defs>
      <rect width={w} height={d} fill={item.fill} />
      <g clipPath={`url(#clip-${w}-${d})`}>
        {item.strokes.map((s, i) => (
          <path key={i} d={strokePath(s)} fill={s.color} />
        ))}
      </g>
      {showName && item.strokes.length === 0 && (
        <text x={w / 2} y={d / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(w, d) / 5} fill="#333">
          {item.name}
        </text>
      )}
      <rect width={w} height={d} fill="none" stroke="#2b2b2b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
