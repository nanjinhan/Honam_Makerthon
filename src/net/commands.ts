/**
 * 조작 명령 한 곳 — SPEC §9-2
 *
 * 어떤 버튼이든 여기를 지난다. 하는 일은 항상 둘이다.
 *   1. 목업에 반영해서 화면이 즉시 반응하게 한다 (ESP32가 없어도 데모가 된다)
 *   2. 연결돼 있으면 같은 명령을 WebSocket으로 내보낸다
 */
import { manualDrive, type Dir } from '@/sim/mockEngine'
import { robotStore, type Face, type LedMode } from '@/store/robotStore'
import { pushCloudMove } from './cloudControl'
import { setLcdText, twoLines } from './lcd'
import { send } from './ws'

const get = () => robotStore.getState()

/**
 * 같은 명령을 두 경로로 동시에 내보낸다.
 *   WebSocket   같은 와이파이일 때 0.1초. 배포(https) 환경에서는 브라우저가 막는다.
 *   Supabase    ESP32가 0.3초마다 가지러 온다. 인터넷만 있으면 어디서든 된다.
 * 둘 다 실패해도 목업(manualDrive)은 돌아서 화면은 멈추지 않는다.
 */
export function sendMove(dir: Dir, spd: number) {
  get().manualInput()
  send({ cmd: 'MOVE', dir, spd })
  pushCloudMove(dir, spd)
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

export type ActionId = 'greet' | 'drink' | 'sound' | 'spin'

const ACT_TEXT: Record<ActionId, string> = {
  greet: '인사 동작 실행',
  drink: '물 마시기 동작 실행',
  sound: '소리내기',
  spin: '제자리 회전',
}

/**
 * 동작 버튼을 누르면 LCD에도 이 문구가 뜬다.
 * 1602 LCD는 한글을 못 찍어서 영문으로 쓰고, 한 줄 16칸을 넘지 않게 잡았다.
 */
const ACT_LCD: Record<ActionId, string> = {
  greet: twoLines('HELLO OWNER!', 'SAESSAK IS HAPPY'),
  drink: twoLines('DRINKING WATER', 'GULP GULP...'),
  sound: twoLines('BEEP BEEP!', 'SAESSAK SINGS'),
  spin: twoLines('SPINNING~', 'WHEEE!'),
}

export function sendAct(v: ActionId) {
  const s = get()
  s.manualInput()
  send({ cmd: 'ACT', v })
  s.pushLog(v === 'greet' ? 'greet' : v === 'drink' ? 'water' : 'move', ACT_TEXT[v])

  if (v === 'greet') s.setFace('love')
  if (v === 'drink') s.setFace('excited')
  if (v === 'spin') s.setPos({ heading: s.pos.heading + 180 })

  // Supabase가 없으면 조용히 넘어간다 — 목업 데모는 그대로 돌아야 한다
  void setLcdText(ACT_LCD[v])
}

export function sendMode(v: 'auto' | 'manual') {
  const s = get()
  if (v === 'manual') s.manualInput()
  else s.setMode('auto')
  send({ cmd: 'MODE', v })
  s.pushLog('system', v === 'manual' ? '수동 조종 시작 — 자율 판단 정지' : '자율 모드로 전환')
}
