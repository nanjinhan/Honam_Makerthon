/**
 * LCD 문구 전송 — 웹 → Supabase(lcd_state 테이블) → ESP32가 3초마다 가져가 LCD에 띄운다.
 *
 * ESP32와 직접 연결하는 WebSocket(§9)과는 완전히 다른 경로다.
 *   WebSocket : 같은 와이파이 안에서 즉시. 인터넷 없어도 됨.
 *   이 경로   : 인터넷을 통해 Supabase를 경유. 멀리 있어도 됨. 대신 몇 초 늦다.
 *
 * **1602 LCD는 한글을 못 찍는다**(HD44780 문자표에 한글이 없다).
 * 영문·숫자만 보내야 글자가 깨지지 않아서, 입력창에서 그것만 받는다.
 */
import { useEffect, useState } from 'react'
import { Check, Loader2, MonitorSmartphone } from 'lucide-react'

import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { useRobotStore } from '@/store/robotStore'

type State = 'idle' | 'sending' | 'done' | 'error'

/** LCD(1602)가 찍을 수 있는 문자만 남긴다 */
function sanitize(v: string) {
  return v.replace(/[^\x20-\x7E]/g, '')
}

export function LcdSender() {
  const [text, setText] = useState('')
  const [state, setState] = useState<State>('idle')
  const [current, setCurrent] = useState<string | null>(null)
  const pushLog = useRobotStore((s) => s.pushLog)

  // 지금 LCD에 떠 있는 문구를 보여준다
  useEffect(() => {
    if (!supabase) return
    supabase
      .from('lcd_state')
      .select('text')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => setCurrent(data?.text ?? ''))
  }, [])

  const send = async () => {
    const body = sanitize(text).trim()
    if (!body || !supabase) return
    setState('sending')

    const { error } = await supabase
      .from('lcd_state')
      .upsert({ id: 1, text: body, updated_at: new Date().toISOString() })

    if (error) {
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
        {current !== null && current !== '' && (
          <span className="num ml-auto truncate text-[12px] text-muted-foreground">
            현재: {current}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(sanitize(e.target.value))}
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
