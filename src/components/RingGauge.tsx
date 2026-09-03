/**
 * 링 게이지 — SPEC §10-1
 *
 * 색 규칙은 §4-3. **평상시엔 파랑 하나뿐이고, 주의/위험 구간일 때만 색이 바뀐다.**
 * 색이 나타나는 것 자체가 신호이므로, 지표마다 고유색을 주지 않는다.
 * (이전 버전에서 온도 바가 늘 주황이라 23℃에도 비상처럼 보였다. 반복 금지.)
 */
import { cn } from '@/lib/utils'
import type { GaugeLevel } from '@/lib/gauge'

const STROKE: Record<GaugeLevel, string> = {
  ok: '#2F6BEA',
  warn: '#E8A23C',
  alert: '#DC4C4C',
}

const TEXT: Record<GaugeLevel, string> = {
  ok: 'text-foreground',
  warn: 'text-warn',
  alert: 'text-alert',
}

const SIZE = 76
const STROKE_W = 8
const R = (SIZE - STROKE_W) / 2
const C = 2 * Math.PI * R

export interface RingGaugeProps {
  label: string
  value: number
  unit?: string
  /** 링 채움 비율 계산용 최댓값 */
  max?: number
  digits?: number
  /** §4-3 임계값. 지표마다 다르므로 호출부가 정한다. */
  level?: GaugeLevel
  /**
   * 가운데 숫자를 다른 글자로 덮어쓴다. 초음파처럼 "-1 = 앞이 비었음"인 센서를
   * 그냥 숫자로 찍으면 화면에 -1이 뜨기 때문에 필요하다.
   */
  display?: string
}

export function RingGauge({
  label,
  value,
  unit,
  max = 100,
  digits = 0,
  level = 'ok',
  display,
}: RingGaugeProps) {
  const ratio = Math.max(0, Math.min(1, value / max))

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="#E9EEF5"
            strokeWidth={STROKE_W}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={STROKE[level]}
            strokeWidth={STROKE_W}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - ratio)}
            style={{ transition: 'stroke-dashoffset 400ms ease-out, stroke 300ms ease-out' }}
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              'num font-semibold tracking-[-0.03em]',
              // 덮어쓴 글자는 "열림"처럼 한글이 올 수 있어서 한 단계 작게 잡는다
              display ? 'text-[15px]' : 'text-[22px]',
              TEXT[level],
            )}
          >
            {display ?? value.toFixed(digits)}
          </span>
        </div>
      </div>

      {/* 라벨과 단위를 한 줄에 둔다. 두 줄로 쪼개면 폰에서 게이지 4개가 깨진다. */}
      <p className="whitespace-nowrap text-[12px] font-medium tracking-[0.01em] text-muted-foreground">
        {label}
        {unit && <span className="ml-1">{unit}</span>}
      </p>
    </div>
  )
}
