const fs = require('fs')
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(Boolean)
  .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()] }))
const U = env.VITE_SUPABASE_URL, K = env.VITE_SUPABASE_ANON_KEY
const h = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates' }

;(async () => {
  // ESP32의 pushSensorsToCloud()가 보내는 것과 똑같은 본문
  const body = { id: 1, moisture: 12, soil: 'VERY DRY', soil_raw: 3380,
                 lux: 47, lux_l: 41, lux_r: 53, distance: 18.4, ir: false }
  let r = await fetch(U + '/rest/v1/robot_sensors', { method: 'POST', headers: h, body: JSON.stringify(body) })
  console.log('1. ESP32 -> Supabase 업로드:', r.status, r.ok ? 'OK' : await r.text())

  // 웹의 cloudSensors가 보내는 것과 똑같은 조회
  r = await fetch(U + '/rest/v1/robot_sensors?select=moisture,soil,soil_raw,lux,lux_l,lux_r,distance,ir,updated_at&id=eq.1',
                  { headers: { apikey: K, Authorization: 'Bearer ' + K } })
  const [row] = await r.json()
  console.log('2. 웹 <- Supabase 조회:', r.status)
  console.log('   ', row)

  const age = Date.now() - new Date(row.updated_at).getTime()
  console.log('3. updated_at 나이:', Math.round(age/1000) + '초')
  console.log('   ', age < 15000 ? '[OK] 트리거가 시각을 찍었다 -> 웹이 실측으로 인정' 
                                 : '[X] 시각이 안 갱신됨 -> 웹이 목업으로 되돌아간다')

  const ok = row.soil === 'VERY DRY' && row.lux_l === 41 && row.lux_r === 53 && row.distance === 18.4
  console.log('4. 값 왕복 일치:', ok ? '[OK]' : '[X]')
})()
