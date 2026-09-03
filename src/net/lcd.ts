/**
 * LCD 문구 읽기·쓰기 한 곳.
 *
 * 쓰는 곳이 둘이라 여기로 모았다.
 *   1. 조종 탭의 문구 입력창 (사람이 직접 타이핑)
 *   2. 동작 버튼 (인사/물/소리/빙글) — 누르면 그 동작 문구가 LCD에 뜬다
 *
 * ESP32는 3초마다 이 값을 읽어간다(firmware/lcd_wifi). 즉 여기 쓰면 LCD에 나온다.
 */
import { supabase } from '@/lib/supabaseClient'

/** 1602 LCD 한 줄 폭 */
export const LCD_COLS = 16

/** HD44780 문자표에 없는 글자(한글 등)는 깨지므로 미리 걸러낸다 */
export function sanitizeLcd(v: string) {
  return v.replace(/[^\x20-\x7E]/g, '')
}

/**
 * 두 줄짜리 문구를 만든다. 펌웨어의 showOnLcd()가 0~15번째를 윗줄,
 * 16~31번째를 아랫줄에 찍으므로, 윗줄을 16칸으로 채워서 보낸다.
 */
export function twoLines(top: string, bottom = '') {
  return (top.slice(0, LCD_COLS).padEnd(LCD_COLS) + bottom.slice(0, LCD_COLS)).trimEnd()
}

export async function setLcdText(text: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('lcd_state')
    .upsert({ id: 1, text, updated_at: new Date().toISOString() })
  if (error) {
    console.warn('[lcd] 전송 실패:', error.message)
    return false
  }
  return true
}

export async function getLcdText(): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('lcd_state').select('text').eq('id', 1).maybeSingle()
  if (error) return null
  return data?.text ?? ''
}
