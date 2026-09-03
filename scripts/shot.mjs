/**
 * 개발용 스크린샷 도구. dev 서버가 떠 있는 상태에서:
 *   node scripts/shot.mjs [outDir]
 * 탭 4개를 폰 크기로 찍고, 가로 넘침이 있으면 원인 엘리먼트를 같이 뱉는다.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.APP_URL ?? 'http://localhost:5173/'
const OUT = process.argv[2] ?? '.shots'

mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'networkidle2' })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

// 엔진이 몇 초 돌아 로봇이 움직인 뒤에 찍는다
await new Promise((r) => setTimeout(r, 6000))

const overflow = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth
  const bad = []
  for (const el of document.querySelectorAll('*')) {
    // SVG 내부는 viewBox로 잘리므로 화면을 넘치게 하지 않는다
    if (el.ownerSVGElement) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
      bad.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 70),
        left: Math.round(r.left),
        right: Math.round(r.right),
      })
    }
  }
  return { vw, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 12) }
})

console.log(`viewport ${overflow.vw} / scrollWidth ${overflow.scrollW}`)
if (overflow.bad.length) {
  console.log('가로로 넘치는 엘리먼트:')
  for (const b of overflow.bad) console.log(`  ${b.tag}.${b.cls}  [${b.left} → ${b.right}]`)
}

const TABS = ['홈', '맵', '조종', '기록']
for (const label of TABS) {
  const clicked = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('nav button')].find((b) => b.textContent?.trim() === t)
    if (!btn) return false
    btn.click()
    return true
  }, label)
  if (!clicked) {
    console.log(`탭 없음: ${label}`)
    continue
  }
  await new Promise((r) => setTimeout(r, 1200))
  await page.screenshot({ path: join(OUT, `${label}.png`) })
}

if (errors.length) {
  console.log('\n콘솔 에러:')
  for (const e of errors.slice(0, 10)) console.log('  ' + e)
} else {
  console.log('\n콘솔 에러 없음')
}

await browser.close()
