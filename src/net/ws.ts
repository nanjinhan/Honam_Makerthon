/**
 * ESP32 연동 — SPEC §9
 *
 * 절대 원칙: **화면이 멈추면 안 된다.** 주소가 틀려도, 연결이 끊겨도, ESP32 전원이
 * 나가도 목업 엔진은 계속 돌고 앱은 그대로 동작한다. 연결되면 센서만 실측으로 바뀐다.
 * 위치(pos)는 실기기에서 오지 않으므로 언제나 시뮬레이션 값을 쓴다(§13).
 */
import { robotStore, type Behavior, type Face } from '@/store/robotStore'

export const DEFAULT_WS_URL = 'ws://192.168.4.1/ws'
const RETRY_MS = 3000

export type OutMsg =
  | { cmd: 'MOVE'; dir: string; spd: number }
  | { cmd: 'FACE'; v: Face }
  | { cmd: 'LED'; r: number; g: number; b: number; mode: string }
  | { cmd: 'ACT'; v: 'greet' | 'drink' | 'sound' | 'spin' }
  | { cmd: 'MODE'; v: 'auto' | 'manual' }
  | { cmd: 'PING' }

interface SensorMsg {
  type: 'sensor'
  moisture?: number
  nutrient?: number
  lux?: number
  temp?: number
  humidity?: number
  battery?: number
  waterTank?: number
}
interface EventMsg {
  type: 'event'
  kind: 'docked' | 'watering_done' | 'owner_near' | 'obstacle'
  msg?: string
}
interface StateMsg {
  type: 'state'
  behavior?: Behavior
  face?: Face
}
type InMsg = SensorMsg | EventMsg | StateMsg

let socket: WebSocket | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let url = DEFAULT_WS_URL
let wanted = false

const get = () => robotStore.getState()

export function getWsUrl() {
  return url
}

function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

function scheduleRetry() {
  if (!wanted || retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    open()
  }, RETRY_MS)
}

function handle(raw: string) {
  let msg: InMsg
  try {
    msg = JSON.parse(raw) as InMsg
  } catch {
    return // 쓰레기 프레임 하나로 앱이 죽으면 안 된다
  }
  const s = get()

  if (msg.type === 'sensor') {
    const { type: _t, ...patch } = msg
    s.applySensor(patch)
    return
  }
  if (msg.type === 'state') {
    if (msg.behavior) s.setBehavior(msg.behavior)
    if (msg.face) s.setFace(msg.face)
    return
  }
  if (msg.type === 'event') {
    if (msg.kind === 'owner_near') s.triggerOwnerNear()
    const text: Record<EventMsg['kind'], string> = {
      docked: '실기기 도킹 완료',
      watering_done: '실기기 급수 완료',
      owner_near: '실기기 주인 감지',
      obstacle: '장애물 감지 · 우회',
    }
    s.pushLog(msg.kind === 'obstacle' ? 'warn' : 'water', msg.msg || text[msg.kind])
  }
}

function open() {
  if (!wanted) return
  try {
    get().setConn('connecting')
    socket = new WebSocket(url)
  } catch {
    get().setConn('error')
    scheduleRetry()
    return
  }

  socket.onopen = () => {
    get().setConn('live')
    get().pushLog('system', `ESP32 연결됨 — ${url}`)
  }
  socket.onmessage = (e) => handle(String(e.data))
  socket.onerror = () => {
    // onclose가 이어서 오므로 여기서는 상태만 바꾼다
    if (get().conn !== 'error') get().setConn('error')
  }
  socket.onclose = () => {
    socket = null
    if (!wanted) return
    if (get().conn === 'live') get().pushLog('warn', '연결 끊김 — 목업 모드로 계속 진행')
    get().setConn('error')
    scheduleRetry()
  }
}

export function connect(next?: string) {
  if (next) url = next
  wanted = true
  clearRetry()
  socket?.close()
  socket = null
  open()
}

export function disconnect() {
  wanted = false
  clearRetry()
  socket?.close()
  socket = null
  get().setConn('mock')
  get().pushLog('system', '목업 모드로 전환')
}

export function send(msg: OutMsg) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(msg))
    } catch {
      // 전송 실패는 무시한다. 화면은 목업으로 계속 돈다.
    }
  }
}
