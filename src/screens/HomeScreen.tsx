/**
 * 홈 — SPEC §11-1
 *
 * v2에서 바뀐 점 세 가지.
 *  - 상태 라벨에서 **색을 뺐다.** 검정 텍스트 26px/600. 색은 게이지가 이상할 때만 나타난다
 *  - 게이지 2×2 막대 → **가로 1×4 링**
 *  - 방 카드는 연한 회색 플레이스홀더 + 방 이름. 로봇이 있는 방만 primary 보더, 글로우 없음
 *
 * v4에서 두 가지 더.
 *  - 게이지 4개를 **실제로 배선된 센서**로 갈아끼웠다(수분·조도L·조도R·앞거리).
 *    영양/온도는 전용 센서가 없어 고정값이 나가던 자리였다 — 심사에서 물어보면
 *    답할 수 없는 숫자를 화면에 크게 띄우고 있었던 셈이라 걷어냈다.
 *  - 상단 Dynamic Island가 늘 떠 있으면서 알리던 "지금 무슨 행동 중"을
 *    **이 카드 안으로 내렸다.** 섬은 이제 놀랄 일에만 내려온다.
 */
import { Droplets, Leaf, Sprout, Sun } from 'lucide-react'

import { FaceDots } from '@/components/FaceDots'
import { LogList } from '@/components/LogList'
import { RingGauge } from '@/components/RingGauge'
import { levelOf } from '@/lib/gauge'
import { RoomCard } from '@/components/RoomCard'
import { ModeSwitch } from '@/components/shell/ModeSwitch'
import { ROOMS, ROOM_WAYPOINT, type RoomId, roomAt } from '@/data/floorplan'
import { BEHAVIOR_TEXT, STATUS_TEXT, reasonOf, statusLabel } from '@/lib/status'
import { cn } from '@/lib/utils'
import { commandGoTo } from '@/sim/mockEngine'
import { useRobotStore, type Behavior } from '@/store/robotStore'

/** 앞거리 링을 꽉 채우는 기준(cm). 이보다 멀면 "충분히 비었다"로 본다. */
const DISTANCE_FULL_CM = 60

function BehaviorIcon({ behavior }: { behavior: Behavior }) {
  switch (behavior) {
    case 'watering':
    case 'docking':
    case 'go_water':
      return <Droplets className="h-4 w-4 shrink-0 text-primary" />
    case 'greet':
      return <Leaf className="h-4 w-4 shrink-0 text-primary" />
    case 'seek_light':
    case 'returning':
      return <Sun className="h-4 w-4 shrink-0 text-primary" />
    default:
      return <Sprout className="h-4 w-4 shrink-0 text-primary" />
  }
}

/** 홈에 띄울 방 4개. 로봇이 있는 방은 항상 끼워 넣는다. */
const BASE_ROOMS: RoomId[] = ['living', 'dining', 'kitchen', 'mbed']

function SectionHead({ title, onMore }: { title: string; onMore?: () => void }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
      <button
        type="button"
        onClick={onMore}
        className="text-[12px] font-medium tracking-[0.01em] text-muted-foreground"
      >
        전체 보기
      </button>
    </div>
  )
}

export function HomeScreen({
  onSeeRooms,
  onSeeLogs,
}: {
  onSeeRooms?: () => void
  onSeeLogs?: () => void
}) {
  const sensors = useRobotStore((s) => s.sensors)
  const logs = useRobotStore((s) => s.logs)
  const face = useRobotStore((s) => s.face)
  const pos = useRobotStore((s) => s.pos)
  const roomTime = useRobotStore((s) => s.roomTime)
  const behavior = useRobotStore((s) => s.behavior)
  const conn = useRobotStore((s) => s.conn)

  const label = useRobotStore(statusLabel)
  const reason = useRobotStore((s) => reasonOf(s))

  const hereId = roomAt(pos)?.id
  const rooms = BASE_ROOMS.includes(hereId as RoomId)
    ? BASE_ROOMS
    : [...BASE_ROOMS.slice(0, 3), (hereId ?? 'mbed') as RoomId]

  return (
    <div className="space-y-5 px-5">
      <section className="rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex justify-center pb-5">
          <FaceDots face={face} className="w-[168px]" />
        </div>

        {/*
          상태 라벨에 색을 쓰지 않는다. 색은 게이지가 이상할 때만 나타난다(§4-3).
          statusLabel()이 주는 건 'SOSO' 같은 내부 코드다. 한글 변환표가 있는데도
          코드를 그대로 찍고 있어서 화면에 "SOSO"가 떠 있었다.
        */}
        <p className="text-[26px] font-semibold tracking-[-0.02em]">{STATUS_TEXT[label]}</p>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">{reason}</p>

        {/*
          예전엔 이 문구가 화면 맨 위 검은 알약(Dynamic Island)에 늘 떠 있었다.
          늘 떠 있으니 오히려 아무도 안 보고 자리만 먹어서, 여기로 내렸다.
        */}
        <div className="mt-4 flex items-center gap-2 rounded-nest border border-border bg-background px-3 py-2.5">
          <BehaviorIcon behavior={behavior} />
          <span className="text-[12px] text-muted-foreground">지금</span>
          <span className="text-[15px] font-medium tracking-[-0.01em]">
            {BEHAVIOR_TEXT[behavior]}
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                conn === 'live' ? 'bg-primary' : 'bg-muted-foreground/40',
              )}
            />
            {conn === 'live' ? '실기기' : '목업'}
          </span>
        </div>

        {/*
          게이지 4개는 **실제로 배선된 센서만** 띄운다.
          토양수분(GPIO34) · BH1750 좌(0x23) · BH1750 우(0x5C) · 초음파(16/19).
          영양·온도·습도·배터리·물탱크는 전용 센서가 없어 펌웨어가 고정값을 보내던
          자리라 화면에서 뺐다. 나중에 진짜 센서를 달면 여기 되돌리면 된다.
        */}
        <div className="mt-5 grid grid-cols-4 gap-1 border-t border-border pt-5">
          <RingGauge
            label="수분"
            value={sensors.moisture}
            unit="%"
            level={levelOf('moisture', sensors.moisture)}
          />
          <RingGauge
            label="조도"
            unit="좌"
            value={sensors.luxL}
            max={1200}
            level={levelOf('lux', sensors.luxL)}
          />
          <RingGauge
            label="조도"
            unit="우"
            value={sensors.luxR}
            max={1200}
            level={levelOf('lux', sensors.luxR)}
          />
          <RingGauge
            label="앞거리"
            unit={sensors.distance < 0 ? undefined : 'cm'}
            // -1은 "앞이 비었음"이다. 그대로 찍으면 화면에 -1이 뜨므로 글자로 바꾼다.
            value={sensors.distance < 0 ? DISTANCE_FULL_CM : sensors.distance}
            max={DISTANCE_FULL_CM}
            display={sensors.distance < 0 ? '열림' : undefined}
            level={levelOf('distance', sensors.distance)}
          />
        </div>
      </section>

      <ModeSwitch />

      <section>
        <SectionHead title="방마다 지금" onMore={onSeeRooms} />
        <div className="grid grid-cols-2 gap-3.5">
          {rooms.map((id) => (
            <RoomCard
              key={id}
              roomId={id}
              active={hereId === id}
              stay={roomTime[id] ?? 0}
              onClick={() => {
                commandGoTo(ROOM_WAYPOINT[id], ROOMS.find((r) => r.id === id)?.name ?? id)
                onSeeRooms?.()
              }}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHead title="최근 알림" onMore={onSeeLogs} />
        <LogList logs={logs} limit={3} />
      </section>
    </div>
  )
}
