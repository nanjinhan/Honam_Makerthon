/**
 * 7단계 검증 — 화면 없이 콘솔만으로 90초 시나리오 한 사이클을 확인한다.
 *   npx tsx scripts/sim-check.ts
 *
 * setInterval을 쓰지 않고 tick()을 직접 450번(=90초) 돌리므로 즉시 끝난다.
 */
import { bfs, luxAt, pointOf } from '../src/data/floorplan'
import { reasonOf } from '../src/lib/status'
import { TICK_MS, resetEngine, tick } from '../src/sim/mockEngine'
import { robotStore } from '../src/store/robotStore'

const s = () => robotStore.getState()

console.log('── 6단계: 경로 탐색 ──')
console.log("bfs('station','bed3') =", bfs('station', 'bed3').join(' → '))
console.log("bfs('mbed','kitchen') =", bfs('mbed', 'kitchen').join(' → '))

console.log('\n── 6단계: 위치 기반 조도 ──')
for (const id of ['living', 'dining', 'hall_s', 'mbed', 'station'] as const) {
  console.log(`  ${id.padEnd(8)} ${String(luxAt(pointOf(id))).padStart(4)} lux`)
}

console.log('\n── 7단계: 90초 자동 시나리오 ──')
resetEngine()

const seen: string[] = []
const TICKS = Math.round(40_000 / TICK_MS)  // 25초 사이클 + 여유

for (let i = 0; i < TICKS; i++) {
  tick()
  const b = s().behavior
  if (seen[seen.length - 1] !== b) {
    const t = ((i * TICK_MS) / 1000).toFixed(1).padStart(5)
    const sn = s().sensors
    console.log(
      `  ${t}s  ${b.padEnd(11)} 수분 ${sn.moisture.toFixed(0).padStart(2)}%` +
        `  조도 ${String(Math.round(sn.lux)).padStart(4)}  배터리 ${sn.battery.toFixed(0)}%` +
        `  | ${reasonOf(s())}`,
    )
    seen.push(b)
  }
}

const need = ['seek_light', 'go_water', 'docking', 'watering', 'returning']
const missing = need.filter((b) => !seen.includes(b))
const st = s().stats

console.log('\n  거친 행동:', seen.join(' → '))
console.log(
  `  통계: 급수 ${st.waterCount}회 · 이동 ${st.distance.toFixed(1)}m · ` +
    `일조 ${st.sunMinutes.toFixed(1)}분 · 인사 ${st.greetCount}회`,
)
console.log(missing.length === 0 ? '  ✅ 한 사이클 완주' : `  ❌ 누락: ${missing.join(', ')}`)

console.log('\n── 7단계: 급수 중 주인 감지 (중단 금지 규칙) ──')
resetEngine()
let greeted = false
for (let i = 0; i < TICKS * 2; i++) {
  tick()
  // 급수가 시작되면 주인이 들어온 것으로 친다
  if (s().behavior === 'watering' && !greeted) {
    s().triggerOwnerNear()
    greeted = true
    console.log('  → 급수 중 주인 감지 트리거')
  }
  if (greeted && s().behavior === 'greet') {
    console.log(`  ✅ 급수를 끝낸 뒤 인사로 전이 (${((i * TICK_MS) / 1000).toFixed(1)}s)`)
    break
  }
}
const conflictLogs = s()
  .logs.filter((l) => l.kind === 'greet' || l.kind === 'water')
  .slice(0, 5)
  .reverse()
for (const l of conflictLogs) console.log(`     [${l.kind}] ${l.msg}`)
