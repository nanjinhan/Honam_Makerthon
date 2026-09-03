/**
 * 상태 라벨(SPEC §6-1)과 판단 근거 문구(SPEC §7-1).
 *
 * 발표자가 말하지 않아도 화면이 스스로 설명하게 만드는 부분이라
 * 문구는 전부 여기 한 곳에서만 만든다.
 */
import type { Behavior, Face, RobotState } from '@/store/robotStore'

export type StatusLabel = 'GOOD' | 'SOSO' | 'THIRSTY'

/** 배터리가 이 아래면 다른 무엇보다 충전이 먼저다 — SPEC §7 */
export const BATTERY_CRITICAL = 15
export const MOISTURE_CRITICAL = 30
export const MOISTURE_SOSO = 55
export const LUX_LOW = 400
/** 급수 목표치 — SPEC §8-5 */
export const MOISTURE_TARGET = 92

export function statusLabel(state: Pick<RobotState, 'sensors'>): StatusLabel {
  const { moisture, lux } = state.sensors
  if (moisture < MOISTURE_CRITICAL) return 'THIRSTY'
  if (moisture < MOISTURE_SOSO || lux < LUX_LOW) return 'SOSO'
  return 'GOOD'
}

export const STATUS_TEXT: Record<StatusLabel, string> = {
  GOOD: '좋아요',
  SOSO: '그럭저럭',
  THIRSTY: '목말라요',
}

/** 주인이 옆에 있으면 다른 조건은 다 무시하고 love — SPEC §6-1 */
export function faceFor(state: Pick<RobotState, 'sensors' | 'ownerNear' | 'behavior'>): Face {
  if (state.ownerNear || state.behavior === 'greet') return 'love'
  if (state.behavior === 'watering') return 'excited'
  switch (statusLabel(state)) {
    case 'THIRSTY':
      return 'thirsty'
    case 'SOSO':
      return 'neutral'
    default:
      return 'happy'
  }
}

const pct = (n: number) => `${Math.round(n)}%`

export const BEHAVIOR_TEXT: Record<Behavior, string> = {
  idle: '대기 중',
  patrol: '순찰 중',
  seek_light: '광원 탐색 중',
  go_water: '급수 스테이션으로',
  docking: '도킹 중',
  watering: '물 받는 중',
  greet: '주인 인사 중',
  returning: '자리로 복귀 중',
}

type ReasonInput = Pick<RobotState, 'sensors' | 'behavior' | 'ownerNear' | 'mode'>

/**
 * 지금 왜 이 행동을 하는지 한 줄. 상태 라벨 바로 아래와 Dynamic Island에 같이 쓴다.
 * 심사 질의응답에서 제일 많이 가리키게 될 문장이다.
 */
export function reasonOf(state: ReasonInput): string {
  const { moisture, lux, battery } = state.sensors
  const b = state.behavior

  if (state.mode === 'manual') return '수동 제어 중 · 자율 판단 일시 정지'

  // 급수 시퀀스는 주인이 와도 중단하지 않는다 — SPEC §7 충돌 규칙
  if (state.ownerNear && (b === 'go_water' || b === 'docking' || b === 'watering')) {
    return '물 받는 중 · 인사는 잠시 후에'
  }

  switch (b) {
    case 'greet':
      return '주인 감지 → 인사 후 복귀'
    case 'watering':
      return `급수 중 · 수분 ${pct(moisture)} → ${MOISTURE_TARGET}%까지 보충`
    case 'docking':
      return '스테이션 도착 → 도킹 정렬 중'
    case 'go_water':
      return battery < BATTERY_CRITICAL
        ? `배터리 ${pct(battery)} · 임계 미만 → 충전 최우선`
        : `수분 ${pct(moisture)} · 임계 미만 → 급수 최우선`
    case 'returning':
      return '급수 완료 → 햇빛 명당으로 복귀'
    case 'seek_light':
      return `수분 ${pct(moisture)} · 아직 여유 → 광원 탐색 우선`
    default:
      return `조도 ${Math.round(lux)}lux · 수분 ${pct(moisture)} → 현재 자리 유지`
  }
}

/** Dynamic Island용 축약 — SPEC §7-1 */
export function islandTextOf(state: ReasonInput): { title: string; desc: string } {
  return { title: BEHAVIOR_TEXT[state.behavior], desc: reasonOf(state) }
}
