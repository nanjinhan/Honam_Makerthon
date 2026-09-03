/**
 * 헤더 — SPEC §5, §11-1. 레퍼런스 앱 구조: 아이콘 행이 위, 인사말이 아래.
 *
 * 우측 프로필 아이콘 탭이 곧 "주인이 귀가한 척"이다(§8-4).
 * 심사위원 앞에서 누르는 버튼이라 눌렸다는 게 눈에 보여야 한다.
 */
import { Bell, User } from 'lucide-react'

import { ConnectionForm } from '@/components/shell/ConnectionForm'
import { cn } from '@/lib/utils'
import { useRobotStore } from '@/store/robotStore'

const ROBOT_NAME = '새싹이'

function greeting(hour: number) {
  if (hour < 11) return '좋은 아침이에요'
  if (hour < 18) return '좋은 오후예요'
  return '좋은 저녁이에요'
}

export function Header({ onOpenLogs }: { onOpenLogs?: () => void }) {
  const conn = useRobotStore((s) => s.conn)
  const ownerNear = useRobotStore((s) => s.ownerNear)
  const logCount = useRobotStore((s) => s.logs.length)
  const triggerOwnerNear = useRobotStore((s) => s.triggerOwnerNear)
  const pushLog = useRobotStore((s) => s.pushLog)

  return (
    <header className="px-5 pt-1 pb-4">
      <div className="flex items-center justify-between">
        <div className={cn('text-[11px]', conn === 'live' ? 'text-primary' : 'text-muted-foreground')}>
          <ConnectionForm />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenLogs}
            aria-label="알림"
            className="relative grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <Bell className="h-[17px] w-[17px]" />
            {logCount > 0 && (
              <span className="num absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                {logCount > 99 ? '99+' : logCount}
              </span>
            )}
          </button>

          <button
            type="button"
            aria-label="주인 감지 (데모 트리거)"
            onClick={() => {
              triggerOwnerNear()
              pushLog('greet', '주인 귀가 감지 (BLE 근접)')
            }}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-full border transition-colors',
              ownerNear
                ? 'border-primary bg-primary/10 text-primary '
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <User className="h-[17px] w-[17px]" />
          </button>
        </div>
      </div>

      <p className="mt-3 text-[22px] font-semibold leading-tight">
        {greeting(new Date().getHours())}
      </p>
      <p className="text-sm text-muted-foreground">{ROBOT_NAME}</p>
    </header>
  )
}
