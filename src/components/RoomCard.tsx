/**
 * 방 카드 — SPEC §11-1
 *
 * v3에서 흐린 그라디언트 썸네일을 걷어내고 **연한 회색 플레이스홀더 + 방 이름**으로 바꿨다.
 * 로봇이 있는 방만 `primary` 보더 1.5px. **글로우 금지.**
 *
 * v4: 그 회색 플레이스홀더는 "방 사진 자리"였는데 사진이 끝내 없었다. 카드마다
 * 56px씩 아무 정보도 없는 빈칸이 남아 있던 셈이라, **그 방의 밝기 막대**로 채웠다.
 * 로봇이 왜 저 방으로 가는지(= 어디가 밝은지)를 설명하는 자리가 됐다.
 */
import { ROOMS, type RoomId, roomLux } from '@/data/floorplan'
import { cn } from '@/lib/utils'

/** 막대를 꽉 채우는 조도. 홈 게이지의 조도 max와 같은 눈금을 쓴다. */
const LUX_FULL = 1200

function stayText(seconds: number) {
  if (seconds < 60) return `체류 ${Math.round(seconds)}초`
  return `체류 ${Math.round(seconds / 60)}분`
}

export function RoomCard({
  roomId,
  active,
  stay,
  onClick,
}: {
  roomId: RoomId
  active: boolean
  stay: number
  onClick?: () => void
}) {
  const room = ROOMS.find((r) => r.id === roomId)
  if (!room) return null
  const lux = roomLux(roomId)

  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? { borderWidth: 1.5 } : undefined}
      className={cn(
        'flex flex-col justify-between rounded-card border bg-card p-4 text-left shadow-card transition-colors',
        active ? 'border-primary' : 'border-border hover:border-muted-foreground/30',
      )}
    >
      {/* 밝기 막대 — 예전 "사진 자리" 회색 빈칸을 대체한다 */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] font-medium tracking-[0.01em] text-muted-foreground">
            밝기
          </span>
          {/* 가장 밝은 방을 눈으로 바로 찾을 수 있게 비율도 같이 적는다 */}
          <span className="num text-[11px] font-medium text-muted-foreground">
            {Math.round((Math.min(lux, LUX_FULL) / LUX_FULL) * 100)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(3, (Math.min(lux, LUX_FULL) / LUX_FULL) * 100)}%` }}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5">
          <p className="text-[15px] font-semibold tracking-[-0.01em]">{room.name}</p>
          {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        <p className="num mt-0.5 text-[12px] font-medium tracking-[0.01em] text-muted-foreground">
          {lux}lux · {stayText(stay)}
        </p>
      </div>
    </button>
  )
}
