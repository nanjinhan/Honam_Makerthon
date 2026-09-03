/**
 * 홈 — SPEC §11-1
 *
 * v2에서 바뀐 점 세 가지.
 *  - 상태 라벨에서 **색을 뺐다.** 검정 텍스트 26px/600. 색은 게이지가 이상할 때만 나타난다
 *  - 게이지 2×2 막대 → **가로 1×4 링**
 *  - 방 카드는 연한 회색 플레이스홀더 + 방 이름. 로봇이 있는 방만 primary 보더, 글로우 없음
 */
import { FaceDots } from '@/components/FaceDots'
import { LogList } from '@/components/LogList'
import { RingGauge } from '@/components/RingGauge'
import { levelOf } from '@/lib/gauge'
import { RoomCard } from '@/components/RoomCard'
import { ModeSwitch } from '@/components/shell/ModeSwitch'
import { ROOMS, ROOM_WAYPOINT, type RoomId, roomAt } from '@/data/floorplan'
import { reasonOf, statusLabel } from '@/lib/status'
import { commandGoTo } from '@/sim/mockEngine'
import { useRobotStore } from '@/store/robotStore'

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

        {/* 상태 라벨에 색을 쓰지 않는다. 색은 게이지가 이상할 때만 나타난다(§4-3). */}
        <p className="text-[26px] font-semibold tracking-[-0.02em]">{label}</p>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">{reason}</p>

        <div className="mt-5 grid grid-cols-4 gap-1 border-t border-border pt-5">
          <RingGauge
            label="수분"
            value={sensors.moisture}
            unit="%"
            level={levelOf('moisture', sensors.moisture)}
          />
          <RingGauge
            label="영양"
            value={sensors.nutrient}
            unit="%"
            level={levelOf('nutrient', sensors.nutrient)}
          />
          <RingGauge
            label="조도"
            value={sensors.lux}
            unit="lux"
            max={1200}
            level={levelOf('lux', sensors.lux)}
          />
          <RingGauge
            label="온도"
            value={sensors.temp}
            unit="℃"
            max={40}
            digits={1}
            level={levelOf('temp', sensors.temp)}
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
