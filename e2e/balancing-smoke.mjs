// 수동 밸런싱 모달 스모크 (로컬 모드) — 사전: VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5199
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.E2E_BASE ?? 'http://localhost:5199'
const OUT = 'e2e/shots/balancing/'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
let n = 0
const shot = (name) => page.screenshot({ path: `${OUT}${String(++n).padStart(2, '0')}-${name}.png` })
const step = async (name, fn) => { await fn(); console.log(`  ✓ ${name}`) }
const dlg = page.getByRole('dialog')

await step('대시보드 로드 (로컬 모드) → 데일리 게임 밸런싱 열기', async () => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.getByText('진행 중인 게임').first().waitFor()
  assert.ok(await page.getByText('로컬 모드').first().isVisible())
  const card = page.getByRole('heading', { name: '데일리 게임' }).locator('xpath=ancestor::*[.//button[contains(., "밸런싱")]][1]')
  await card.getByRole('button', { name: '밸런싱' }).click()
  await dlg.waitFor()
  await dlg.getByText('테이블 밸런싱').waitFor()
  assert.ok(await dlg.getByText(/TABLE 2\(3명\)이 TABLE .*보다 3명 많습니다/).isVisible())
  await shot('modal-open')
})

await step('플레이어 선택 → 빈 좌석 탭 → 이동, 이력 1건', async () => {
  const t2p1 = dlg.getByRole('button', { name: /^TABLE 2 1번 (?!빈 좌석)/ })
  const who = (await t2p1.textContent()).replace(/^\d+/, '').trim()
  await t2p1.click()
  await dlg.getByText(new RegExp(`${who}.*선택 중`)).waitFor()
  await shot('selected')
  await dlg.getByRole('button', { name: 'TABLE 1 1번 빈 좌석' }).click()
  await dlg.getByRole('button', { name: `TABLE 1 1번 ${who}` }).waitFor()
  assert.ok(await dlg.getByRole('button', { name: 'TABLE 2 1번 빈 좌석' }).isVisible())
  await dlg.getByRole('button', { name: /이동 이력 1건/ }).click()
  await dlg.getByText('T2-1 → T1-1').waitFor()
  await shot('moved')
})

await step('사용 중 좌석은 이동 대상이 아님 (다른 플레이어 선택으로 전환)', async () => {
  await dlg.getByRole('button', { name: `TABLE 1 1번 ${'' }` }).first().click().catch(() => {})
  const a = dlg.getByRole('button', { name: /^TABLE 2 3번 (?!빈 좌석)/ })
  await a.click()
  const b = dlg.getByRole('button', { name: /^TABLE 2 5번 (?!빈 좌석)/ })
  await b.click() // 사용 중 좌석 클릭 → 그 사람이 선택됨
  assert.equal(await b.getAttribute('aria-pressed'), 'true')
  assert.equal(await a.getAttribute('aria-pressed'), 'false')
  await b.click() // 다시 클릭 → 선택 해제
  assert.equal(await b.getAttribute('aria-pressed'), 'false')
})

await step('빈 테이블(TABLE 3) 해체 → 즉시 목록에서 제거', async () => {
  const t3 = dlg.getByText('TABLE 3', { exact: true }).locator('xpath=ancestor::div[.//button[contains(., "테이블 해체")]][1]')
  await t3.getByRole('button', { name: '테이블 해체' }).click()
  await dlg.getByText('TABLE 3', { exact: true }).waitFor({ state: 'detached' })
  await shot('table3-removed')
})

await step('플레이어 있는 TABLE 1 해체 → 무작위 배정 → 이력에 해체 표시, 테이블 제거', async () => {
  const t1 = dlg.getByText('TABLE 1', { exact: true }).locator('xpath=ancestor::div[.//button[contains(., "테이블 해체")]][1]')
  await t1.getByRole('button', { name: '테이블 해체' }).click()
  await dlg.getByText('TABLE 1 해체 중').waitFor()
  await shot('breaking')
  await dlg.getByRole('button', { name: '무작위 배정' }).click()
  await dlg.getByText('TABLE 1', { exact: true }).waitFor({ state: 'detached' })
  await dlg.getByText('TABLE 1 해체 중').waitFor({ state: 'detached' })
  await dlg.getByRole('button', { name: /이동 이력 2건/ }).waitFor()
  assert.ok(await dlg.getByText('해체', { exact: true }).first().isVisible())
  const t2count = await dlg.getByText(/^3\/\d+명$/).first().textContent()
  console.log(`    TABLE 2 ${t2count}`)
  await shot('after-break')
})

await step('마지막 테이블은 해체 버튼 없음, 새로고침 후 이력 유지(localStorage)', async () => {
  assert.equal(await dlg.getByRole('button', { name: '테이블 해체' }).count(), 0)
  await page.reload({ waitUntil: 'networkidle' })
  const card = page.getByRole('heading', { name: '데일리 게임' }).locator('xpath=ancestor::*[.//button[contains(., "밸런싱")]][1]')
  await card.getByRole('button', { name: '밸런싱' }).click()
  await dlg.waitFor()
  await dlg.getByRole('button', { name: /이동 이력 2건/ }).waitFor()
  assert.ok(await page.getByText('📍 TABLE 2').first().isVisible())
})

await step('게임 상세 좌석 이동 모달: 사용 중 좌석 disabled, 이동 성공', async () => {
  await page.keyboard.press('Escape')
  await page.goto(BASE + '/game/' + (await page.evaluate(() => JSON.parse(localStorage.getItem('allinone-store-v1')).state.games.find((g) => g.name === '데일리 게임').id)), { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '좌석 이동' }).first().click()
  await dlg.waitFor()
  const opts = await dlg.locator('select').last().locator('option[disabled]').count()
  assert.ok(opts >= 2, `disabled options: ${opts}`)
  await dlg.locator('select').last().selectOption('9')
  await dlg.getByRole('button', { name: '이동', exact: true }).click()
  await dlg.waitFor({ state: 'detached' })
  assert.ok(await page.getByText('TABLE 2 - 9').first().isVisible())
  await shot('detail-moved')
})

await browser.close()
if (errors.length) { console.error('브라우저 오류:\n' + errors.join('\n')); process.exit(1) }
console.log('밸런싱 스모크 통과')
