// 폰 폭(390px) 콘솔 점검 — 가로 넘침 검사 + 스크린샷(e2e/shots/mobile). 사전: VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5199
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const BASE = process.env.E2E_BASE ?? 'http://localhost:5199'
const OUT = 'e2e/shots/mobile/'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR' })
const page = await ctx.newPage()
const overflow = async (label) => {
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth
    const bad = []
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect()
      if (b.width > 0 && b.right > w + 1 && getComputedStyle(el).position !== 'fixed') {
        bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} right=${Math.round(b.right)}`)
      }
    }
    return { sw: document.documentElement.scrollWidth, w, bad: bad.slice(0, 6) }
  })
  console.log(`${label}: scrollWidth ${r.sw}/${r.w}${r.bad.length ? '\n   넘침: ' + r.bad.join(' | ') : ''}`)
}
let n = 0
const shot = async (name) => { await page.screenshot({ path: `${OUT}${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true }); await overflow(name) }

await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.getByText('진행 중인 게임').first().waitFor()
await shot('dashboard')
const gid = await page.evaluate(() => JSON.parse(localStorage.getItem('allinone-store-v1')).state.games.find((g) => g.name === '데일리 게임').id)
await page.goto(BASE + '/game/' + gid, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '좌석 배치도' }).waitFor()
await shot('game-detail')
await page.getByRole('button', { name: '좌석 배치도' }).click()
await page.getByRole('dialog').waitFor()
await page.waitForTimeout(400)
await shot('seat-map')
await page.keyboard.press('Escape')
await page.getByRole('button', { name: '좌석 이동' }).first().click()
await page.getByRole('dialog').waitFor()
await page.waitForTimeout(400)
await shot('seat-map-selected')
await page.keyboard.press('Escape')
for (const [path, name] of [['/points', 'points'], ['/ranking', 'ranking'], ['/admin', 'admin']]) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await shot(name)
}
await browser.close()
