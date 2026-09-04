// 로컬 모드 스모크 — 사전: 키 없이 `npx vite --port 5199` 실행
// 로컬 모드 스모크 테스트 — 설치된 Chrome을 Playwright로 구동
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5199'
import { mkdirSync } from 'node:fs'
const OUT = 'e2e/shots/local/'
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

await step('콘솔 대시보드 로드 (로컬 모드)', async () => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.getByText('진행 중인 게임').first().waitFor()
  assert.ok(await page.getByText('로컬 모드').first().isVisible())
  assert.ok(await page.getByRole('heading', { name: '데일리 게임' }).isVisible())
  await shot('dashboard')
})

const before = await page.locator('text=/👥 \\d+\\/\\d+/').first().textContent()

await step('참가 등록 (비동기 액션) → 인원 증가', async () => {
  await page.getByRole('button', { name: '참가 등록' }).first().click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('dialog').locator('button:has-text("(000")').first().click()
  await page.getByRole('dialog').getByRole('button', { name: '등록' }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  const after = await page.locator('text=/👥 \\d+\\/\\d+/').first().textContent()
  assert.notEqual(before, after, `players unchanged: ${before} → ${after}`)
  console.log(`    ${before} → ${after}`)
})

await step('게임 셋 복제·게임 추가 모달', async () => {
  await page.getByRole('button', { name: '+ 게임 추가' }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByPlaceholder('예: 데일리 게임').fill('스모크 게임')
  await page.getByRole('dialog').locator('button:has-text("T4")').click()
  await page.getByRole('button', { name: '게임 시작', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  assert.ok(await page.getByRole('heading', { name: '스모크 게임' }).isVisible())
  await shot('game-created')
})

await step('포인트 전송 — 결제 수단 프리셋(현금 결제) → 원장 반영', async () => {
  await page.goto(BASE + '/points', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '전송하기' }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.waitFor()
  await dlg.locator('button:has-text("(0001)")').click()
  await dlg.getByPlaceholder('0').fill('7')
  await dlg.getByRole('button', { name: '현금 결제', exact: true }).click()
  await dlg.getByRole('button', { name: '전송', exact: true }).click()
  await dlg.waitFor({ state: 'detached' })
  await page.locator('text=/포인트 −7P/').first().waitFor()
  await page.locator('text=/포인트 −7P/').first().click()
  await page.getByText('현금 결제').first().waitFor()
  await shot('points-ledger')
})

await step('회원가입 QR 모달 (로컬: 공개 랭킹 링크 안내)', async () => {
  await page.getByRole('button', { name: '회원가입 QR' }).click()
  await page.getByRole('dialog').getByText('클라우드 모드를 켜면').waitFor()
  await page.keyboard.press('Escape')
})

await step('관리 탭: 매니저 역할·가입 QR·PIN 섹션(로컬)', async () => {
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' })
  await page.getByText('매니저 계정').first().waitFor()
  assert.ok(await page.getByText('잠금 설정').isVisible())
  await page.getByRole('button', { name: '생성하기' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder('예: manager2').fill('dealer1')
  await dlg.getByPlaceholder('예: 매니저2').fill('딜러A')
  await dlg.locator('select').selectOption('dealer')
  await dlg.getByRole('button', { name: '저장' }).click()
  await dlg.waitFor({ state: 'detached' })
  await page.getByText('딜러A').waitFor()
  assert.ok(await page.getByText('딜러', { exact: true }).first().isVisible())
  await shot('admin')
})

await step('회원 상세 → RP 전송(비동기) 반영', async () => {
  await page.locator('tr:has-text("에이스")').first().click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: 'RP 전송하기' }).click()
  const dlgs = page.getByRole('dialog')
  const rp = dlgs.last()
  await rp.getByPlaceholder('0').fill('50')
  await rp.getByPlaceholder('예: 이벤트 보너스').fill('스모크 보너스')
  await rp.getByRole('button', { name: '전송', exact: true }).click()
  await page.getByText('+50RP').waitFor()
  await page.keyboard.press('Escape')
})

const gameId = await page.evaluate(() => {
  const raw = localStorage.getItem('allinone-store-v1')
  const st = JSON.parse(raw).state
  return st.games.find((g) => g.name === '데일리 게임').id
})

await step('전광판 렌더 (로컬: 랭킹 QR)', async () => {
  await page.goto(`${BASE}/display/${gameId}`, { waitUntil: 'networkidle' })
  await page.getByText('PLAYERS').waitFor()
  await page.getByText('스캔하고 랭킹 확인').waitFor()
  await shot('display')
})

await step('공개 랭킹', async () => {
  await page.goto(BASE + '/rank', { waitUntil: 'networkidle' })
  await page.getByText('랭킹').first().waitFor()
  await page.locator('text=/\\d+RP|RP/').first().waitFor()
})

await step('플레이어 페이지 — 로컬 모드 안내', async () => {
  for (const p of ['/join', '/me', '/g/abc']) {
    await page.goto(BASE + p, { waitUntil: 'networkidle' })
    await page.getByText('클라우드 모드에서만').waitFor()
  }
  await shot('join-local-notice')
})

await step('대기자 명단: 비회원 추가 → 호출 → 착석 → 착석 탭 표시', async () => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '명단' }).click()
  const dlg = page.getByRole('dialog').first()
  await dlg.getByRole('button', { name: '+ 대기 추가' }).click()
  const add = page.getByRole('dialog').last()
  await add.getByRole('button', { name: '비회원' }).click()
  await add.getByPlaceholder('예: 김OO 2명').fill('스모크 손님')
  await add.getByRole('button', { name: '추가', exact: true }).click()
  await dlg.getByText('스모크 손님').first().waitFor()
  // 행 = '스모크 손님' 텍스트와 노쇼 버튼(대기·호출 상태 공통)을 함께 가진 가장 안쪽 div
  const row = () => dlg.locator('div', { hasText: '스모크 손님' }).filter({ has: page.getByRole('button', { name: '노쇼' }) }).last()
  await row().getByRole('button', { name: '호출' }).click()
  await dlg.getByText('호출됨').first().waitFor()
  await row().getByRole('button', { name: '착석' }).click()
  const seat = page.getByRole('dialog').last()
  await seat.getByRole('button', { name: '착석 처리' }).click()
  await dlg.getByRole('button', { name: /착석 1/ }).click()
  await dlg.getByText('TABLE 1 · 1번 좌석').waitFor()
  await page.keyboard.press('Escape')
  await page.getByText('착석 1').waitFor()
})

await step('조회 기간 선택 UI (게임 기록·거래내역)', async () => {
  await page.getByRole('button', { name: '오늘', exact: true }).first().click() // 시드 종료 게임은 8일 전 → 비어야 함
  await page.getByText('게임 기록이 없습니다').waitFor()
  await page.getByRole('button', { name: '30일', exact: true }).first().click()
  await page.getByText('베이직').first().waitFor()
  await page.goto(BASE + '/points', { waitUntil: 'networkidle' })
  await page.getByText(/\d+건/).first().waitFor()
})

await step('작업 이력 섹션 (로컬: 안내 문구)', async () => {
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' })
  await page.getByText('작업 이력').first().waitFor()
  await page.getByText('클라우드 모드에서 서버가 자동으로 기록').waitFor()
})

await step('새로고침 후 데이터 유지 (persist v4 마이그레이션 포함)', async () => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  assert.ok(await page.getByRole('heading', { name: '스모크 게임' }).isVisible())
})

const real = errors.filter((e) => !/favicon|pretendard|net::ERR|fonts/i.test(e))
if (real.length) {
  console.log('\n브라우저 오류:')
  for (const e of real) console.log('  ' + e)
}
await browser.close()
assert.equal(real.length, 0, 'browser errors present')
console.log('\n로컬 모드 스모크 통과')
