/**
 * 도면 — SPEC §10-2, §12
 *
 * 이미지를 배경으로 깔지 않고 SVG로 직접 그린다. 히트맵·경로·로봇 위치가 전부
 * 같은 좌표계(1000×760)에서 처리되고, 도면 저작권 문제도 없다.
 *
 * 실제 평면도처럼 보이게 **두꺼운 벽 + 문 개구부 + 가구 실루엣**으로 그린다.
 * 다만 바닥은 §10-2의 밝은 중성색을 지킨다. 레퍼런스처럼 우드톤으로 깔면
 * 주황(#FFB020) 햇빛 히트맵이 바닥색에 묻혀서 이 앱의 핵심이 안 보인다.
 *
 * 문 위치는 순수하게 보여주기 위한 값이라 §12(floorplan.ts)를 건드리지 않고 여기 둔다.
 */
import { FURNITURE, ROOMS, STATION, VIEW_H, VIEW_W, WINDOWS, roomAt,
  DOORS,
  DOOR_W as DOOR,
  WALL_W,
} from '@/data/floorplan'
import { cn } from '@/lib/utils'
import { useRobotStore } from '@/store/robotStore'

const SUN = '#FFB020'
const HUMID_COLOR = '#4CA8E0'
const PRIMARY = '#2F6BEA'
const WALL = '#2B3440'
const FLOOR = '#F7FAFD'
const FURN = '#E4EAF2'
const FURN_DETAIL = '#D3DCE8'
const PATH = '#B9C6D6'

// 벽 두께·문 위치는 floorplan.ts에서 가져온다. 그림과 충돌 판정이 같은 표를
// 봐야 "화면엔 문이 뚫려 있는데 로봇은 못 지나감" 같은 어긋남이 안 생긴다.

/** 습한 구역 — 조도와 구분되게 물색으로 따로 표시한다 */
const HUMID = [
  { x: 170, y: 385, r: 150 },
  { x: 590, y: 400, r: 120 },
]

/** 가구는 이름에 따라 실루엣을 조금 다르게 그린다. 데이터(§12)는 그대로 쓴다. */
function Furniture({ f }: { f: (typeof FURNITURE)[number] }) {
  const base = <rect x={f.x} y={f.y} width={f.w} height={f.h} rx="7" fill={FURN} />

  if (f.name === '침대') {
    return (
      <g>
        {base}
        {/* 베개 */}
        <rect x={f.x + 8} y={f.y + 8} width={f.w - 16} height={26} rx="5" fill={FURN_DETAIL} />
      </g>
    )
  }
  if (f.name === '소파') {
    return (
      <g>
        {base}
        {/* 등받이 */}
        <rect x={f.x} y={f.y} width={f.w} height={16} rx="6" fill={FURN_DETAIL} />
      </g>
    )
  }
  if (f.name === '식탁') {
    const cy = f.y + f.h / 2
    return (
      <g>
        {base}
        {[0.25, 0.5, 0.75].map((t) => (
          <g key={t}>
            <circle cx={f.x + f.w * t} cy={f.y - 13} r="9" fill={FURN_DETAIL} />
            <circle cx={f.x + f.w * t} cy={f.y + f.h + 13} r="9" fill={FURN_DETAIL} />
          </g>
        ))}
        <rect x={f.x + 14} y={cy - 10} width={f.w - 28} height={20} rx="6" fill={FURN_DETAIL} />
      </g>
    )
  }
  if (f.name === '욕조') {
    return (
      <g>
        <rect x={f.x} y={f.y} width={f.w} height={f.h} rx="16" fill={FURN} />
        <rect
          x={f.x + 7}
          y={f.y + 7}
          width={f.w - 14}
          height={f.h - 14}
          rx="12"
          fill={FURN_DETAIL}
        />
      </g>
    )
  }
  return base
}

export function FloorPlanSVG({
  showHeatmap = true,
  showPath = true,
  className,
}: {
  showHeatmap?: boolean
  showPath?: boolean
  className?: string
}) {
  const pos = useRobotStore((s) => s.pos)
  const path = useRobotStore((s) => s.path)
  const target = useRobotStore((s) => s.targetPos)
  const behavior = useRobotStore((s) => s.behavior)

  const here = roomAt(pos)
  const docked = behavior === 'docking' || behavior === 'watering'

  const legs = [pos, ...(target ? [target] : []), ...path]
  const polyline = legs.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="집 도면 위 로봇 위치"
    >
      <defs>
        {WINDOWS.map((_, i) => (
          <radialGradient key={i} id={`sun-${i}`}>
            <stop offset="0%" stopColor={SUN} stopOpacity="0.28" />
            <stop offset="55%" stopColor={SUN} stopOpacity="0.1" />
            <stop offset="100%" stopColor={SUN} stopOpacity="0" />
          </radialGradient>
        ))}
        <radialGradient id="humid">
          <stop offset="0%" stopColor={HUMID_COLOR} stopOpacity="0.18" />
          <stop offset="100%" stopColor={HUMID_COLOR} stopOpacity="0" />
        </radialGradient>
        <clipPath id="plan-clip">
          <rect x="40" y="40" width="920" height="680" rx="6" />
        </clipPath>
      </defs>

      <rect width={VIEW_W} height={VIEW_H} fill="#FFFFFF" />

      {/* 1. 바닥 */}
      {ROOMS.map((r) => (
        <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={FLOOR} />
      ))}

      {/* 로봇이 있는 방을 아주 옅게 강조. 보더는 벽이 가져가므로 면으로만. */}
      {here && (
        <rect x={here.x} y={here.y} width={here.w} height={here.h} fill={PRIMARY} opacity="0.05" />
      )}

      {/* 2. 가구 */}
      {FURNITURE.map((f, i) => (
        <Furniture key={i} f={f} />
      ))}

      {/* 3. 히트맵 — 흰 바탕에서는 multiply라야 겹칠수록 진해진다 */}
      {showHeatmap && (
        <g style={{ mixBlendMode: 'multiply' }} clipPath="url(#plan-clip)">
          {WINDOWS.map((w, i) => (
            <circle key={i} cx={w.x} cy={w.y} r={320} fill={`url(#sun-${i})`} />
          ))}
          {HUMID.map((h, i) => (
            <circle key={i} cx={h.x} cy={h.y} r={h.r} fill="url(#humid)" />
          ))}
        </g>
      )}

      {/* 4. 벽 — 방 사각형의 테두리를 두껍게 그리면 내벽·외벽이 한 번에 나온다 */}
      <g stroke={WALL} strokeWidth={WALL_W} fill="none" strokeLinejoin="miter">
        {ROOMS.map((r) => (
          <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} />
        ))}
      </g>

      {/* 5. 문 — 벽을 바닥색으로 덮어 개구부를 만든다 */}
      {DOORS.map((d, i) =>
        d.dir === 'v' ? (
          <rect
            key={i}
            x={d.x - WALL_W / 2 - 1}
            y={d.y}
            width={WALL_W + 2}
            height={DOOR}
            fill={FLOOR}
          />
        ) : (
          <rect
            key={i}
            x={d.x}
            y={d.y - WALL_W / 2 - 1}
            width={DOOR}
            height={WALL_W + 2}
            fill={FLOOR}
          />
        ),
      )}

      {/* 6. 창문 — 외벽 위에 밝게 */}
      {WINDOWS.map((w, i) =>
        w.y === 40 ? (
          <line
            key={i}
            x1={w.x - 48}
            y1={w.y}
            x2={w.x + 48}
            y2={w.y}
            stroke={SUN}
            strokeWidth={WALL_W + 2}
            strokeLinecap="butt"
          />
        ) : (
          <line
            key={i}
            x1={w.x}
            y1={w.y - 48}
            x2={w.x}
            y2={w.y + 48}
            stroke={SUN}
            strokeWidth={WALL_W + 2}
            strokeLinecap="butt"
          />
        ),
      )}

      {ROOMS.map((r) => (
        <text key={r.id} x={r.x + 18} y={r.y + 34} fontSize="21" fill="#6B7A8F">
          {r.name}
        </text>
      ))}

      {showPath && legs.length > 1 && (
        <polyline
          points={polyline}
          fill="none"
          stroke={PATH}
          strokeWidth="3"
          strokeDasharray="12 10"
          strokeLinecap="round"
        />
      )}

      {/* 급수 스테이션 — 도킹 중일 때만 링 펄스 */}
      <g>
        {docked && (
          <circle
            className="fp-ripple"
            cx={STATION.x}
            cy={STATION.y}
            fill="none"
            stroke={PRIMARY}
            strokeWidth="2"
          />
        )}
        <rect
          x={STATION.x - 26}
          y={STATION.y - 20}
          width="52"
          height="40"
          rx="9"
          fill="#FFFFFF"
          stroke={WALL}
          strokeWidth="3"
        />
        <path
          d={`M ${STATION.x} ${STATION.y - 9} c 7 8 10 12 10 17 a 10 10 0 0 1 -20 0 c 0 -5 3 -9 10 -17 z`}
          fill={HUMID_COLOR}
        />
      </g>

      {/* 로봇 */}
      <g transform={`translate(${pos.x} ${pos.y}) rotate(${pos.heading})`}>
        {/* 1000×760 도면을 폰 폭에 맞춰 줄이면 r=12는 화면에서 6px밖에 안 된다 */}
        <circle r="27" fill="#FFFFFF" />
        <circle r="22" fill={PRIMARY} stroke="#FFFFFF" strokeWidth="3" />
        {/* 어느 쪽을 보고 있는지 — 화살표도 같이 키운다 */}
        <path d="M 3 -9 L 23 0 L 3 9 Z" fill="#FFFFFF" />
      </g>
    </svg>
  )
}
