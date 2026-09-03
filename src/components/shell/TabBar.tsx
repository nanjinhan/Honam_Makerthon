/**
 * 하단 고정 탭바 — SPEC §5
 *
 * SPEC §3-3은 cult-ui Dock을 여기에 배정했지만, 그 컴포넌트는 마우스 호버 확대가
 * 핵심인 macOS 독이다(아이콘이 <img> src 필수, 선택 상태 개념 없음, absolute 배치).
 * 심사위원이 폰으로 만질 화면에서는 호버가 존재하지 않아서 직접 만든다. PLAN.md 참고.
 */
import { Gamepad2, House, Map, ScrollText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type TabId = 'home' | 'map' | 'control' | 'log'

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: '홈', icon: House },
  { id: 'map', label: '맵', icon: Map },
  { id: 'control', label: '조종', icon: Gamepad2 },
  { id: 'log', label: '기록', icon: ScrollText },
]

export function TabBar({ value, onChange }: { value: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-border bg-card/85 backdrop-blur-xl">
      <div className="flex items-stretch justify-around px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = id === value
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 rounded-btn py-1 transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {/* 레퍼런스처럼 활성 탭만 알약으로 채운다 */}
              <span
                className={cn(
                  'grid h-9 w-14 place-items-center rounded-full transition-colors',
                  active && 'bg-primary/10 text-primary',
                )}
              >
                <Icon className="h-[21px] w-[21px]" />
              </span>
              <span className={cn('text-[11px]', active ? 'font-semibold' : 'font-medium')}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
