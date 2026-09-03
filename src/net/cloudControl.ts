/**
 * 클라우드 경유 조종 — 웹이 robot_command에 쓰고, ESP32가 0.3초마다 가지러 간다.
 *
 * WebSocket(net/ws.ts)과 목적이 겹치지만 성질이 다르다.
 *
 *   WebSocket   폰 → ESP32 직접. 0.1초로 빠르지만 **같은 와이파이**여야 하고,
 *               배포된 https 사이트에서는 브라우저가 ws:// 연결을 막는다.
 *   이 경로     폰 → Supabase → (ESP32가 가지러 옴). 0.3초쯤 걸리지만 인터넷만
 *               있으면 어디서든 된다. https도 방화벽도 상관없다.
 *
 * 둘을 동시에 쓴다. 같은 와이파이면 WebSocket이 먼저 먹고, 아니면 이쪽이 받는다.
 * 심사 때 한쪽이 막혀도 나머지로 조종이 살아 있게 하려는 것이다.
 */
import { supabase } from '@/lib/supabaseClient'

/**
 * D패드는 누르고 있는 동안 150ms마다 같은 명령을 반복해서 쏜다. 그걸 그대로
 * DB에 쓰면 초당 7번씩 쓰게 된다. ESP32가 어차피 300ms마다 가지러 오므로
 * 그보다 촘촘히 쓸 이유가 없다.
 */
const MIN_WRITE_MS = 200

let lastWriteAt = 0

async function write(dir: string, spd: number) {
  if (!supabase) return
  const { error } = await supabase.from('robot_command').upsert({
    id: 1,
    dir,
    spd,
    /*
     * ESP32의 데드맨 스위치가 이 숫자만 본다. 값이 계속 올라가야 "사람이 아직
     * 버튼을 누르고 있다"로 읽힌다. 브라우저가 죽으면 여기서 멈추고, ESP32는
     * 1.2초 뒤 스스로 정지한다.
     */
    seq: Date.now(),
    updated_at: new Date().toISOString(),
  })
  if (error) console.warn('[cloud] 명령 전송 실패:', error.message)
}

export function pushCloudMove(dir: string, spd: number) {
  if (!supabase) return

  /*
   * STOP은 절대 스로틀에 걸려 버려지면 안 된다. 이거 하나 놓치면 손을 뗐는데도
   * 로봇이 계속 달린다. 나머지 명령만 솎아낸다.
   */
  if (dir === 'STOP') {
    lastWriteAt = Date.now()
    void write(dir, spd)
    return
  }

  const now = Date.now()
  if (now - lastWriteAt < MIN_WRITE_MS) return
  lastWriteAt = now
  void write(dir, spd)
}
