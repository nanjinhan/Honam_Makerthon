/**
 * Supabase 클라이언트 — 있으면 쓰고, 없으면 조용히 꺼진다.
 *
 * SPEC §0-3 절대 원칙: 인터넷 없이 `npm run dev`만으로 100% 동작해야 한다.
 * 그래서 이 값이 비어 있어도(=Supabase를 아직 안 붙였어도) 앱이 에러 없이
 * 돌아야 한다. `supabase`가 null이면 호출부(cloudSync.ts)가 전부 스킵한다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

if (!supabase) {
  console.info(
    '[supabase] VITE_SUPABASE_URL/ANON_KEY가 없어 클라우드 동기화를 건너뜁니다. ' +
      '.env.local에 값을 넣으면 켜집니다. (목업 데모 자체는 이 값 없이도 100% 동작합니다)',
  )
}
