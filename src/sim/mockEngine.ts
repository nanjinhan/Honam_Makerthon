/**
 * 목업 시뮬레이션 엔진 — SPEC §8
 *
 * 200ms 틱. 인터넷도 ESP32도 없이 이것만으로 앱이 100% 돌아간다.
 * ESP32가 붙으면(conn === 'live') 센서 드리프트만 멈추고, 위치는 계속 여기서 만든다(§9-3).
 *
 * tick()은 setInterval 없이도 호출할 수 있게 순수하게 열어둔다. 90초 시나리오를
 * 실시간으로 기다리지 않고 검증하기 위한 것 — scripts/sim-check.ts 참고.
 */
import {
  PX_PER_M,
  WAYPOINTS,
  WAYPOINT_IDS,
  WAYPOINT_ROOM,
  dist,
  luxAt,
  moveWithWalls,
  nearestWaypoint,
  pathFrom,
  pointOf,
  roomAt,
  type WaypointId,
} from '@/data/floorplan'
import {
  BATTERY_CRITICAL,
  LUX_LOW,
  MOISTURE_CRITICAL,
  MOISTURE_TARGET,
  faceFor,
} from '@/lib/status'
import { robotStore, type Behavior } from '@/store/robotStore'

export const TICK_MS = 200
/** 개발 중 5로 올리면 5배속. 발표에서는 반드시 1. */
export const DEMO_SPEED = 1

const SPEED_PX = 75 // px/s — 25초 호흡에 맞춰 올렸다. 느리면 이동 구간만 10초를 먹는다.
const ARRIVE_R = 12
const GREET_TICKS = Math.round(4000 / TICK_MS) // 인사 — SPEC §7의 5초를 데모 호흡에 맞춰 4초로
const DOCK_TICKS = Math.round(1000 / TICK_MS)
const IDLE_DWELL_TICKS = Math.round(8000 / TICK_MS) // 이만큼 가만히 있으면 옆방까지만 순찰
const SUN_LUX = 600 // 이 위로는 일조 시간으로 친다
const BATTERY_OK = 25

/** 실측이 이 시간 넘게 안 들어오면 목업 드리프트를 다시 굴린다 */
const REAL_SENSOR_STALE_MS = 10_000

/**
 * 사이클 속도 — SPEC §8-1/§8-5는 "한 사이클 약 90초"를 잡았지만, 실제 시연 공간이
 * 1m 남짓이라 화면에서 90초짜리 여정을 보여주면 실물과 호흡이 완전히 어긋난다.
 * **한 사이클 약 25초**로 줄였다. 심사위원이 서서 보는 동안 두세 바퀴가 돈다.
 *
 *   수분 51 → 30 : 약 12초   (드리프트 0.35/틱)
 *   스테이션 이동 : 약 3초
 *   도킹          : 1초
 *   급수 30 → 92  : 약 5초    (2.5/틱)
 *   명당 복귀      : 약 3초
 */
const MOISTURE_DRIFT = 0.35
const WATER_RATE = 2.5

const get = () => robotStore.getState()
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const noise = (a: number) => (Math.random() * 2 - 1) * a

// ── 엔진 내부 상태 ───────────────────────────────────────────────
// 시간이 아니라 틱 수로 센다. tick()을 몰아서 호출해도 시나리오가 그대로 재현된다.
let ticks = 0
let phaseTicks = 0
let destination: WaypointId | null = null
/** 급수 중에 주인이 왔다 — 급수는 중단하지 않고 끝나면 인사한다 (SPEC §7 충돌 규칙) */
let greetPending = false
let resumeAfterGreet: { behavior: Behavior; destination: WaypointId | null } | null = null

function isWaterSeq(b: Behavior) {
  return b === 'go_water' || b === 'docking' || b === 'watering'
}

function setBehavior(next: Behavior) {
  const s = get()
  if (s.behavior === next) return
  s.setBehavior(next)
  phaseTicks = 0
}

function goTo(id: WaypointId) {
  const s = get()
  const pts = pathFrom(s.pos, id)
  const [first, ...rest] = pts
  destination = id
  s.setTarget(first ?? pointOf(id))
  s.setPath(rest)
}

function stopMoving() {
  const s = get()
  destination = null
  s.setTarget(null)
  s.setPath([])
}

// ── 센서 드리프트 (SPEC §8-1) ────────────────────────────────────

function drift() {
  const s = get()
  const k = DEMO_SPEED
  const sn = s.sensors
  const watering = s.behavior === 'watering'
  // 스테이션은 충전 덱을 겸한다. 도킹해 있는 동안은 급수 중에도 계속 충전된다.
  const onDock = watering || s.behavior === 'docking'

  const lux = luxAt(s.pos)

  /*
   * 실기기는 흙의 ADC 원본값(3300 바싹마름 ~ 1800 흠뻑)을 보내고 펌웨어가 5단계로
   * 판정한다. 목업에는 흙이 없으므로 수분%를 거꾸로 원본값으로 되돌려서 같은
   * 판정을 흉내낸다. 덕분에 화면 코드는 실기기든 목업이든 한 가지만 보면 된다.
   */
  const soilRaw = Math.round(3300 - (sn.moisture / 100) * (3300 - 1800))
  const soil =
    soilRaw >= 3300 ? 'VERY DRY'
    : soilRaw >= 2900 ? 'DRY'
    : soilRaw >= 2200 ? 'NORMAL'
    : soilRaw >= 1800 ? 'WET'
    : 'VERY WET'

  /*
   * 좌우 조도계는 실기기에 두 대가 달려 있다. 목업에서도 두 값을 따로 만들어야
   * 홈 화면의 조도(좌)/조도(우) 게이지가 ESP32 없이도 그럴듯하게 움직인다.
   * 로봇이 향한 방향에 따라 한쪽이 조금 더 밝게 — 그게 광원 탐색의 근거다.
   */
  const tilt = Math.sin((s.pos.heading * Math.PI) / 180) * 0.12

  s.applySensor({
    moisture: clamp(sn.moisture + (watering ? WATER_RATE : -MOISTURE_DRIFT) * k, 0, 95),
    nutrient: clamp(sn.nutrient - 0.01 * k, 0, 100),
    lux,
    soilRaw,
    soil,
    luxL: Math.max(0, Math.round(lux * (1 + tilt) + noise(8))),
    luxR: Math.max(0, Math.round(lux * (1 - tilt) + noise(8))),
    // 목업에는 진짜 장애물이 없다. 실기기가 붙으면 초음파 실측이 덮어쓴다.
    distance: -1,
    temp: 23.5 + Math.sin(ticks / 300) * 1.2 + noise(0.15),
    humidity: 48 + noise(2),
    battery: clamp(sn.battery + (onDock ? 0.5 : -0.02) * k, 0, 100),
    waterTank: watering ? clamp(sn.waterTank - 0.25 * k, 0, 100) : sn.waterTank,
  })
}

// ── 이동 (SPEC §8-3) ────────────────────────────────────────────

function angleTo(from: { x: number; y: number }, to: { x: number; y: number }) {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
}

/** 최단 회전 방향으로 25%씩 보간. 로봇이 제자리에서 홱 도는 걸 막는다. */
function turnToward(current: number, target: number) {
  let diff = ((target - current + 540) % 360) - 180
  return current + diff * 0.25
}

/** 최종 목적지에 도착한 틱에만 true */
function advance(): boolean {
  const s = get()
  const target = s.targetPos
  if (!target) return false

  const step = SPEED_PX * (TICK_MS / 1000) * DEMO_SPEED
  const d = dist(s.pos, target)
  const heading = turnToward(s.pos.heading, angleTo(s.pos, target))

  // DEMO_SPEED를 올리면 한 틱 이동량이 도착 반경보다 커질 수 있어 max로 잡는다
  if (d <= Math.max(ARRIVE_R, step)) {
    s.setPos({ x: target.x, y: target.y, heading })
    s.bumpStats({ distance: s.stats.distance + d / PX_PER_M })

    const [next, ...rest] = s.path
    if (next) {
      s.setTarget(next)
      s.setPath(rest)
      return false
    }
    s.setTarget(null)
    return true
  }

  s.setPos({
    x: s.pos.x + ((target.x - s.pos.x) / d) * step,
    y: s.pos.y + ((target.y - s.pos.y) / d) * step,
    heading,
  })
  s.bumpStats({ distance: s.stats.distance + step / PX_PER_M })
  return false
}

// ── 행동 전이 ───────────────────────────────────────────────────

function startGoWater(cause: 'battery' | 'moisture') {
  const s = get()
  setBehavior('go_water')
  goTo('station')
  s.pushLog(
    'warn',
    cause === 'battery'
      ? `배터리 ${Math.round(s.sensors.battery)}% · 임계 미만 → 충전 최우선`
      : `수분 ${Math.round(s.sensors.moisture)}% · 임계 미만 → 급수 최우선`,
  )
}

/**
 * 절대 최대 조도 지점(brightestWaypoint)으로 가면 스테이션에서 다이닝까지 가로지르느라
 * 복귀에만 10초가 걸린다. **충분히 밝으면서 가장 가까운** 자리로 간다.
 */
function nearestBrightSpot(): WaypointId {
  const from = get().pos
  let best: WaypointId = WAYPOINT_IDS[0]
  let bestScore = Infinity
  for (const id of WAYPOINT_IDS) {
    const p = pointOf(id)
    if (luxAt(p) < SUN_LUX) continue
    const d = dist(from, p)
    if (d < bestScore) {
      bestScore = d
      best = id
    }
  }
  return best
}

function startSeekLight() {
  const s = get()
  setBehavior('seek_light')
  goTo(nearestBrightSpot())
  s.pushLog('light', `조도 ${Math.round(s.sensors.lux)}lux · 부족 → 일조량 최적 위치 탐색 시작`)
}

function startReturn() {
  const s = get()
  setBehavior('returning')
  goTo(nearestBrightSpot())
  s.pushLog('move', '급수 완료 → 햇빛 명당으로 복귀')
}

function startGreet() {
  const s = get()
  resumeAfterGreet = { behavior: s.behavior, destination }
  setBehavior('greet')
  stopMoving()
  s.bumpStats({ greetCount: s.stats.greetCount + 1 })
  s.pushLog('greet', '주인 감지 · 인사')
}

function endGreet() {
  const s = get()
  const resume = resumeAfterGreet
  resumeAfterGreet = null
  s.pushLog('greet', '인사 완료 → 이전 행동 복귀')

  if (resume && resume.destination && resume.behavior !== 'idle' && resume.behavior !== 'greet') {
    setBehavior(resume.behavior)
    goTo(resume.destination)
    return
  }
  setBehavior('idle')
}

function settle() {
  const s = get()
  stopMoving()
  const room = WAYPOINT_ROOM[nearestWaypoint(s.pos)]
  setBehavior('idle')
  s.pushLog('move', `${room} 도착 · 조도 ${Math.round(s.sensors.lux)}lux`)
}

function patrolStep() {
  const s = get()
  const here = nearestWaypoint(s.pos)
  // 인접 노드로만 나간다. 먼 방까지 가면 시연 호흡이 늘어지고 급수 타이밍도 놓친다.
  const links = WAYPOINTS[here].links as readonly WaypointId[]
  const candidates = links.filter((id) => id !== 'station' && id !== 'entry')
  if (candidates.length === 0) return
  const next = candidates[Math.floor(Math.random() * candidates.length)]
  setBehavior('patrol')
  goTo(next)
  s.pushLog('move', `${WAYPOINT_ROOM[here]} → ${WAYPOINT_ROOM[next]} 이동`)
}

/** 급수 시퀀스는 한번 들어가면 우선순위 재평가 없이 끝까지 간다 */
function advanceWaterSeq(arrived: boolean) {
  const s = get()

  if (s.ownerNear && !greetPending) {
    greetPending = true
    s.pushLog('greet', '주인 감지 · 물 받는 중이라 인사는 잠시 후에')
  }

  if (s.behavior === 'go_water') {
    if (arrived) {
      setBehavior('docking')
      s.pushLog('water', '급수 스테이션 도착 · 도킹 정렬')
    }
    return
  }

  if (s.behavior === 'docking') {
    if (phaseTicks >= DOCK_TICKS) {
      setBehavior('watering')
      s.pushLog('water', '도킹 완료 · 물 보충 시작')
    }
    return
  }

  // watering
  const done = s.sensors.moisture >= MOISTURE_TARGET && s.sensors.battery >= BATTERY_OK
  if (!done) return

  s.bumpStats({ waterCount: s.stats.waterCount + 1 })
  s.pushLog('water', `급수 완료 · 수분 ${Math.round(s.sensors.moisture)}%`)

  if (greetPending) {
    greetPending = false
    setBehavior('returning')
    goTo(nearestBrightSpot())
    startGreet() // 보류해둔 인사를 여기서 갚는다. 끝나면 복귀를 이어서 한다.
    return
  }
  startReturn()
}

/** 행동 우선순위 상태머신 — SPEC §7 */
function decide(arrived: boolean) {
  const s = get()
  const b = s.behavior

  if (isWaterSeq(b)) {
    advanceWaterSeq(arrived)
    return
  }

  if (b === 'greet') {
    if (phaseTicks >= GREET_TICKS) endGreet()
    return
  }

  if (s.sensors.battery < BATTERY_CRITICAL) {
    startGoWater('battery')
    return
  }
  if (s.sensors.moisture < MOISTURE_CRITICAL) {
    startGoWater('moisture')
    return
  }
  if (s.ownerNear) {
    startGreet()
    return
  }
  if (s.sensors.lux < LUX_LOW) {
    if (b !== 'seek_light') startSeekLight()
    else if (arrived) settle()
    return
  }

  // 조도 충분 — 이동 중이면 마저 가고, 자리에 오래 있었으면 순찰을 나간다
  if (b === 'seek_light' || b === 'returning' || b === 'patrol') {
    if (arrived) settle()
    return
  }
  if (b === 'idle' && phaseTicks >= IDLE_DWELL_TICKS) patrolStep()
}

// ── 틱 ─────────────────────────────────────────────────────────

export function tick() {
  ticks++
  phaseTicks++
  const s = get()
  const now = Date.now()

  if (s.ownerNear && s.ownerNearUntil > 0 && now > s.ownerNearUntil) s.setOwnerNear(false)

  // 다 띄운 긴급 알림은 스스로 사라져야 한다. 섬을 내리는 쪽이 setTimeout을 안
  // 걸어도 되게 여기서 한 곳에서만 만료를 본다.
  s.sweepAlert()

  if (s.mode === 'manual' && now > s.manualHoldUntil) {
    s.setMode('auto')
    s.pushLog('system', '10초 무입력 → 자율 모드 복귀')
  }

  /*
   * 실측이 들어오는 동안에는 드리프트를 멈춘다 (SPEC §9-3).
   *
   * 예전엔 WebSocket 연결(conn === 'live')만 봤다. 이제 Supabase를 거쳐서도
   * 실측이 들어오는데 그때는 conn이 'mock'이라, 시뮬레이션이 진짜 값을
   * 200ms마다 덮어써 버렸다. "센서를 연동했는데 화면은 목업"의 원인이다.
   * 경로를 가리지 말고 **최근에 실측이 왔는가**로 판단한다.
   */
  if (Date.now() - s.sensorAt > REAL_SENSOR_STALE_MS) drift()

  const arrived = advance()

  const dtSec = (TICK_MS / 1000) * DEMO_SPEED

  if (get().sensors.lux >= SUN_LUX) {
    const st = get()
    st.bumpStats({ sunMinutes: st.stats.sunMinutes + dtSec / 60 })
  }

  const room = roomAt(get().pos)
  if (room) get().addRoomTime(room.id, dtSec)

  if (get().mode === 'auto') decide(arrived)

  const after = get()
  const face = faceFor(after)
  if (after.face !== face) after.setFace(face)
}

export type Dir = 'F' | 'B' | 'L' | 'R' | 'SL' | 'SR' | 'STOP'

/**
 * D-패드 입력 한 번(=150ms 반복 전송 한 틱)을 목업 로봇에 반영한다.
 * 실기기에서는 같은 명령이 WebSocket으로도 나가고, 화면 위 위치는 계속 이 값을 쓴다(§13).
 */
export function manualDrive(dir: Dir, spd: number) {
  const s = get()
  if (dir === 'STOP') return

  stopMoving() // 자율 경로는 버린다
  const gain = Math.max(0, Math.min(1, spd / 255))
  const step = 26 * gain
  const turn = 14 * gain

  let { x, y, heading } = s.pos

  if (dir === 'SL') heading -= turn * 1.6
  else if (dir === 'SR') heading += turn * 1.6
  else {
    if (dir === 'L') heading -= turn
    if (dir === 'R') heading += turn
    const sign = dir === 'B' ? -1 : 1
    const rad = (heading * Math.PI) / 180
    x += Math.cos(rad) * step * sign
    y += Math.sin(rad) * step * sign
  }

  /*
   * 벽을 뚫고 지나가지 않게 한다.
   *
   * 회전(heading)은 막지 않는다 — 벽에 코를 박았을 때 돌아서 빠져나올 수 있어야
   * 하는데, 회전까지 막으면 그 자리에 영영 갇힌다. 막는 건 **이동뿐**이다.
   *
   * 자율주행은 웨이포인트 그래프를 따라가므로 이 판정을 안 거친다. 수동 조종만
   * 사람이 아무 방향으로나 밀어붙일 수 있어서 벽을 넘을 수 있었다.
   */
  const want = { x: clamp(x, 50, 950), y: clamp(y, 50, 710) }
  const next = moveWithWalls({ x: s.pos.x, y: s.pos.y }, want)

  s.setPos({ x: next.x, y: next.y, heading })
}

/**
 * 사람이 "저 방으로 가"라고 지시하는 경로. 수동 홀드가 걸리므로 자율 판단은
 * 10초간 멈추고, 그 뒤에는 SPEC §11-3대로 알아서 자율로 복귀한다.
 */
export function commandGoTo(id: WaypointId, label: string) {
  const s = get()
  s.manualInput()
  setBehavior('patrol')
  goTo(id)
  s.pushLog('move', `${label}(으)로 이동 지시`)
}

let timer: ReturnType<typeof setInterval> | null = null

let announced = false

/** StrictMode의 이중 마운트에서도 타이머가 두 개 돌지 않게 막는다 */
export function startEngine(): () => void {
  if (timer) return stopEngine
  // StrictMode는 마운트→언마운트→마운트를 한 번 더 돌린다. 시작 로그가 두 줄 남으면 안 된다.
  if (!announced) {
    announced = true
    robotStore.getState().pushLog('system', '시스템 시작 — 목업 모드')
  }
  timer = setInterval(tick, TICK_MS)
  return stopEngine
}

export function stopEngine() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** 검증 스크립트/테스트용 — 내부 카운터까지 초기화한다 */
export function resetEngine() {
  stopEngine()
  ticks = 0
  phaseTicks = 0
  announced = false
  destination = null
  greetPending = false
  resumeAfterGreet = null
  robotStore.getState().reset()
}
