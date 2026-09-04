// 실서버 E2E — 사전: .env.local 키로 vite 실행, 환경변수 SUPABASE_ACCESS_TOKEN(관리 API, 검증 쿼리용) E2E_OWNER_EMAIL/E2E_OWNER_PW
// 주의: 데이터를 초기화(reset_store)하고 테스트 계정을 만든다. 운영 DB에서 실행하지 말 것.
// 실제 Supabase 프로젝트 대상 E2E — 대표 개설 → 데모 시드 → 회원가입 → 포인트 지급 → 셀프 바인 → 리바인 →
// 탈락/리엔트리 → 딜러 권한 → 전광판/공개 랭킹 → 로그아웃
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
import { readFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5199'
const REF = process.env.SUPABASE_PROJECT_REF ?? 'lhjyuvuitfqbbpgbesth'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? readFileSync(process.env.HOME + '/.supabase/access-token', 'utf8').trim()
const OUT = 'e2e/shots/live/'
mkdirSync(OUT, { recursive: true })

const stamp = Date.now().toString(36)
const OWNER = { email: process.env.E2E_OWNER_EMAIL ?? 'owner@holdem-allinone.com', pw: process.env.E2E_OWNER_PW ?? 'Allin1-Owner!2026', name: '대표', store: '강남 1호점' }
const TESTER = { email: `tester-${stamp}@holdem-allinone.com`, pw: 'Tester!2026', nick: `테스터${stamp.slice(-3)}`, phone: '010-7777-1234' }
const DEALER = { email: `dealer-${stamp}@holdem-allinone.com`, pw: 'Dealer!2026', name: '딜러A' }

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  })
  return r.json()
}
const until = async (fn, msg, ms = 20000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await fn()) return
    await new Promise((r) => setTimeout(r, 400))
  }
  assert.fail(`timeout: ${msg}`)
}
const step = async (name, fn) => { await fn(); console.log(`  ✓ ${name}`) }

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const mk = async (name, viewport) => {
  const ctx = await browser.newContext({ viewport, locale: 'ko-KR' })
  const page = await ctx.newPage()
  page._errs = []
  page.on('pageerror', (e) => page._errs.push(`${name} pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|pretendard|fonts/i.test(m.text())) page._errs.push(`${name} console: ${m.text()}`) })
  page.shot = (n) => page.screenshot({ path: `${OUT}${name}-${n}.png` })
  return page
}
const owner = await mk('owner', { width: 1280, height: 900 })
const player = await mk('player', { width: 420, height: 860 })
const anon = await mk('anon', { width: 1280, height: 900 })
const dealer = await mk('dealer', { width: 1280, height: 900 })

console.log('대표·매장')
await step('매장 개설 (첫 직원 가입 → owner)', async () => {
  await owner.goto(BASE + '/', { waitUntil: 'networkidle' })
  const already = await owner.getByText('관리자 콘솔 로그인').isVisible().catch(() => false)
  if (already) {
    await owner.getByPlaceholder('staff@example.com').fill(OWNER.email)
    await owner.locator('input[type=password]').fill(OWNER.pw)
    await owner.getByRole('button', { name: '로그인' }).click()
  } else {
    await owner.getByText('매장 개설', { exact: true }).waitFor({ timeout: 20000 })
    await owner.getByPlaceholder('예: 강남 1호점').fill(OWNER.store)
    await owner.getByPlaceholder('예: 홍길동').fill(OWNER.name)
    await owner.getByPlaceholder('staff@example.com').fill(OWNER.email)
    await owner.locator('input[type=password]').fill(OWNER.pw)
    await owner.getByRole('button', { name: '매장 개설하고 시작' }).click()
  }
  await owner.getByText('진행 중인 게임').first().waitFor({ timeout: 30000 })
  await owner.getByText('클라우드 동기화').waitFor({ timeout: 20000 })
  assert.ok(await owner.getByText('(대표)').isVisible())
  await owner.shot('01-console')
})
const storeId = (await sql('select id from stores order by created_at limit 1'))[0].id
console.log('    store id', storeId)

await step('데모 데이터로 초기화 (RPC reset_store)', async () => {
  await owner.goto(BASE + '/admin', { waitUntil: 'networkidle' })
  await owner.getByRole('button', { name: '데모 데이터로 초기화' }).click()
  await owner.getByRole('dialog').getByRole('button', { name: '실행' }).click()
  await owner.getByText('초기화가 완료되었습니다').waitFor({ timeout: 30000 })
  await owner.getByText('에이스').first().waitFor()
  const cnt = (await sql(`select count(*)::int as n from members where store_id='${storeId}'`))[0].n
  assert.equal(cnt, 6)
  await owner.shot('02-admin-demo')
})

await step('현금 결제 → 포인트 전송 (사유 프리셋) → 원장·지갑 반영', async () => {
  await owner.goto(BASE + '/points', { waitUntil: 'networkidle' })
  await owner.getByRole('button', { name: '전송하기' }).first().click()
  const dlg = owner.getByRole('dialog')
  await dlg.locator('button:has-text("(0001)")').click()
  await dlg.getByPlaceholder('0').fill('5')
  await dlg.getByRole('button', { name: '현금 결제', exact: true }).click()
  await dlg.getByRole('button', { name: '전송', exact: true }).click()
  await dlg.waitFor({ state: 'detached', timeout: 20000 })
  await owner.locator('text=/포인트 −5P/').first().waitFor({ timeout: 20000 })
  const row = (await sql(`select reason, operator, amount from ledger where store_id='${storeId}' and reason='현금 결제' order by seq desc limit 1`))[0]
  assert.equal(row.operator, '대표')
  assert.equal(Number(row.amount), 5)
})

console.log('\n회원 (휴대폰)')
await step('QR 가입 페이지 → 회원가입 → /me (회원번호·지갑 생성)', async () => {
  await player.goto(`${BASE}/join?s=${storeId}`, { waitUntil: 'networkidle' })
  await player.getByPlaceholder('게임에서 쓸 이름').waitFor({ timeout: 20000 })
  await player.getByPlaceholder('게임에서 쓸 이름').fill(TESTER.nick)
  await player.getByPlaceholder('010-0000-0000').fill(TESTER.phone)
  await player.getByPlaceholder('you@example.com').fill(TESTER.email)
  await player.locator('input[type=password]').fill(TESTER.pw)
  await player.getByRole('button', { name: '가입하고 시작하기' }).click()
  await player.waitForURL(/\/me$/, { timeout: 30000 })
  await player.getByText(/회원번호 \d{4}/).waitFor({ timeout: 20000 })
  await player.getByText(TESTER.nick).first().waitFor()
  const m = (await sql(`select no, nickname, user_id is not null as linked from members where nickname='${TESTER.nick}'`))[0]
  assert.equal(m.no, '0007')
  assert.equal(m.linked, true)
  await player.shot('03-me-new')
})

await step('콘솔에 신규 회원 실시간 표시 + 카드 결제 3P 지급', async () => {
  await owner.goto(BASE + '/admin', { waitUntil: 'networkidle' })
  await owner.getByText(TESTER.nick).first().waitFor({ timeout: 20000 })
  await owner.goto(BASE + '/points', { waitUntil: 'networkidle' })
  await owner.getByRole('button', { name: '전송하기' }).first().click()
  const dlg = owner.getByRole('dialog')
  await dlg.getByPlaceholder('닉네임 혹은 번호').fill(TESTER.nick)
  await dlg.locator(`button:has-text("${TESTER.nick}")`).click()
  await dlg.getByPlaceholder('0').fill('3')
  await dlg.getByRole('button', { name: '카드 결제', exact: true }).click()
  await dlg.getByRole('button', { name: '전송', exact: true }).click()
  await dlg.waitFor({ state: 'detached', timeout: 20000 })
})

await step('회원 화면에 잔액 3P 실시간 반영', async () => {
  await until(async () => (await player.locator('body').innerText()).includes('3P'), '3P on /me')
  await player.shot('04-me-3p')
})

await step('좌석 QR 체크인 (T1-5) → 콘솔 대기자 명단 착석 탭에 표시', async () => {
  await player.goto(BASE + '/checkin?table=1&seat=5', { waitUntil: 'networkidle' })
  await player.getByText('체크인 완료').waitFor({ timeout: 20000 })
  await player.getByText('TABLE 1 · 5번 좌석').waitFor()
  const w = (await sql(`select w.status, w.table_no, w.seat, w.source from waitlist w join members m on m.id = w.member_id where m.nickname = '${TESTER.nick}' and w.status = 'seated'`))[0]
  assert.equal(w.source, 'qr'); assert.equal(w.table_no, 1); assert.equal(w.seat, 5)
  await owner.goto(BASE + '/', { waitUntil: 'networkidle' })
  await until(async () => /착석 1/.test(await owner.locator('body').innerText()), 'seated count on console')
  await owner.getByRole('button', { name: '명단' }).click()
  const dlg = owner.getByRole('dialog').first()
  await dlg.getByRole('button', { name: /착석 1/ }).click()
  await dlg.getByText('TABLE 1 · 5번 좌석').waitFor({ timeout: 20000 })
  await owner.shot('05a-waitlist-seated')
  await owner.keyboard.press('Escape')
})

let gameId
await step('진행 중 게임 → 셀프 바인 (포인트 1P) → 체크인한 좌석 T1-5로 배정', async () => {
  await player.goto(BASE + '/me', { waitUntil: 'networkidle' })
  await player.getByText('데일리 게임').first().click()
  await player.waitForURL(/\/g\//, { timeout: 20000 })
  const btn = player.getByRole('button', { name: /로 바인하기/ })
  await btn.waitFor({ timeout: 20000 })
  await btn.click()
  await player.getByText('바인 완료').waitFor({ timeout: 20000 })
  const seat = await player.locator('text=/TABLE \\d+ · \\d+번 좌석/').textContent()
  console.log('    ', seat)
  assert.match(seat ?? '', /TABLE 1 · 5번 좌석/)
  await player.shot('05-buyin-ok')
  gameId = (await sql(`select id from games where store_id='${storeId}' and status<>'ended' order by created_at desc limit 1`))[0].id
  const e = (await sql(`select ge.table_no, ge.seat, ge.status from game_entries ge join members m on m.id=ge.member_id where ge.game_id='${gameId}' and m.nickname='${TESTER.nick}'`))[0]
  assert.equal(e.status, 'playing')
  const l = (await sql(`select operator, reason from ledger where store_id='${storeId}' and reason like '데일리 게임 바인' order by seq desc limit 1`))[0]
  assert.equal(l.operator, '셀프 바인')
})

await step('콘솔 게임 카드 인원 실시간 증가 (3 → 4)', async () => {
  await owner.goto(BASE + '/', { waitUntil: 'networkidle' })
  await until(async () => /👥 4\//.test(await owner.locator('body').innerText()), 'players 4 on console')
  await owner.shot('06-console-4players')
})

await step('셀프 리바인 2회 (잔액 2 → 0) → 3회차 규칙 없음 안내', async () => {
  await player.getByRole('button', { name: '닫기' }).click()
  for (let i = 0; i < 2; i++) {
    const btn = player.getByRole('button', { name: /로 리바인하기/ })
    await btn.waitFor({ timeout: 20000 })
    await btn.click()
    await player.getByText('리바인 완료').waitFor({ timeout: 20000 })
    await player.getByRole('button', { name: '닫기' }).click()
  }
  await player.getByText('규칙이 없습니다').waitFor({ timeout: 20000 })
  const bal = (await sql(`select w.balance from wallets w join members m on m.id::text=w.owner where m.nickname='${TESTER.nick}' and w.currency='P'`))[0]
  assert.equal(Number(bal.balance), 0)
})

await step('콘솔에서 탈락 처리 → 회원 화면 탈락 표시, 잔액 부족으로 리엔트리 불가', async () => {
  await owner.goto(`${BASE}/game/${gameId}`, { waitUntil: 'networkidle' })
  // 플레이어 리스트 행: <Card class="card ... flex"> 안에 닉네임 + 탈락 버튼
  const row = owner.locator('.card', { hasText: TESTER.nick }).filter({ has: owner.getByRole('button', { name: '탈락' }) }).last()
  await row.getByRole('button', { name: '탈락' }).click()
  await until(async () => /탈락/.test(await player.locator('body').innerText()), 'eliminated badge on player')
  await player.getByText('잔액이 부족합니다').waitFor({ timeout: 20000 })
})

await step('1P 재충전 → 리엔트리 성공', async () => {
  await sql(`select 1`) // no-op
  await owner.goto(BASE + '/points', { waitUntil: 'networkidle' })
  await owner.getByRole('button', { name: '전송하기' }).first().click()
  const dlg = owner.getByRole('dialog')
  await dlg.getByPlaceholder('닉네임 혹은 번호').fill(TESTER.nick)
  await dlg.locator(`button:has-text("${TESTER.nick}")`).click()
  await dlg.getByPlaceholder('0').fill('1')
  await dlg.getByRole('button', { name: '전송', exact: true }).click()
  await dlg.waitFor({ state: 'detached', timeout: 20000 })
  const btn = player.getByRole('button', { name: /로 리엔트리하기/ })
  await until(async () => (await btn.isEnabled().catch(() => false)), 're-entry enabled')
  await btn.click()
  await player.getByText('리엔트리 완료').waitFor({ timeout: 20000 })
  await player.shot('07-reentry')
})

console.log('\n익명 (전광판·공개 랭킹)')
await step('전광판: 로그인 없이 렌더 + 셀프 바인 QR', async () => {
  await anon.goto(`${BASE}/display/${gameId}`, { waitUntil: 'networkidle' })
  await anon.getByText('PLAYERS').waitFor({ timeout: 20000 })
  await anon.getByText('스캔하고 포인트로 바인').waitFor()
  await anon.shot('08-display')
})
await step('공개 랭킹: 닉네임 마스킹 + RP', async () => {
  await anon.goto(BASE + '/rank', { waitUntil: 'networkidle' })
  await anon.getByText('랭킹').first().waitFor({ timeout: 20000 })
  await anon.locator('text=/에\\*스/').waitFor()
})

console.log('\n직원 역할')
await step('대표가 딜러 초대 → 딜러 가입 → 콘솔 (딜러) → 전송 가능·초기화 거부', async () => {
  await owner.goto(BASE + '/admin', { waitUntil: 'networkidle' })
  await owner.getByRole('button', { name: '직원 초대' }).click()
  const dlg = owner.getByRole('dialog')
  await dlg.getByPlaceholder('staff@example.com').fill(DEALER.email)
  await dlg.getByPlaceholder('예: 매니저2').fill(DEALER.name)
  await dlg.locator('select').selectOption('dealer')
  await dlg.getByRole('button', { name: '저장' }).click()
  await dlg.waitFor({ state: 'detached', timeout: 20000 })
  await owner.getByText('초대 대기').waitFor({ timeout: 20000 })

  await dealer.goto(BASE + '/', { waitUntil: 'networkidle' })
  await dealer.getByText('초대받은 직원이에요').click()
  await dealer.getByPlaceholder('예: 홍길동').fill(DEALER.name)
  await dealer.getByPlaceholder('staff@example.com').fill(DEALER.email)
  await dealer.locator('input[type=password]').fill(DEALER.pw)
  await dealer.getByRole('button', { name: '가입', exact: true }).click()
  await dealer.getByText('진행 중인 게임').first().waitFor({ timeout: 30000 })
  assert.ok(await dealer.getByText('(딜러)').isVisible())

  await until(async () => /로그인 연결됨/.test(await owner.locator('body').innerText()), 'staff linked badge on owner console')

  await dealer.goto(BASE + '/points', { waitUntil: 'networkidle' })
  await dealer.getByRole('button', { name: '전송하기' }).first().click()
  const d2 = dealer.getByRole('dialog')
  await d2.locator('button:has-text("(0001)")').click()
  await d2.getByPlaceholder('0').fill('1')
  await d2.getByRole('button', { name: '전송', exact: true }).click()
  await d2.waitFor({ state: 'detached', timeout: 20000 }) // v2: 딜러도 재화 전송 가능
  await dealer.goto(BASE + '/admin', { waitUntil: 'networkidle' })
  await dealer.getByRole('button', { name: '빈 상태로 시작' }).click()
  await dealer.getByRole('dialog').getByRole('button', { name: '실행' }).click()
  await dealer.getByText('권한이 없습니다').waitFor({ timeout: 20000 }) // 초기화는 대표 전용
  await dealer.shot('09-dealer-reset-denied')
})

await step('로그아웃 → 로그인 화면', async () => {
  await owner.goto(BASE + '/', { waitUntil: 'networkidle' })
  await owner.getByRole('button', { name: '로그아웃' }).click()
  await owner.getByText('관리자 콘솔 로그인').waitFor({ timeout: 20000 })
})

const errs = [owner, player, anon, dealer].flatMap((p) => p._errs).filter((e) => !/status of 4dd/.test(e)) // RPC 거부(4xx)는 정상
await browser.close()
if (errs.length) { console.log('\n브라우저 오류:'); errs.forEach((e) => console.log('  ' + e)) }
assert.equal(errs.length, 0, 'browser errors')
console.log('\n실서버 E2E 통과')
console.log(JSON.stringify({ owner: OWNER.email, tester: TESTER.email, dealer: DEALER.email, storeId, gameId }, null, 2))
