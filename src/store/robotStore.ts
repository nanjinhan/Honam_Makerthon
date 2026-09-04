/**
 * 로봇 상태 — SPEC §6
 *
 * localStorage/sessionStorage는 쓰지 않는다. 전부 메모리.
 * 스토어는 vanilla로 만들어서 시뮬레이션 엔진이 React 밖에서도 돌릴 수 있게 한다.
 */
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { Point } from '@/data/floorplan'
import { pointOf } from '@/data/floorplan'

export type Mode = 'auto' | 'manual'
export type Behavior =
  | 'idle'
  | 'patrol'
  | 'seek_light'
  | 'go_water'
  | 'docking'
  | 'watering'
  | 'greet'
  | 'returning'
export type Face = 'neutral' | 'happy' | 'thirsty' | 'sleepy' | 'love' | 'excited'
export type LedMode = 'solid' | 'breathe' | 'rainbow' | 'off'
export type Conn = 'mock' | 'connecting' | 'live' | 'error'
export type LogKind = 'water' | 'light' | 'greet' | 'move' | 'warn' | 'system'

export interface Sensors {
  moisture: number // 0-100 %
  nutrient: number // 0-100 %
  lux: number // 0-2000
  temp: number // ℃
  humidity: number // 0-100 %
  battery: number // 0-100 %
  waterTank: number // 0-100 % (스테이션 잔량)

  /*
   * ── 실기기에 실제로 배선된 센서 ────────────────────────────────
   * 위 필드들과 달리 이건 ESP32에서 실측이 올라온다. 목업으로 돌 때는
   * mockEngine이 그럴듯한 값을 만들어 넣는다.
   */
  luxL: number // BH1750 왼쪽 (0x23)
  luxR: number // BH1750 오른쪽 (0x5C)
  /** 초음파 앞 거리(cm). **-1이면 "앞이 비었음"**이지 0cm가 아니다. */
  distance: number
  irNear: boolean // IR 근접 감지
  /** 토양 ADC 원본값. 젖을수록 내려간다(3300 바싹마름 ~ 1800 흠뻑) */
  soilRaw: number
  /** 펌웨어가 판정한 5단계 상태 — VERY WET / WET / NORMAL / DRY / VERY DRY */
  soil: string
}

export interface LogEntry {
  t: number
  kind: LogKind
  msg: string
}

/**
 * 상단 Dynamic Island를 띄울 만한 "긴급" 상황 — SPEC §5 재해석.
 *
 * 예전엔 섬이 항상 떠 있으면서 평상시 행동("대기 중")까지 알렸다. 늘 떠 있으니
 * 아무도 안 보게 되고 화면만 먹었다. 이제 평상시 행동은 홈 카드 안으로 내리고,
 * 섬은 **놀랄 일이 실제로 생겼을 때만** 내려온다.
 */
export type AlertKind = 'obstacle' | 'thirsty'

export interface UrgentAlert {
  kind: AlertKind
  msg: string
  /** 이 시각이 지나면 스스로 사라진다 */
  until: number
}

/** 부딪힘 같은 순간 이벤트를 이만큼 띄우고 내린다 */
export const ALERT_MS = 6_000

export interface Stats {
  waterCount: number
  distance: number // m
  sunMinutes: number
  greetCount: number
}

export interface RobotState {
  mode: Mode
  behavior: Behavior
  face: Face
  led: { r: number; g: number; b: number; mode: LedMode }
  pos: { x: number; y: number; heading: number }
  targetPos: Point | null
  path: Point[]
  sensors: Sensors
  conn: Conn
  ownerNear: boolean
  /** SPEC §8-4의 3초 유지를 setTimeout 없이 처리하기 위한 만료 시각 */
  ownerNearUntil: number
  logs: LogEntry[]
  /** 지금 섬을 내려야 할 긴급 상황. 없으면 섬 자체가 화면에서 사라진다. */
  alert: UrgentAlert | null
  stats: Stats
  /** 방별 누적 체류시간(초). 홈의 방 카드에 "체류 4분"으로 나간다. */
  roomTime: Record<string, number>
  manualHoldUntil: number
}

export interface RobotActions {
  setMode: (mode: Mode) => void
  setBehavior: (behavior: Behavior) => void
  setFace: (face: Face) => void
  setLed: (led: Partial<RobotState['led']>) => void
  setPos: (pos: Partial<RobotState['pos']>) => void
  setTarget: (target: Point | null) => void
  setPath: (path: Point[]) => void
  applySensor: (patch: Partial<Sensors>) => void
  setConn: (conn: Conn) => void
  setOwnerNear: (near: boolean) => void
  /** 헤더 프로필 아이콘 탭 = 주인이 귀가한 척. 실기기에서는 BLE RSSI가 대신한다. */
  triggerOwnerNear: () => void
  pushLog: (kind: LogKind, msg: string) => void
  /** 섬을 내린다. ms를 안 주면 ALERT_MS 동안 떴다가 스스로 사라진다. */
  raiseAlert: (kind: AlertKind, msg: string, ms?: number) => void
  /** 만료된 알림을 치운다. 엔진이 매 틱 부른다. */
  sweepAlert: () => void
  bumpStats: (patch: Partial<Stats>) => void
  addRoomTime: (roomId: string, seconds: number) => void
  /** 수동 입력이 들어오면 자율을 멈추고 10초 홀드를 건다 */
  manualInput: () => void
  reset: () => void
}

export type RobotStore = RobotState & RobotActions

/** 마지막 수동 입력 후 이 시간이 지나면 자율로 복귀한다 — SPEC §11-3 */
export const MANUAL_HOLD_MS = 10_000
/** 주인 감지 유지 시간 — SPEC §8-4 */
export const OWNER_NEAR_MS = 3_000
/** 로그 상한. 데모 내내 돌아도 메모리가 새지 않게 */
export const LOG_LIMIT = 200

const START = pointOf('hall_n')

function initialState(): RobotState {
  return {
    mode: 'auto',
    behavior: 'idle',
    face: 'neutral',
    led: { r: 47, g: 107, b: 234, mode: 'breathe' },
    pos: { x: START.x, y: START.y, heading: -90 },
    targetPos: null,
    path: [],
    sensors: {
      moisture: 51,
      nutrient: 72,
      lux: 657,
      temp: 24.2,
      humidity: 48,
      battery: 88,
      waterTank: 64,
      luxL: 640,
      luxR: 674,
      distance: -1,
      irNear: false,
      soilRaw: 2400,
      soil: 'NORMAL',
    },
    conn: 'mock',
    ownerNear: false,
    ownerNearUntil: 0,
    logs: [],
    alert: null,
    stats: { waterCount: 0, distance: 0, sunMinutes: 0, greetCount: 0 },
    roomTime: {},
    manualHoldUntil: 0,
  }
}

export const robotStore = createStore<RobotStore>()((set) => ({
  ...initialState(),

  setMode: (mode) => set({ mode }),
  setBehavior: (behavior) => set({ behavior }),
  setFace: (face) => set({ face }),
  setLed: (led) => set((s) => ({ led: { ...s.led, ...led } })),
  setPos: (pos) => set((s) => ({ pos: { ...s.pos, ...pos } })),
  setTarget: (targetPos) => set({ targetPos }),
  setPath: (path) => set({ path }),

  applySensor: (patch) => set((s) => ({ sensors: { ...s.sensors, ...patch } })),
  setConn: (conn) => set({ conn }),

  setOwnerNear: (near) =>
    set((s) => ({ ownerNear: near, ownerNearUntil: near ? s.ownerNearUntil : 0 })),

  triggerOwnerNear: () =>
    set({ ownerNear: true, ownerNearUntil: Date.now() + OWNER_NEAR_MS }),

  pushLog: (kind, msg) =>
    set((s) => ({ logs: [{ t: Date.now(), kind, msg }, ...s.logs].slice(0, LOG_LIMIT) })),

  raiseAlert: (kind, msg, ms = ALERT_MS) =>
    set({ alert: { kind, msg, until: Date.now() + ms } }),

  sweepAlert: () =>
    set((s) => (s.alert && s.alert.until <= Date.now() ? { alert: null } : {})),

  bumpStats: (patch) => set((s) => ({ stats: { ...s.stats, ...patch } })),

  addRoomTime: (roomId, seconds) =>
    set((s) => ({ roomTime: { ...s.roomTime, [roomId]: (s.roomTime[roomId] ?? 0) + seconds } })),

  manualInput: () => set({ mode: 'manual', manualHoldUntil: Date.now() + MANUAL_HOLD_MS }),

  reset: () => set(initialState()),
}))

export function useRobotStore<T>(selector: (state: RobotStore) => T): T {
  return useStore(robotStore, selector)
}
