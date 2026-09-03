/**
 * 방 카드 — SPEC §11-1
 *
 * v3에서 흐린 그라디언트 썸네일을 걷어내고 **연한 회색 플레이스홀더 + 방 이름**으로 바꿨다.
 * 로봇이 있는 방만 `primary` 보더 1.5px. **글로우 금지.**
 */
import { ROOMS, type RoomId, roomLux } from '@/data/floorplan'
import { cn } from '@/lib/utils'

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
      {/* 사진 자리 — 연한 회색 플레이스홀더 */}
      <div className="mb-3 h-14 w-full rounded-nest bg-secondary" />

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
