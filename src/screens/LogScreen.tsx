/**
 * 기록 — SPEC §11-4
 *
 * §3-3은 통계 카드에 cult-ui Shift Card를 배정했지만, 그 컴포넌트는 확장이 hover로만
 * 열리고 터치에서는 onClick이 열자마자 onTap이 닫아버린다(폭도 280px 고정).
 * 심사위원이 폰으로 만질 화면이라 통계는 항상 펼쳐진 카드로 만든다. PLAN.md 참고.
 */
import { useState } from 'react'
import { Droplets, Footprints, Hand, Sun } from 'lucide-react'

import { LogList } from '@/components/LogList'
import { cn } from '@/lib/utils'
import { useRobotStore, type LogKind } from '@/store/robotStore'

const FILTERS: { v: LogKind | 'all'; label: string }[] = [
  { v: 'all', label: '전체' },
  { v: 'water', label: '급수' },
  { v: 'light', label: '조도' },
  { v: 'greet', label: '인사' },
  { v: 'move', label: '이동' },
  { v: 'warn', label: '경고' },
  { v: 'system', label: '시스템' },
]

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Sun
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <Icon className={cn('h-4 w-4', tone)} />
      <p className="num mt-2 text-[22px] font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{label}</p>
    </div>
  )
}

export function LogScreen() {
  const [filter, setFilter] = useState<LogKind | 'all'>('all')
  const logs = useRobotStore((s) => s.logs)
  const stats = useRobotStore((s) => s.stats)

  const rows = filter === 'all' ? logs : logs.filter((l) => l.kind === filter)

  return (
    <div className="space-y-5 px-5">
      <section>
        <h2 className="mb-2.5 text-[15px] font-semibold">오늘 누적</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat icon={Droplets} label="급수" value={`${stats.waterCount}회`} tone="text-primary" />
          <Stat
            icon={Footprints}
            label="이동 거리"
            value={`${stats.distance.toFixed(1)}m`}
            tone="text-muted-foreground"
          />
          <Stat
            icon={Sun}
            label="일조 시간"
            value={
              stats.sunMinutes < 1
                ? `${Math.round(stats.sunMinutes * 60)}초`
                : `${stats.sunMinutes.toFixed(0)}분`
            }
            tone="text-primary"
          />
          <Stat icon={Hand} label="인사" value={`${stats.greetCount}회`} tone="text-primary" />
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              type="button"
              onClick={() => setFilter(f.v)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[12px] transition-colors',
                filter === f.v
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <LogList logs={rows} />
      </section>
    </div>
  )
}
