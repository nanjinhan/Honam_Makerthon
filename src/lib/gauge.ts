/**
 * 게이지 색 기준 — SPEC §4-3
 *
 * **§6-1의 상태 라벨 임계값과 별개다. 섞지 말 것.**
 * 평상시엔 파랑 하나뿐이고, 주의/위험 구간일 때만 색이 나타난다.
 */
export type GaugeLevel = 'ok' | 'warn' | 'alert'

/** §4-3 게이지 색 기준. §6-1의 상태 라벨 임계값과 **별개**다. 섞지 말 것. */
export function levelOf(
  metric: 'moisture' | 'nutrient' | 'lux' | 'temp',
  v: number,
): GaugeLevel {
  switch (metric) {
    case 'moisture':
      return v < 25 ? 'alert' : v < 40 ? 'warn' : 'ok'
    case 'nutrient':
      return v < 20 ? 'alert' : v < 35 ? 'warn' : 'ok'
    case 'lux':
      return v < 200 ? 'alert' : v < 400 ? 'warn' : 'ok'
    case 'temp':
      // 23~25℃는 항상 정상이다
      if (v < 10 || v > 33) return 'alert'
      if (v < 15 || v > 30) return 'warn'
      return 'ok'
  }
}
