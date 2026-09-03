/**
 * 맵 — SPEC §11-2
 *
 * 컨트롤러를 팝오버(Floating Panel)에서 **화면에 붙박이로** 바꿨다.
 * 팝오버는 열리는 순간 도면을 가리고 배경을 흐리게 만들어서, 정작 로봇이 어디로
 * 가는지 못 보면서 조종하게 된다. 이 화면의 목적은 "보면서 모는 것"이다.
 */
import { useState } from 'react'
import { Droplets, Hand, Route, Sun } from 'lucide-react'

import { DPad } from '@/components/DPad'
import { FloorPlanSVG } from '@/components/FloorPlanSVG'
import { Slider } from '@/components/ui/slider'
import { ROOMS, ROOM_WAYPOINT, type RoomId } from '@/data/floorplan'
import { BEHAVIOR_TEXT, reasonOf } from '@/lib/status'
import { cn } from '@/lib/utils'
import { sendAct } from '@/net/commands'
import { commandGoTo } from '@/sim/mockEngine'
import { useRobotStore } from '@/store/robotStore'

/** 심사위원이 "저 방으로 보내보세요" 할 때 쓰는 단축 버튼 */
const QUICK_ROOMS: RoomId[] = ['living', 'dining', 'kitchen', 'mbed', 'bed3']

function Toggle({
  on,
  onClick,
  icon: Icon,
  children,
}: {
  on: boolean
  onClick: () => void
  icon: typeof Sun
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
        on
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-card text-muted-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}

export function MapScreen() {
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [showPath, setShowPath] = useState(true)
  const [speed, setSpeed] = useState(180)

  const behavior = useRobotStore((s) => s.behavior)
  const lux = useRobotStore((s) => s.sensors.lux)
  const reason = useRobotStore((s) => reasonOf(s))

  return (
    <div className="space-y-3">
      {/* 스크롤해도 도면이 계속 보이게 위에 붙여둔다 */}
      <div className="sticky top-[58px] z-10 border-y border-border bg-card">
        <FloorPlanSVG showHeatmap={showHeatmap} showPath={showPath} />
      </div>

      <div className="flex items-center gap-2 px-5 pt-1">
        <Toggle on={showHeatmap} onClick={() => setShowHeatmap((v) => !v)} icon={Sun}>
          햇빛
        </Toggle>
        <Toggle on={showPath} onClick={() => setShowPath((v) => !v)} icon={Route}>
          경로
        </Toggle>
        <span className="num ml-auto text-[12px] text-muted-foreground">{Math.round(lux)}lux</span>
      </div>

      <div className="px-5">
        <p className="text-[15px] font-medium">{BEHAVIOR_TEXT[behavior]}</p>
        <p className="text-[12px] text-muted-foreground">{reason}</p>
      </div>

      {/* 컨트롤러 — 도면을 보면서 그대로 조작한다 */}
      <div className="px-5">
        <div className="space-y-4 rounded-card border border-border bg-card p-4 shadow-card">
          <div className="flex justify-center">
            <DPad speed={speed} />
          </div>

          <div>
            <div className="mb-2 flex justify-between text-[12px]">
              <span className="font-medium tracking-[0.01em] text-muted-foreground">
                모터 속도
              </span>
              <span className="num font-medium text-foreground">{speed} / 255</span>
            </div>
            <Slider
              value={[speed]}
              min={60}
              max={255}
              step={5}
              onValueChange={([v]) => setSpeed(v)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => sendAct('greet')}
              className="flex items-center justify-center gap-2 rounded-btn border border-border py-3 text-[15px] transition-colors hover:border-primary hover:text-primary"
            >
              <Hand className="h-4 w-4" />
              인사
            </button>
            <button
              type="button"
              onClick={() => sendAct('drink')}
              className="flex items-center justify-center gap-2 rounded-btn border border-border py-3 text-[15px] transition-colors hover:border-primary hover:text-primary"
            >
              <Droplets className="h-4 w-4" />물 마시기
            </button>
          </div>

          <p className="text-[12px] text-muted-foreground">
            누르는 동안 150ms 간격으로 전송, 떼면 정지. 키보드 방향키·Q/E로도 조종됩니다.
          </p>
        </div>
      </div>

      <div className="px-5 pb-2">
        <h2 className="mb-2 text-[12px] font-medium tracking-[0.01em] text-muted-foreground">
          방으로 보내기
        </h2>
        <div className="flex flex-wrap gap-2">
          {QUICK_ROOMS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() =>
                commandGoTo(ROOM_WAYPOINT[id], ROOMS.find((r) => r.id === id)?.name ?? id)
              }
              className="rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {ROOMS.find((r) => r.id === id)?.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
