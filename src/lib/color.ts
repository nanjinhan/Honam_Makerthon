/**
 * cult-ui ColorPicker는 hex를 받아 `hsl(h, s%, l%)` 문자열을 돌려준다.
 * 스토어와 ESP32 프로토콜(§9-2)은 r/g/b 0-255를 쓰므로 여기서 변환한다.
 */
export interface Rgb {
  r: number
  g: number
  b: number
}

export function hexFromRgb({ r, g, b }: Rgb) {
  const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** `hsl(220, 85%, 55%)` 또는 `#2f6bea` 둘 다 받는다 */
export function rgbFromColorString(input: string): Rgb | null {
  const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(input.trim())
  if (hex) {
    return { r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16) }
  }

  const hsl = /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/i.exec(input)
  if (!hsl) return null

  const h = Number(hsl[1]) / 360
  const s = Number(hsl[2]) / 100
  const l = Number(hsl[3]) / 100

  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }

  return {
    r: Math.round(channel(h + 1 / 3) * 255),
    g: Math.round(channel(h) * 255),
    b: Math.round(channel(h - 1 / 3) * 255),
  }
}
