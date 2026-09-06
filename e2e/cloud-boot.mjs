// 클라우드 모드 부팅 스모크 — 사전: 닿지 않는 키로 vite 실행 (VITE_SUPABASE_URL=https://invalid.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5198)
// 클라우드 모드 부팅 경로 — Supabase에 닿지 않는 상태에서 게이트·오류 처리가 크래시 없이 렌더되는지
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5198'
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: 'ko-KR' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
import { mkdirSync } from 'node:fs'
const OUT = 'e2e/shots/cloud-boot/'
mkdirSync(OUT, { recursive: true })
const step = async (name, fn) => { await fn(); console.log(`  ✓ ${name}`) }

await step('콘솔 → 직원 로그인 화면 (매장 조회 실패 시 로그인 폼으로 폴백)', async () => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.getByText('관리자 콘솔 로그인').waitFor({ timeout: 20000 })
  await page.getByText('초대받은 직원이에요').waitFor()
  await page.screenshot({ path: `${OUT}c1-staff-login.png` })
})

await step('로그인 시도 → 네트워크 오류 메시지 (크래시 없음)', async () => {
  await page.getByPlaceholder('staff@example.com').fill('a@b.com')
  await page.locator('input[type=password]').fill('secret1')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.locator('text=/서버에 연결할 수 없습니다|올바르지 않습니다|fetch/i').first().waitFor({ timeout: 20000 })
})

await step('직원 가입 폼 전환', async () => {
  await page.getByText('초대받은 직원이에요').click()
  await page.getByText('직원 가입').first().waitFor()
  await page.getByPlaceholder('예: 홍길동').waitFor()
})

await step('/join → 회원가입 폼 (매장명 조회 실패해도 폼 표시)', async () => {
  await page.goto(BASE + '/join?s=abc&r=/g/xyz', { waitUntil: 'networkidle' })
  await page.getByText('회원가입', { exact: true }).first().waitFor({ timeout: 20000 })
  await page.getByPlaceholder('게임에서 쓸 이름').waitFor()
  await page.getByPlaceholder('010-0000-0000').waitFor()
  await page.screenshot({ path: `${OUT}c2-join.png` })
})

await step('/g/:code → 게임 조회 실패 안내', async () => {
  await page.goto(BASE + '/g/abcdef1234', { waitUntil: 'networkidle' })
  await page.locator('text=/게임 정보를 불러오지 못했습니다|게임을 찾을 수 없습니다/').waitFor({ timeout: 20000 })
})

await step('/me → 미로그인 시 /join으로 리다이렉트', async () => {
  await page.goto(BASE + '/me', { waitUntil: 'networkidle' })
  await page.waitForURL((u) => u.pathname.endsWith('/join') && u.search.includes('r='), { timeout: 20000 })
})

await step('/display/x → 공개 스코프 로드 실패 안내', async () => {
  await page.goto(BASE + '/display/abc', { waitUntil: 'networkidle' })
  await page.getByText('데이터를 불러오지 못했습니다').waitFor({ timeout: 20000 })
})

await step('/live → 공개 스코프 로드 실패 안내', async () => {
  await page.goto(BASE + '/live', { waitUntil: 'networkidle' })
  await page.getByText('데이터를 불러오지 못했습니다').waitFor({ timeout: 20000 })
})

await step('/reset → 재설정 메일 폼, /checkin → 미로그인 시 /join 리다이렉트', async () => {
  await page.goto(BASE + '/reset', { waitUntil: 'networkidle' })
  await page.getByText('비밀번호 재설정').first().waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: '재설정 메일 보내기' }).waitFor()
  await page.goto(BASE + '/checkin?table=1&seat=3', { waitUntil: 'networkidle' })
  await page.waitForURL((u) => u.pathname.endsWith('/join') && u.search.includes('table=1'), { timeout: 20000 })
  await page.getByText('TABLE 1 · 3번 좌석 QR').waitFor({ timeout: 20000 })
})

await step('/rank → 공개 스코프 로드 실패 안내', async () => {
  await page.goto(BASE + '/rank', { waitUntil: 'networkidle' })
  await page.getByText('데이터를 불러오지 못했습니다').waitFor({ timeout: 20000 })
})

await browser.close()
if (errors.length) { console.log('페이지 오류:', errors) }
assert.equal(errors.length, 0)
console.log('\n클라우드 모드 부팅 스모크 통과')
