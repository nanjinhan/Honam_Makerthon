/**
 * 조종 — SPEC §11-3
 *
 * **주행(D-패드·속도)은 여기 없다.** 도면을 보면서 몰아야 하므로 맵 탭으로 옮겼다.
 * 이 화면은 표정 / LED / 동작만 담당한다.
 *
 * 자율·수동 충돌 처리는 그대로다. 아무 버튼이나 누르면 자율이 멈추고,
 * 마지막 입력에서 10초가 지나면 알아서 자율로 돌아온다. 남은 시간을 띄워
 * 심사위원이 눌러도 앱이 꼬이지 않는다는 걸 보이게 한다.
 */
import { useEffect, useState } from 'react'
import { Droplets, Hand, RotateCw, Volume2 } from 'lucide-react'

import { FaceDots } from '@/components/FaceDots'
import { LcdSender } from '@/components/LcdSender'
import { ColorPicker } from '@/components/ui/color-picker'
import NeumorphButton from '@/components/ui/neumorph-button'
import { hexFromRgb, rgbFromColorString } from '@/lib/color'
import { cn } from '@/lib/utils'
import { sendAct, sendFace, sendLed, sendMode } from '@/net/commands'
import { useRobotStore, type Face, type LedMode } from '@/store/robotStore'

const FACES: { v: Face; label: string }[] = [
  { v: 'neutral', label: '무표정' },
  { v: 'happy', label: '기쁨' },
  { v: 'thirsty', label: '목마름' },
  { v: 'sleepy', label: '졸림' },
  { v: 'love', label: '반가움' },
  { v: 'excited', label: '신남' },
]

const LED_MODES: { v: LedMode; label: string }[] = [
  { v: 'solid', label: '고정' },
  { v: 'breathe', label: '숨쉬기' },
  { v: 'rainbow', label: '무지개' },
  { v: 'off', label: '끄기' },
]

const ACTIONS = [
  { v: 'greet', label: '인사하기', icon: Hand },
  { v: 'drink', label: '물 마시기', icon: Droplets },
  { v: 'sound', label: '소리내기', icon: Volume2 },
  { v: 'spin', label: '빙글 돌기', icon: RotateCw },
] as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-[12px] font-medium tracking-[0.01em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function ControlScreen({ onGoMap }: { onGoMap?: () => void }) {
  const mode = useRobotStore((s) => s.mode)
  const face = useRobotStore((s) => s.face)
  const led = useRobotStore((s) => s.led)
  const manualHoldUntil = useRobotStore((s) => s.manualHoldUntil)

  // 카운트다운은 스토어 값이 그대로여도 시간이 흐르면 줄어야 한다
  const [left, setLeft] = useState(0)
  useEffect(() => {
    const update = () => setLeft(Math.max(0, Math.ceil((manualHoldUntil - Date.now()) / 1000)))
    update()
    const t = setInterval(update, 500)
    return () => clearInterval(t)
  }, [manualHoldUntil])
  const manual = mode === 'manual' && left > 0

  return (
    <div className="space-y-6 px-5">
      <div
        className={cn(
          'flex items-center justify-between rounded-card border px-4 py-3 shadow-card',
          manual ? 'border-primary/30 bg-primary/5' : 'border-border bg-card',
        )}
      >
        <div>
          <p className={cn('text-[15px] font-medium', manual ? 'text-primary' : 'text-foreground')}>
            {manual ? '수동 제어 중' : '자율 모드'}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {manual ? '입력이 없으면 자율로 돌아갑니다' : '아무 버튼이나 누르면 수동으로 전환됩니다'}
          </p>
        </div>
        {manual ? (
          <span className="num rounded-full bg-primary/10 px-3 py-1 text-[15px] font-medium text-primary">
            {left}초
          </span>
        ) : (
          <button
            type="button"
            onClick={() => sendMode('manual')}
            className="rounded-btn border border-border px-3 py-1.5 text-[12px]"
          >
            수동 전환
          </button>
        )}
      </div>

      {/* 주행은 도면을 보면서 해야 하므로 맵으로 보낸다 */}
      <button
        type="button"
        onClick={onGoMap}
        className="flex w-full items-center justify-between rounded-card border border-border bg-card px-4 py-3 text-left shadow-card transition-colors hover:border-primary"
      >
        <span>
          <span className="block text-[15px] font-medium">주행은 맵에서</span>
          <span className="block text-[12px] text-muted-foreground">
            도면을 보면서 몰아야 어디로 가는지 보입니다
          </span>
        </span>
        <span className="shrink-0 text-[12px] font-medium text-primary">맵으로 →</span>
      </button>

      <Section title="표정">
        <div className="flex items-center gap-4 rounded-card border border-border bg-card p-4 shadow-card">
          <FaceDots face={face} className="w-[96px] shrink-0" />
          <div className="grid flex-1 grid-cols-3 gap-2">
            {FACES.map((f) => (
              <button
                key={f.v}
                type="button"
                onClick={() => sendFace(f.v)}
                className={cn(
                  'rounded-btn border px-2 py-2 text-[12px] transition-colors',
                  face === f.v
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="조명">
        <div className="space-y-3 rounded-card border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-3">
            <span
              className="h-9 w-9 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: hexFromRgb(led) }}
            />
            {/* ColorPicker는 마운트 직후 현재 색으로 onChange를 한 번 쏜다.
                그대로 두면 조종 탭을 열기만 해도 수동 모드로 넘어간다. */}
            <ColorPicker
              color={hexFromRgb(led)}
              onChange={(c) => {
                const rgb = rgbFromColorString(c)
                if (!rgb) return
                // hex → hsl 문자열 → rgb 왕복에서 채널당 1 정도가 어긋난다. 그건 변경이 아니다.
                const same =
                  Math.abs(rgb.r - led.r) <= 2 &&
                  Math.abs(rgb.g - led.g) <= 2 &&
                  Math.abs(rgb.b - led.b) <= 2
                if (same) return
                sendLed({ ...rgb, mode: led.mode })
              }}
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {LED_MODES.map((m) => (
              <button
                key={m.v}
                type="button"
                onClick={() => sendLed({ r: led.r, g: led.g, b: led.b, mode: m.v })}
                className={cn(
                  'rounded-btn border px-2 py-2 text-[12px] transition-colors',
                  led.mode === m.v
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="LCD">
        <LcdSender />
      </Section>

      <Section title="동작 (누르면 LCD에도 표시됩니다)">
        <div className="grid grid-cols-2 gap-3">
          {ACTIONS.map(({ v, label, icon: Icon }) => (
            <NeumorphButton
              key={v}
              intent="secondary"
              onClick={() => sendAct(v)}
              className="justify-center"
            >
              <span className="flex items-center gap-2 text-[13px]">
                <Icon className="h-4 w-4" />
                {label}
              </span>
            </NeumorphButton>
          ))}
        </div>
      </Section>
    </div>
  )
}
