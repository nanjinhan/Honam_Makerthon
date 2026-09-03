/**
 * 브라우저 → Supabase 동기화.
 *
 * 목업 엔진이든 실제 ESP32(WebSocket)든, 데이터는 결국 robotStore를 거친다.
 * 그래서 store 하나만 구독하면 출처를 안 가리고 전부 클라우드로 흘려보낼 수 있다.
 *
 * 200ms 틱마다 그대로 쓰면 Supabase 무료 티어를 금방 태운다. 그래서:
 *   - 센서: 5초에 한 번 스냅샷
 *   - 로봇 상태: 값이 바뀐 뒤 2초에 한 번 (행 하나만 계속 덮어쓴다)
 *   - 로그: 새로 생긴 것만, 생기는 즉시
 *
 * Supabase가 연결 안 돼 있으면(supabase === null) 전부 조용히 아무 일도 안 한다 —
 * 클라우드 동기화 실패가 로컬 데모를 막으면 안 된다(SPEC §0-3).
 */
import { supabase } from '@/lib/supabaseClient'
import { robotStore, type LogEntry } from '@/store/robotStore'

const SENSOR_PERIOD_MS = 5000
const STATE_PERIOD_MS = 2000

let lastSensorAt = 0
let lastStateAt = 0
let lastLogSyncedT = 0
let started = false

async function pushSensors() {
  if (!supabase) return
  const { sensors } = robotStore.getState()
  const { error } = await supabase.from('sensor_readings').insert({
    moisture: sensors.moisture,
    nutrient: sensors.nutrient,
    lux: sensors.lux,
    temp: sensors.temp,
    humidity: sensors.humidity,
    battery: sensors.battery,
    water_tank: sensors.waterTank,
  })
  if (error) console.warn('[cloudSync] sensor_readings 실패:', error.message)
}

async function pushState() {
  if (!supabase) return
  const s = robotStore.getState()
  const { error } = await supabase.from('robot_state').upsert({
    id: 1,
    mode: s.mode,
    behavior: s.behavior,
    face: s.face,
    pos_x: s.pos.x,
    pos_y: s.pos.y,
    heading: s.pos.heading,
    led_r: s.led.r,
    led_g: s.led.g,
    led_b: s.led.b,
    led_mode: s.led.mode,
    conn: s.conn,
    updated_at: new Date().toISOString(),
  })
  if (error) console.warn('[cloudSync] robot_state 실패:', error.message)
}

async function pushNewLogs(logs: LogEntry[]) {
  if (!supabase) return
  // logs는 최신이 앞(unshift). lastLogSyncedT보다 새 것만 골라 오래된 순으로 보낸다.
  const fresh = logs.filter((l) => l.t > lastLogSyncedT).reverse()
  if (fresh.length === 0) return

  lastLogSyncedT = logs[0].t

  const { error } = await supabase
    .from('robot_logs')
    .insert(fresh.map((l) => ({ kind: l.kind, msg: l.msg, created_at: new Date(l.t).toISOString() })))
  if (error) console.warn('[cloudSync] robot_logs 실패:', error.message)
}

/** App.tsx에서 엔진과 함께 한 번 시작한다. */
export function startCloudSync(): () => void {
  if (!supabase) return () => {}
  if (started) return () => {}
  started = true

  // 시작 시점 이후 로그만 밀어올린다. 과거 것까지 매번 다시 보내면 중복이 쌓인다.
  lastLogSyncedT = robotStore.getState().logs[0]?.t ?? 0

  const unsub = robotStore.subscribe((s) => {
    const now = Date.now()

    if (now - lastSensorAt >= SENSOR_PERIOD_MS) {
      lastSensorAt = now
      void pushSensors()
    }
    if (now - lastStateAt >= STATE_PERIOD_MS) {
      lastStateAt = now
      void pushState()
    }
    if (s.logs.length > 0 && s.logs[0].t > lastLogSyncedT) {
      void pushNewLogs(s.logs)
    }
  })

  return () => {
    unsub()
    started = false
  }
}
