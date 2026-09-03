/**
 * 로그 시각은 19:26:09 고정폭 — SPEC §10-2.
 * "19시 26분 9초"는 자릿수가 흔들려서 세로로 스캔이 안 된다.
 */
export function formatTime(t: number) {
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
