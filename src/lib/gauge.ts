/**
 * 게이지 색 기준 — SPEC §4-3
 *
 * **§6-1의 상태 라벨 임계값과 별개다. 섞지 말 것.**
 * 평상시엔 파랑 하나뿐이고, 주의/위험 구간일 때만 색이 나타난다.
 */
export type GaugeLevel = 'ok' | 'warn' | 'alert'

/** §4-3 게이지 색 기준. §6-1의 상태 라벨 임계값과 **별개**다. 섞지 말 것. */
export function levelOf(
  metric: 'moisture' | 'nutrient' | 'lux' | 'temp' | 'distance',
  v: number,
): GaugeLevel {
  switch (metric) {
    case 'distance':
      // 펌웨어의 OBSTACLE_NEAR_CM(20) / OBSTACLE_FAR_CM(30)과 같은 숫자를 쓴다.
      // 두 곳이 어긋나면 "화면은 빨간데 로봇은 그냥 간다"가 된다.
      if (v < 0) return 'ok' // -1 = 앞이 비었음. 0cm가 아니다
      return v < 20 ? 'alert' : v < 30 ? 'warn' : 'ok'
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
