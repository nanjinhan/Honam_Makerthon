/**
 * 조작 명령 한 곳 — SPEC §9-2
 *
 * 어떤 버튼이든 여기를 지난다. 하는 일은 항상 둘이다.
 *   1. 목업에 반영해서 화면이 즉시 반응하게 한다 (ESP32가 없어도 데모가 된다)
 *   2. 연결돼 있으면 같은 명령을 WebSocket으로 내보낸다
 */
import { manualDrive, type Dir } from '@/sim/mockEngine'
import { robotStore, type Face, type LedMode } from '@/store/robotStore'
import { send } from './ws'

const get = () => robotStore.getState()

export function sendMove(dir: Dir, spd: number) {
  get().manualInput()
  send({ cmd: 'MOVE', dir, spd })
  manualDrive(dir, spd)
}

export function sendFace(v: Face) {
  get().manualInput()
  get().setFace(v)
  send({ cmd: 'FACE', v })
}

export function sendLed(led: { r: number; g: number; b: number; mode: LedMode }) {
  get().manualInput()
  get().setLed(led)
  send({ cmd: 'LED', ...led })
}

const ACT_TEXT: Record<'greet' | 'drink' | 'sound' | 'spin', string> = {
  greet: '인사 동작 실행',
  drink: '물 마시기 동작 실행',
  sound: '소리내기',
  spin: '제자리 회전',
}

export function sendAct(v: 'greet' | 'drink' | 'sound' | 'spin') {
  const s = get()
  s.manualInput()
  send({ cmd: 'ACT', v })
  s.pushLog(v === 'greet' ? 'greet' : v === 'drink' ? 'water' : 'move', ACT_TEXT[v])

  if (v === 'greet') s.setFace('love')
  if (v === 'drink') s.setFace('excited')
  if (v === 'spin') s.setPos({ heading: s.pos.heading + 180 })
}

export function sendMode(v: 'auto' | 'manual') {
  const s = get()
  if (v === 'manual') s.manualInput()
  else s.setMode('auto')
  send({ cmd: 'MODE', v })
  s.pushLog('system', v === 'manual' ? '수동 조종 시작 — 자율 판단 정지' : '자율 모드로 전환')
}
