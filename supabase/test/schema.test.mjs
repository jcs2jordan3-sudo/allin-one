// schema.sql 검증 — PGlite(WASM Postgres)로 Supabase 없이 실행
//   npm run db:test
// Supabase 전용 요소(auth 스키마, anon/authenticated 역할, supabase_realtime publication)는 스텁으로 대체.

import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(join(here, '..', 'schema.sql'), 'utf8')
  .replace(/^create extension if not exists pgcrypto;$/m, '-- (pgcrypto: PGlite 테스트에서는 생략)')

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => (await q(sql, params))[0]
const fails = async (fn, needle) => {
  try {
    await fn()
  } catch (e) {
    assert.match(String(e.message), needle, `expected error matching ${needle}, got: ${e.message}`)
    return
  }
  assert.fail(`expected failure matching ${needle}`)
}
const as = (uid) => q(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
let passed = 0
const test = async (name, fn) => {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// ── Supabase 환경 스텁 ──────────────────────────────────────────────────
await db.exec(`
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb,
    created_at timestamptz default now()
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  create publication supabase_realtime;
`)

console.log('schema.sql 적용')
await db.exec(schema)
console.log('schema.sql 재적용 (idempotent)')
await db.exec(schema)

const signup = async (email, meta) => {
  const r = await one(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta])
  return r.id
}

console.log('\n온보딩')
const ownerUid = await signup('owner@test.com', { kind: 'staff' })
await test('초대 없는 콘솔 가입은 회원을 만들지 않음', async () => {
  assert.equal((await q('select * from members')).length, 0)
})
await as(ownerUid)
const storeId = (await one(`select bootstrap_store('강남 1호점', '대표') as id`)).id
await test('매장 개설 → 직원(owner)·지갑·콘솔 상태·기본 게임 셋 생성', async () => {
  const s = await one('select * from staff where user_id = $1', [ownerUid])
  assert.equal(s.role, 'owner')
  assert.equal(s.store_id, storeId)
  assert.equal((await q(`select * from wallets where store_id = $1 and owner = 'store'`, [storeId])).length, 3)
  assert.ok(await one('select * from console_state where store_id = $1', [storeId]))
  assert.equal((await q('select * from game_sets where store_id = $1', [storeId])).length, 1)
  const role = (await one('select my_role() as r')).r
  assert.equal(role.kind, 'staff')
  assert.equal(role.role, 'owner')
})
await test('두 번째 개설은 거부', async () => {
  await fails(() => q(`select bootstrap_store('x')`), /이미 개설된 매장/)
})

console.log('\n재화·원장')
const m1 = (await one(`select create_member('에이스', '😎', '#E9BB56', '010-1111-2222') as id`)).id
await test('회원 생성 → 회원번호 0001 + 지갑 3종', async () => {
  const m = await one('select * from members where id = $1', [m1])
  assert.equal(m.no, '0001')
  assert.equal((await q('select * from wallets where owner = $1', [m1])).length, 3)
})
await test('본사 발행 → 지점 전송(현금 결제) → 잔액·원장 정합', async () => {
  await q(`select issue_to_store('P', 1000, '초기 발행')`)
  await q(`select transfer_to_member($1, 'P', 100, '현금 결제 충전')`, [m1])
  assert.equal((await one(`select balance from wallets where owner = 'store' and currency = 'P'`)).balance, 900)
  assert.equal((await one(`select balance from wallets where owner = $1 and currency = 'P'`, [m1])).balance, 100)
  const rows = await q('select * from ledger order by seq')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].from_owner, 'hq')
  assert.equal(rows[0].store_balance_after, 1000)
  assert.equal(rows[1].to_owner, m1)
  assert.equal(rows[1].store_balance_after, 900)
  assert.equal(rows[1].operator, '대표')
})
await test('멱등: 같은 request_id 전송 2회 → 원장 1건', async () => {
  const a = (await one(`select transfer_to_member($1, 'P', 10, '중복 테스트', null, 'req-1') as id`, [m1])).id
  const b = (await one(`select transfer_to_member($1, 'P', 10, '중복 테스트', null, 'req-1') as id`, [m1])).id
  assert.equal(a, b)
  assert.equal((await q(`select * from ledger where request_id = 'req-1'`)).length, 1)
  assert.equal((await one(`select balance from wallets where owner = $1 and currency = 'P'`, [m1])).balance, 110)
})
await test('잔액 초과 환수 거부 · 사유 없는 환수 거부', async () => {
  await fails(() => q(`select reclaim_from_member($1, 'P', 999, '테스트')`, [m1]), /잔액이 부족/)
  await fails(() => q(`select reclaim_from_member($1, 'P', 1, '')`, [m1]), /사유/)
  await fails(() => q(`select transfer_to_member($1, 'P', 0, 'x')`, [m1]), /1 이상/)
})
await test('원장 수정·삭제 차단', async () => {
  await fails(() => q(`update ledger set amount = 5`), /수정·삭제할 수 없습니다/)
  await fails(() => q(`delete from ledger`), /수정·삭제할 수 없습니다/)
})

console.log('\n앱 가입 (QR)')
const p1Uid = await signup('p1@test.com', { kind: 'member', nickname: '플레이어1', phone: '010-3333-4444', store_id: storeId, emoji: '🦈', color: '#57B6F2' })
const p1 = (await one('select * from members where user_id = $1', [p1Uid]))
await test('회원 가입 → 회원 행(0002)·지갑 생성, my_role = member', async () => {
  assert.equal(p1.no, '0002')
  assert.equal(p1.nickname, '플레이어1')
  assert.equal((await q('select * from wallets where owner = $1', [p1.id])).length, 3)
  await as(p1Uid)
  const role = (await one('select my_role() as r')).r
  assert.equal(role.kind, 'member')
  assert.equal(role.memberId, p1.id)
  await as(ownerUid)
})
await test('직원이 미리 등록한 회원은 전화번호로 연결 (신규 생성 안 함)', async () => {
  const pre = (await one(`select create_member('미리등록', '🐯', '#F2A65A', '010-5555-6666') as id`)).id
  const before = (await q('select * from members')).length
  const uid = await signup('pre@test.com', { kind: 'member', nickname: '나중가입', phone: '01055556666' })
  assert.equal((await q('select * from members')).length, before)
  const m = await one('select * from members where id = $1', [pre])
  assert.equal(m.user_id, uid)
  assert.equal(m.nickname, '나중가입')
})
await test('store_id 없이 가입해도 첫 매장에 귀속', async () => {
  const uid = await signup('nostore@test.com', { kind: 'member', nickname: '무지정' })
  const m = await one('select * from members where user_id = $1', [uid])
  assert.equal(m.store_id, storeId)
})

console.log('\n직원 초대')
await q(`insert into staff (store_id, email, name, role) values ($1, 'MGR@test.com', '매니저1', 'manager')`, [storeId])
const mgrUid = await signup('mgr@test.com', { kind: 'staff' })
await test('초대된 이메일로 가입 → staff 연결 (대소문자 무시)', async () => {
  const s = await one('select * from staff where user_id = $1', [mgrUid])
  assert.equal(s.name, '매니저1')
  assert.equal((await q('select * from members where user_id = $1', [mgrUid])).length, 0)
})
await test('가입이 초대보다 먼저면 claim_staff()로 연결', async () => {
  const uid = await signup('late@test.com', { kind: 'staff' })
  await as(uid)
  assert.equal((await one('select claim_staff() as ok')).ok, false)
  await as(ownerUid)
  await q(`insert into staff (store_id, email, name, role) values ($1, 'late@test.com', '늦은직원', 'dealer')`, [storeId])
  await as(uid)
  assert.equal((await one('select claim_staff() as ok')).ok, true)
  assert.equal((await one('select my_role() as r')).r.role, 'dealer')
  await as(ownerUid)
})

console.log('\n게임 운영')
const gsId = (await one('select id from game_sets where store_id = $1', [storeId])).id
const gameId = (await one(`select create_game('데일리 게임', $1, array[1,2], null, '오늘 1위 트로피') as id`, [gsId])).id
await test('게임 생성 → 스냅샷·join_code, 사용 중 테이블 재사용 거부', async () => {
  const g = await one('select * from games where id = $1', [gameId])
  assert.equal(g.snapshot.name, '데일리 스탠다드')
  assert.equal(g.snapshot.levels.length, 10)
  assert.equal(g.join_code.length, 10)
  assert.equal(g.notice, '오늘 1위 트로피')
  await fails(() => q(`select create_game('겹침', $1, array[2,3])`, [gsId]), /TABLE 2/)
})
await test('직원 참가 등록 → 좌석 배정·칩·얼리버드·참가비 차감', async () => {
  const r = (await one(`select game_buyin($1, $2, 'BUYIN', 'P', 'buy-1') as r`, [gameId, m1])).r
  assert.equal(r.type, 'BUYIN')
  assert.equal(r.chips, 20000)
  assert.equal(r.earlyBirdChips, 10000)
  assert.equal(r.table, 1)
  assert.equal(r.seat, 1)
  assert.equal((await one(`select balance from wallets where owner = $1 and currency = 'P'`, [m1])).balance, 109)
  const l = await one(`select * from ledger where request_id = 'buy-1'`)
  assert.equal(l.game_id, gameId)
  assert.equal(l.reason, '데일리 게임 바인')
})
await test('셀프 바인: 회원 본인이 전광판 QR로 → 자동 유형 판정·멱등·중복 차단', async () => {
  await q(`select transfer_to_member($1, 'P', 5, '카드 결제 충전')`, [p1.id])
  await as(p1Uid)
  const r = (await one(`select game_buyin($1, null, null, 'P', 'self-1') as r`, [gameId])).r
  assert.equal(r.type, 'BUYIN')
  assert.equal(r.table, 2) // 인원 최소 테이블
  assert.equal(r.seat, 1)
  const again = (await one(`select game_buyin($1, null, null, 'P', 'self-1') as r`, [gameId])).r
  assert.deepEqual(again.table, r.table)
  assert.equal((await one(`select balance from wallets where owner = $1 and currency = 'P'`, [p1.id])).balance, 4)
  await fails(() => q(`select game_buyin($1, null, 'BUYIN', 'P')`, [gameId]), /이미 참가한 회원/)
  await fails(() => q(`select game_buyin($1, $2, null, 'P')`, [gameId, m1]), /본인만/)
  const l = await one(`select * from ledger where request_id = 'self-1'`)
  assert.equal(l.operator, '셀프 바인')
})
await test('셀프 리바인(자동 유형) → 40,000칩, 얼리버드 없음', async () => {
  const r = (await one(`select game_buyin($1, null, null, 'P') as r`, [gameId])).r
  assert.equal(r.type, 'RE_BUYIN')
  assert.equal(r.round, 1)
  assert.equal(r.chips, 40000)
  assert.equal(r.earlyBirdChips, null)
})
await test('잔액 부족 셀프 바인 거부 (회원 닉네임 포함 메시지)', async () => {
  await q(`select game_buyin($1, null, null, 'P') as r`, [gameId]) // 2회차 리바인 (잔액 3 → 2)
  await fails(() => q(`select game_buyin($1, null, null, 'P')`, [gameId]), /리바인 규칙이 없습니다/) // 3회차 규칙 없음
  await as(ownerUid)
  await q(`select reclaim_from_member($1, 'P', 2, '테스트 회수')`, [p1.id])
  await as(p1Uid)
  await q(`select eliminate_entry($1, $2)`, [gameId, p1.id]).catch(() => {}) // 회원은 탈락 처리 불가
  await as(ownerUid)
  await q(`select eliminate_entry($1, $2)`, [gameId, p1.id])
  await as(p1Uid)
  await fails(() => q(`select game_buyin($1, null, null, 'P')`, [gameId]), /플레이어1님의 포인트 잔액이 부족/)
  await as(ownerUid)
})
await test('탈락 → 순위 기록 → 리엔트리로 복귀', async () => {
  const e = await one('select * from game_entries where game_id = $1 and member_id = $2', [gameId, p1.id])
  assert.equal(e.status, 'eliminated')
  assert.equal(e.rank, 2)
  await q(`select transfer_to_member($1, 'P', 1, '재충전')`, [p1.id])
  const r = (await one(`select game_buyin($1, $2, null, 'P') as r`, [gameId, p1.id])).r
  assert.equal(r.type, 'RE_ENTRY')
  const e2 = await one('select * from game_entries where game_id = $1 and member_id = $2', [gameId, p1.id])
  assert.equal(e2.status, 'playing')
  assert.equal(e2.rank, null)
})
await test('레지 마감 레벨 이동 → 바인 거부, 되돌리면 허용', async () => {
  await q(`select adjust_level($1, 5)`, [gameId])
  await fails(() => q(`select game_buyin($1, $2, 'RE_BUYIN', 'P')`, [gameId, m1]), /마감/)
  await q(`select adjust_level($1, 0)`, [gameId])
  const g = await one('select _game_elapsed_ms(games) as ms from games where id = $1', [gameId])
  assert.ok(Number(g.ms) < 5000, `elapsed after reset to level 0: ${g.ms}`)
})
await test('일시정지·재개 → 누적 정지 시간 반영', async () => {
  await q(`select pause_game($1)`, [gameId])
  assert.equal((await one('select status from games where id = $1', [gameId])).status, 'paused')
  await q(`select pg_sleep(0.05)`)
  await q(`select resume_game($1)`, [gameId])
  const g = await one('select status, paused_total_ms, paused_at from games where id = $1', [gameId])
  assert.equal(g.status, 'running')
  assert.ok(Number(g.paused_total_ms) >= 40, `paused_total_ms=${g.paused_total_ms}`)
  assert.equal(g.paused_at, null)
})
await test('칩 보정·애드온', async () => {
  await q(`select adjust_chips($1, 'addon', 5000)`, [gameId])
  await fails(() => q(`select adjust_chips($1, 'correction', -99999999)`, [gameId]), /음수/)
  await q(`select adjust_chips($1, 'correction', -1000)`, [gameId])
  const g = await one('select * from games where id = $1', [gameId])
  assert.equal(Number(g.addon_chips), 5000)
  assert.equal(Number(g.chip_correction), -1000)
})
await test('게임 종료 → 순위·프라이즈·RP 지급', async () => {
  const storeBefore = Number((await one(`select balance from wallets where owner = 'store' and currency = 'P'`)).balance)
  await q(`select end_game($1, array[$2::uuid, $3::uuid])`, [gameId, p1.id, m1])
  const ranks = await q('select member_id, rank from game_entries where game_id = $1 order by rank', [gameId])
  assert.equal(ranks[0].member_id, p1.id)
  assert.equal(ranks[0].rank, 1)
  assert.equal(ranks[1].rank, 2)
  assert.equal(Number((await one('select rp from members where id = $1', [p1.id])).rp), 1000)
  assert.equal(Number((await one('select rp from members where id = $1', [m1])).rp), 700)
  const storeAfter = Number((await one(`select balance from wallets where owner = 'store' and currency = 'P'`)).balance)
  assert.equal(storeBefore - storeAfter, 15) // 1위 10P + 2위 5P
  assert.equal((await one('select status from games where id = $1', [gameId])).status, 'ended')
})
await test('게임 취소 → 참가비 환불·프라이즈 회수·RP 역거래', async () => {
  const p1Before = Number((await one(`select balance from wallets where owner = $1 and currency = 'P'`, [p1.id])).balance)
  await q(`select cancel_game($1)`, [gameId])
  const g = await one('select * from games where id = $1', [gameId])
  assert.equal(g.cancelled, true)
  assert.equal(Number((await one('select rp from members where id = $1', [p1.id])).rp), 0)
  const p1After = Number((await one(`select balance from wallets where owner = $1 and currency = 'P'`, [p1.id])).balance)
  // p1: 바인 1 + 리바인 2 + 리엔트리 1 = 4 환불, 1위 프라이즈 10 회수 → -6
  assert.equal(p1After - p1Before, 4 - 10)
})

console.log('\n시즌·회원')
await test('시즌 정산 → 보상 지급 + RP 전원 리셋', async () => {
  await q(`select adjust_rp($1, 500, '이벤트 보너스')`, [m1])
  await q(`select settle_season($1, '시즌 1')`, [JSON.stringify([{ memberId: m1, amount: 50, rank: 1 }])])
  assert.equal(Number((await one('select rp from members where id = $1', [m1])).rp), 0)
  const l = await one(`select * from ledger where reason like '시즌 1 1위%'`)
  assert.equal(Number(l.amount), 50)
})
await test('RP 수동 조정: 사유 필수·음수 불가', async () => {
  await fails(() => q(`select adjust_rp($1, 100, '')`, [m1]), /사유/)
  await fails(() => q(`select adjust_rp($1, -100, '회수')`, [m1]), /RP가 부족/)
})
await test('회원 탈퇴 → 잔액 전액 환수, 원장 보존', async () => {
  const bal = Number((await one(`select balance from wallets where owner = $1 and currency = 'P'`, [m1])).balance)
  assert.ok(bal > 0)
  await q(`select leave_member($1)`, [m1])
  assert.equal(Number((await one(`select balance from wallets where owner = $1 and currency = 'P'`, [m1])).balance), 0)
  assert.equal((await one('select status from members where id = $1', [m1])).status, 'left')
  assert.ok((await q(`select * from ledger where from_owner = $1 and reason = '회원 탈퇴 잔액 환수'`, [m1])).length >= 1)
})
await test('회원 본인 프로필 수정', async () => {
  await as(p1Uid)
  await q(`select update_my_profile('새닉네임', '🔥', null, null)`)
  const m = await one('select * from members where id = $1', [p1.id])
  assert.equal(m.nickname, '새닉네임')
  assert.equal(m.emoji, '🔥')
  assert.equal(m.color, '#57B6F2')
  await as(ownerUid)
})

console.log('\n역할 권한')
await test('딜러는 재화 전송 불가, 참가 등록은 가능', async () => {
  const dealerUid = (await one(`select user_id from staff where email = 'late@test.com'`)).user_id
  await as(dealerUid)
  await fails(() => q(`select transfer_to_member($1, 'P', 1, 'x')`, [p1.id]), /권한이 없습니다/)
  const g2 = (await one(`select create_game('딜러 게임', $1, array[3]) as id`, [gsId])).id
  await q(`select transfer_to_member($1, 'P', 1, 'x')`, [p1.id]).catch(() => {})
  await as(ownerUid)
  await q(`select transfer_to_member($1, 'P', 3, '충전')`, [p1.id])
  await as(dealerUid)
  const r = (await one(`select game_buyin($1, $2, 'BUYIN', 'P') as r`, [g2, p1.id])).r
  assert.equal(r.type, 'BUYIN')
  await fails(() => q(`select cancel_game($1)`, [g2]), /권한이 없습니다/)
  await as(ownerUid)
  await q(`select end_game($1)`, [g2])
})

console.log('\nRLS (authenticated / anon 역할로 실제 쿼리)')
await test('회원은 본인 행·지갑·원장만 조회, 다른 회원 조회 불가', async () => {
  await q('set role authenticated')
  await as(p1Uid)
  const ms = await q('select id from members')
  assert.equal(ms.length, 1)
  assert.equal(ms[0].id, p1.id)
  assert.equal((await q('select * from wallets')).length, 3)
  const ledger = await q('select * from ledger')
  assert.ok(ledger.length > 0)
  assert.ok(ledger.every((l) => l.from_owner === p1.id || l.to_owner === p1.id))
  assert.equal((await q('select * from console_state')).length, 0)
  assert.equal((await q('select * from staff')).length, 0)
  assert.ok((await q('select * from games')).length >= 2) // 게임은 공개
  await fails(() => q(`update members set rp = 99999 where id = $1`, [p1.id]).then(async () => {
    const m = await one('select rp from members where id = $1', [p1.id])
    if (Number(m.rp) !== 99999) throw new Error('update blocked')
  }), /update blocked/)
  await fails(() => q(`select _move($1, 'store', $2, 'P', 1, 'x', 'x', null, null)`, [storeId, p1.id]), /permission denied/)
  await fails(() => q(`select reclaim_from_member($1, 'P', 1, 'x')`, [p1.id]), /직원 계정/)
  await q('reset role')
})
await test('직원은 매장 전체 조회 가능', async () => {
  await q('set role authenticated')
  await as(ownerUid)
  assert.ok((await q('select * from members')).length >= 4)
  assert.ok((await q('select * from staff')).length >= 3)
  assert.equal((await q('select * from console_state')).length, 1)
  await q(`update console_state set state = '{"waitingCount": 2}'::jsonb where store_id = $1`, [storeId])
  await q('reset role')
})
await test('익명: 회원·지갑·원장 비공개, 게임·전광판·공개 랭킹은 공개', async () => {
  await q('set role anon')
  await as(null)
  assert.equal((await q('select * from members')).length, 0)
  assert.equal((await q('select * from wallets')).length, 0)
  assert.equal((await q('select * from ledger')).length, 0)
  assert.equal((await q('select * from stores')).length, 1)
  assert.ok((await q('select * from games')).length >= 2)
  assert.ok((await q('select * from game_entries')).length >= 1)
  assert.ok((await q('select * from events')).length >= 0)
  const rp = await q('select * from ranking_public')
  assert.ok(Array.isArray(rp))
  assert.equal((await q('select * from seasons_public')).length, 1)
  await fails(() => q(`select game_buyin($1, null, null, 'P')`, [gameId]), /로그인이 필요/)
  await fails(() => q(`insert into games (store_id, name, game_set_name, snapshot) values ($1, 'x', 'x', '{}')`, [storeId]), /row-level security/)
  await q('reset role')
})

console.log('\n초기화')
await as(ownerUid)
await test("reset_store('demo') → 회원 6·게임 2·참가 3·원장 생성", async () => {
  await q(`select reset_store('demo')`)
  assert.equal((await q('select * from members where store_id = $1', [storeId])).length, 6)
  assert.equal((await q('select * from games where store_id = $1', [storeId])).length, 2)
  const running = await one(`select id from games where store_id = $1 and status = 'running'`, [storeId])
  assert.equal((await q('select * from game_entries where game_id = $1', [running.id])).length, 3)
  assert.equal((await q('select * from buyin_events where game_id = $1', [running.id])).length, 3)
  const store = await one(`select balance from wallets where owner = 'store' and currency = 'P' and store_id = $1`, [storeId])
  assert.equal(Number(store.balance), 100_000_000 - 6 * 1_000_000 + 3)
  const ended = await one(`select id from games where store_id = $1 and status = 'ended'`, [storeId])
  assert.equal((await q('select * from game_entries where game_id = $1 and rank is not null', [ended.id])).length, 3)
  // 보존 불변식: 발행량 = 지점 + 회원 잔액 (재화별)
  for (const c of ['P', 'S', 'V']) {
    const issued = Number((await one(`select coalesce(sum(amount),0) as s from ledger where store_id = $1 and from_owner = 'hq' and currency = $2`, [storeId, c])).s)
    const held = Number((await one(`select coalesce(sum(balance),0) as s from wallets where store_id = $1 and currency = $2`, [storeId, c])).s)
    assert.equal(issued, held, `보존 불변식 ${c}: 발행 ${issued} ≠ 보유 ${held}`)
  }
})
await test("reset_store('empty') → 데이터 비움, 구조 유지", async () => {
  await q(`select reset_store('empty')`)
  assert.equal((await q('select * from members where store_id = $1', [storeId])).length, 0)
  assert.equal((await q('select * from ledger where store_id = $1', [storeId])).length, 0)
  assert.equal((await q('select * from game_sets where store_id = $1', [storeId])).length, 1)
  assert.equal((await q(`select * from wallets where store_id = $1 and owner = 'store'`, [storeId])).length, 3)
  await q(`select issue_to_store('P', 10, '초기화 후 발행')`)
  await fails(() => q(`delete from ledger`), /수정·삭제할 수 없습니다/) // 초기화 밖에서는 여전히 차단
})

console.log(`\n${passed}개 테스트 통과`)
await db.close()
