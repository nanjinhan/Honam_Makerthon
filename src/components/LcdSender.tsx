/**
 * LCD 문구 전송 — 웹 → Supabase(lcd_state) → ESP32가 3초마다 가져가 LCD에 띄운다.
 *
 * ESP32와 직접 연결하는 WebSocket(§9)과는 완전히 다른 경로다.
 *   WebSocket : 같은 와이파이 안에서 즉시. 인터넷 없어도 됨.
 *   이 경로   : 인터넷을 통해 Supabase를 경유. 멀리 있어도 됨. 대신 몇 초 늦다.
 *
 * "지금 LCD" 표시는 3초마다 다시 읽는다. 아래 동작 버튼(인사/물/소리/빙글)을 눌러도
 * 같은 자리에 문구가 쓰이기 때문에, 안 읽으면 화면과 실제 LCD가 어긋난다.
 */
import { useEffect, useState } from 'react'
import { Check, Loader2, MonitorSmartphone } from 'lucide-react'

import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { LCD_COLS, getLcdText, sanitizeLcd, setLcdText } from '@/net/lcd'
import { useRobotStore } from '@/store/robotStore'

type State = 'idle' | 'sending' | 'done' | 'error'

/** 저장된 문구는 윗줄이 16칸으로 채워져 있다. 화면에는 사람이 읽기 좋게 되돌린다. */
function forDisplay(raw: string) {
  const top = raw.slice(0, LCD_COLS).trimEnd()
  const bottom = raw.slice(LCD_COLS).trim()
  return bottom ? `${top} / ${bottom}` : top
}

export function LcdSender() {
  const [text, setText] = useState('')
  const [state, setState] = useState<State>('idle')
  const [current, setCurrent] = useState<string | null>(null)
  const pushLog = useRobotStore((s) => s.pushLog)

  // ESP32와 같은 주기로 현재 문구를 확인한다
  useEffect(() => {
    if (!supabase) return
    let alive = true
    const tick = async () => {
      const t = await getLcdText()
      if (alive && t !== null) setCurrent(t)
    }
    void tick()
    const timer = setInterval(tick, 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const send = async () => {
    const body = sanitizeLcd(text).trim()
    if (!body) return
    setState('sending')

    const ok = await setLcdText(body)
    if (!ok) {
      setState('error')
      setTimeout(() => setState('idle'), 2500)
      return
    }
    setCurrent(body)
    setState('done')
    pushLog('system', `LCD 문구 전송 — "${body}"`)
    setTimeout(() => setState('idle'), 1600)
  }

  if (!supabase) {
    return (
      <div className="rounded-card border border-border bg-card p-4 text-[12px] text-muted-foreground shadow-card">
        Supabase가 연결되지 않았습니다. <code className="num">.env.local</code>에
        VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 넣으면 이 카드가 활성화됩니다.
        (firmware/SETUP_GUIDE.md 참고)
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2">
        <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
        <p className="text-[15px] font-medium">LCD 문구</p>
      </div>

      {/* 지금 LCD에 실제로 떠 있는 것 */}
      <div className="rounded-nest border border-border bg-background px-3 py-2">
        <p className="text-[12px] text-muted-foreground">지금 LCD</p>
        <p className="num mt-0.5 truncate text-[15px]">
          {current === null ? '읽는 중…' : current === '' ? '(비어 있음)' : forDisplay(current)}
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(sanitizeLcd(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          maxLength={32}
          placeholder="HELLO SAESSAK"
          spellCheck={false}
          className="num min-w-0 flex-1 rounded-btn border border-border bg-background px-3 py-2.5 text-[15px] outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={send}
          disabled={state === 'sending' || !text.trim()}
          className={cn(
            'flex w-[76px] shrink-0 items-center justify-center rounded-btn px-3 py-2.5 text-[15px] font-medium transition-colors',
            state === 'error'
              ? 'bg-alert text-white'
              : 'bg-primary text-primary-foreground disabled:opacity-40',
          )}
        >
          {state === 'sending' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : state === 'done' ? (
            <Check className="h-4 w-4" />
          ) : state === 'error' ? (
            '실패'
          ) : (
            '전송'
          )}
        </button>
      </div>

      <p className="text-[12px] leading-snug text-muted-foreground">
        1602 LCD는 한글을 못 찍습니다. 영문·숫자만 입력됩니다. ESP32가 3초마다 가져갑니다.
      </p>
    </div>
  )
}
