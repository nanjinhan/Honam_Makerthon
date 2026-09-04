/**
 * 클라우드 경유 센서 수신 — ESP32가 올린 실측을 웹이 가져온다.
 *
 * WebSocket(net/ws.ts)으로도 같은 값이 오지만, 그 경로는 폰과 ESP32가 **같은
 * 와이파이**에 있어야 하고 배포된 https 사이트에서는 브라우저가 ws:// 연결을
 * 막는다. 그래서 Vercel 주소로 열면 게이지가 전부 목업 숫자였다 —
 * 조도 좌/우도, "수분 바싹 마름"도 실제 흙이 아니라 시뮬레이션이었다.
 *
 * 이 경로는 Supabase를 거치므로 어디서 열어도 진짜 값이 보인다.
 * WebSocket이 붙어 있으면 그쪽이 더 빠르므로 이쪽은 조용히 물러난다.
 */
import { supabase } from '@/lib/supabaseClient'
import { robotStore } from '@/store/robotStore'

/** ESP32는 3초마다 올린다. 그보다 자주 읽을 이유가 없다. */
const POLL_MS = 3000

/**
 * 이보다 오래된 값이면 ESP32가 꺼진 것으로 본다.
 * 죽은 숫자를 실시간인 척 띄우면 안 된다 — 그럴 땐 목업으로 되돌아간다.
 */
const STALE_MS = 15_000

const get = () => robotStore.getState()

async function tick() {
  if (!supabase) return

  const { data, error } = await supabase
    .from('robot_sensors')
    .select('moisture,soil,soil_raw,lux,lux_l,lux_r,distance,ir,updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (error || !data) return

  // 너무 오래된 값이면 무시한다. 그러면 목업 엔진이 알아서 다시 굴러간다.
  const age = Date.now() - new Date(data.updated_at).getTime()
  if (age > STALE_MS) return

  // WebSocket이 붙어 있으면 그쪽이 훨씬 빠르다. 느린 값으로 덮어쓰지 않는다.
  if (get().conn === 'live') return

  get().applyRealSensor({
    moisture: data.moisture,
    soil: data.soil,
    soilRaw: data.soil_raw,
    lux: data.lux,
    luxL: data.lux_l,
    luxR: data.lux_r,
    distance: data.distance,
    irNear: data.ir,
  })
}

/** 앱이 사는 내내 돈다. Supabase가 없으면 아무것도 안 하고 조용히 빠진다. */
export function startCloudSensors() {
  if (!supabase) return () => {}
  void tick()
  const timer = setInterval(() => void tick(), POLL_MS)
  return () => clearInterval(timer)
}
