/**
 * D-패드 — SPEC §10-3
 *
 * 누르고 있는 동안 150ms 간격으로 반복 전송, 떼면 STOP.
 * 손가락이 버튼 밖으로 미끄러져도 반드시 멈춰야 해서 pointerleave/cancel도 잡는다.
 * `touch-action: none`이 없으면 폰에서 드래그가 스크롤로 먹혀 조작이 안 된다.
 */
import { useCallback, useEffect, useRef } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCcw,
  RotateCw,
} from 'lucide-react'

import { TextureButton } from '@/components/ui/texture-button'
import { sendMove } from '@/net/commands'
import type { Dir } from '@/sim/mockEngine'

const REPEAT_MS = 150

const KEY_MAP: Record<string, Dir> = {
  ArrowUp: 'F',
  ArrowDown: 'B',
  ArrowLeft: 'L',
  ArrowRight: 'R',
  q: 'SL',
  e: 'SR',
}

function HoldButton({
  dir,
  label,
  start,
  stop,
  children,
}: {
  dir: Dir
  label: string
  start: (dir: Dir) => void
  stop: () => void
  children: React.ReactNode
}) {
  return (
    <TextureButton
      variant="secondary"
      size="icon"
      aria-label={label}
      // 기본 icon 사이즈는 24px짜리라 엄지로 못 누른다. 손가락 타깃 권장치(44px)를 넘겨 잡는다.
      className="h-[68px] w-[68px] active:scale-95"
      onPointerDown={(e) => {
        e.preventDefault()
        start(dir)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      style={{ touchAction: 'none' }}
    >
      {children}
    </TextureButton>
  )
}

export function DPad({ speed }: { speed: number }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const speedRef = useRef(speed)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const stop = useCallback(() => {
    if (!timer.current) return
    clearInterval(timer.current)
    timer.current = null
    sendMove('STOP', 0)
  }, [])

  const start = useCallback((dir: Dir) => {
    if (timer.current) clearInterval(timer.current)
    sendMove(dir, speedRef.current)
    timer.current = setInterval(() => sendMove(dir, speedRef.current), REPEAT_MS)
  }, [])

  useEffect(() => stop, [stop])

  // 키보드 방향키 — 노트북에서 시연할 때 훨씬 편하다
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const dir = KEY_MAP[e.key]
      if (!dir || e.repeat) return
      e.preventDefault()
      start(dir)
    }
    const up = (e: KeyboardEvent) => {
      if (KEY_MAP[e.key]) stop()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [start, stop])

  const common = { start, stop }

  return (
    <div className="grid w-fit grid-cols-3 gap-2.5">
      <HoldButton dir="SL" label="제자리 좌회전" {...common}>
        <RotateCcw className="h-6 w-6" />
      </HoldButton>
      <HoldButton dir="F" label="전진" {...common}>
        <ArrowUp className="h-6 w-6" />
      </HoldButton>
      <HoldButton dir="SR" label="제자리 우회전" {...common}>
        <RotateCw className="h-6 w-6" />
      </HoldButton>

      <HoldButton dir="L" label="좌회전" {...common}>
        <ArrowLeft className="h-6 w-6" />
      </HoldButton>
      <HoldButton dir="B" label="후진" {...common}>
        <ArrowDown className="h-6 w-6" />
      </HoldButton>
      <HoldButton dir="R" label="우회전" {...common}>
        <ArrowRight className="h-6 w-6" />
      </HoldButton>
    </div>
  )
}
