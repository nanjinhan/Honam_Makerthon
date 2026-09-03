/**
 * 자율 / 수동 전환 — SPEC §11-1
 *
 * §11-1은 이 자리에 cult-ui **Morph Surface**를 배정했지만 쓰지 못했다.
 * 그 컴포넌트는 "피드백 폼 위젯"이라 renderTrigger/renderContent로 내용을 갈아끼워도
 * 자체 dock UI("Morph Surface" 라벨 + 아이콘 줄)가 함께 렌더되고, 고정 폭이 겹쳐
 * 폰 화면에서 가로로 넘친다. 상태 두 개를 고르는 토글에는 과한 물건이다.
 */
import { Bot, Gamepad2 } from 'lucide-react'

import { sendMode } from '@/net/commands'
import { cn } from '@/lib/utils'
import { useRobotStore } from '@/store/robotStore'

const OPTIONS = [
  { v: 'auto', label: '자율 모드', icon: Bot },
  { v: 'manual', label: '수동 조종', icon: Gamepad2 },
] as const

export function ModeSwitch() {
  const mode = useRobotStore((s) => s.mode)

  return (
    <div className="grid grid-cols-2 gap-2 rounded-card border border-border bg-card p-1.5 shadow-card">
      {OPTIONS.map(({ v, label, icon: Icon }) => {
        const on = mode === v
        return (
          <button
            key={v}
            type="button"
            onClick={() => sendMode(v)}
            aria-pressed={on}
            className={cn(
              'flex items-center justify-center gap-2 rounded-nest px-3 py-2.5 text-[15px] font-medium transition-colors',
              on
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
