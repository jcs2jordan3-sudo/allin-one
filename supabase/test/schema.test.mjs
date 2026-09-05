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
  assert.equal((await q('select * from pass_types where store_id = $1', [storeId])).length, 3)
  assert.equal((await q(`select * from seasons where store_id = $1 and status = 'open'`, [storeId])).length, 1)
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
const p1Uid = await signup('p1@test.com', { kind: 'member', nickname: '플레이어1', real_name: '김철수', phone: '010-3333-4444', store_id: storeId, emoji: '🦈', color: '#57B6F2' })
const p1 = (await one('select * from members where user_id = $1', [p1Uid]))
await test('회원 가입 → 회원 행(0002)·지갑 생성, 이름·휴대폰 저장, my_role = member', async () => {
  assert.equal(p1.no, '0002')
  assert.equal(p1.nickname, '플레이어1')
  assert.equal(p1.real_name, '김철수')
  assert.equal(p1.phone, '010-3333-4444')
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
  const uid = await signup('pre@test.com', { kind: 'member', nickname: '나중가입', real_name: '이영희', phone: '01055556666' })
  assert.equal((await q('select * from members')).length, before)
  const m = await one('select * from members where id = $1', [pre])
  assert.equal(m.user_id, uid)
  assert.equal(m.nickname, '나중가입')
  assert.equal(m.real_name, '이영희')
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
await test('시즌: 마감 → 결과 스냅샷 → 정산(보상 지급 + RP 리셋) → 새 시즌', async () => {
  await q(`select adjust_rp($1, 500, '이벤트 보너스')`, [m1])
  assert.equal((await q('select * from rp_log where member_id = $1', [m1])).length, 1)
  await fails(() => q(`select settle_season('[]'::jsonb)`), /먼저 시즌을 마감/)
  await q(`select close_season()`)
  const closed = await one(`select * from seasons where store_id = $1 and status = 'closed'`, [storeId])
  assert.equal(closed.name, '시즌 1')
  assert.equal(closed.results[0].memberId, m1)
  assert.equal(closed.results[0].rank, 1)
  await fails(() => q(`select start_season('시즌 2')`), /정산 대기/)
  await q(`select settle_season($1)`, [JSON.stringify([{ rank: 1, amount: 50 }])])
  assert.equal(Number((await one('select rp from members where id = $1', [m1])).rp), 0)
  const l = await one(`select * from ledger where reason like '시즌 1 1위%'`)
  assert.equal(Number(l.amount), 50)
  const settled = await one(`select * from seasons where id = $1`, [closed.id])
  assert.equal(settled.status, 'settled')
  assert.equal(settled.results[0].paid, 50)
  await q(`select start_season('시즌 2')`)
  assert.equal((await q(`select * from seasons where store_id = $1 and status = 'open'`, [storeId])).length, 1)
})
await test('RP 수동 조정: 사유 필수·음수 불가', async () => {
  await fails(() => q(`select adjust_rp($1, 100, '')`, [m1]), /사유/)
  await fails(() => q(`select adjust_rp($1, -100, '회수')`, [m1]), /RP가 부족/)
})

console.log('\n이용권')
const passType = (await one(`select id, name from pass_types where store_id = $1 order by sort limit 1`, [storeId]))
await test('발급 → 사용 → 연장/회수 규칙 → 유형 삭제 규칙', async () => {
  await q(`select issue_passes($1, $2, 2)`, [passType.id, m1])
  const ps = await q(`select * from passes where member_id = $1 order by issued_at`, [m1])
  assert.equal(ps.length, 2)
  assert.equal(ps[0].status, 'unused')
  await fails(() => q(`select issue_passes($1, $2, 0)`, [passType.id, m1]), /1~100/)
  await q(`select use_pass($1)`, [ps[0].id])
  assert.equal((await one('select status from passes where id = $1', [ps[0].id])).status, 'used')
  await fails(() => q(`select use_pass($1)`, [ps[0].id]), /이미 사용/)
  await fails(() => q(`select extend_pass($1, 10)`, [ps[0].id]), /미사용 상태/)
  await fails(() => q(`select remove_pass_type($1)`, [passType.id]), /미사용 이용권이 남아/)
  await q(`select extend_pass($1, 7)`, [ps[1].id])
  await q(`select revoke_pass($1)`, [ps[1].id])
  assert.equal((await one('select status from passes where id = $1', [ps[1].id])).status, 'revoked')
  await q(`select remove_pass_type($1)`, [passType.id]) // 사용 이력 있음 → archived
  assert.equal((await one('select archived from pass_types where id = $1', [passType.id])).archived, true)
  const log = await q(`select action from pass_log where store_id = $1 order by ts`, [storeId])
  assert.deepEqual(log.map((x) => x.action), ['발급', '사용', '연장', '회수'])
  await q(`select reset_biz_day()`)
  assert.equal((await q(`select * from pass_log where action = '집계 초기화'`)).length, 1)
})

console.log('\n대기자 · 좌석 QR 체크인')
await test('좌석 QR 셀프 체크인 → 착석, 다른 손님 같은 좌석 거부, 대기 등록·순번', async () => {
  await as(p1Uid)
  const r = (await one(`select checkin_self(1, 3) as r`)).r
  assert.equal(r.status, 'seated')
  assert.equal(r.table, 1)
  assert.equal(r.seat, 3)
  await fails(() => q(`select checkin_self(99, 1)`), /존재하지 않는 테이블/)
  await fails(() => q(`select checkin_self(1, 50)`), /좌석 번호/)
  const uid2 = (await one(`select user_id from members where nickname = '나중가입'`)).user_id
  await as(uid2)
  await fails(() => q(`select checkin_self(1, 3)`), /이미 다른 손님/)
  const w = (await one(`select checkin_self() as r`)).r
  assert.equal(w.status, 'waiting')
  assert.equal(w.position, 1)
  await as(ownerUid)
})
await test('직원: 대기 추가·호출·착석·노쇼, 중복 등록 거부', async () => {
  const guest = (await one(`select waitlist_add(null, '워크인 손님', '2명') as id`)).id
  await fails(() => q(`select waitlist_add(null, '')`), /회원을 선택하거나/)
  await fails(() => q(`select waitlist_add($1)`, [p1.id]), /이미 대기 명단/)
  await q(`select waitlist_update($1, 'called')`, [guest])
  assert.ok((await one('select called_at from waitlist where id = $1', [guest])).called_at)
  await q(`select waitlist_update($1, 'seated', 2, 4)`, [guest])
  const g = await one('select * from waitlist where id = $1', [guest])
  assert.equal(g.status, 'seated'); assert.equal(g.table_no, 2); assert.equal(g.seat, 4)
  await q(`select waitlist_update($1, 'noshow')`, [guest])
  assert.ok((await one('select ended_at from waitlist where id = $1', [guest])).ended_at)
  await fails(() => q(`select waitlist_update($1, 'flying')`, [guest]), /알 수 없는 상태/)
})
await test('셀프 바인 시 체크인한 좌석(T1-3)을 그대로 배정', async () => {
  const g3 = (await one(`select create_game('체크인 게임', $1, array[1,2]) as id`, [gsId])).id
  await q(`select transfer_to_member($1, 'P', 2, '충전')`, [p1.id])
  await as(p1Uid)
  const r = (await one(`select game_buyin($1, null, null, 'P') as r`, [g3])).r
  assert.equal(r.table, 1)
  assert.equal(r.seat, 3)
  await q(`select checkout_self()`)
  assert.equal((await q(`select * from waitlist where member_id = $1 and status in ('waiting','called','seated')`, [p1.id])).length, 0)
  await as(ownerUid)
  await q(`select end_game($1)`, [g3])
})

console.log('\n감사 로그 · 탈퇴 익명화')
await test('회원 정보 수정 → audit_log에 변경 컬럼만 기록', async () => {
  await q(`update members set memo = 'VIP' where id = $1`, [p1.id])
  const a = await one(`select * from audit_log where target_id = $1 and action = 'members.update' order by ts desc limit 1`, [p1.id])
  assert.equal(a.actor, '대표')
  assert.deepEqual(Object.keys(a.detail), ['memo'])
  assert.deepEqual(a.detail.memo, [null, 'VIP'])
})
await test('회원 탈퇴 → 잔액 환수 + 개인정보 익명화 + 계정 연결 해제, 원장 보존', async () => {
  const bal = Number((await one(`select balance from wallets where owner = $1 and currency = 'P'`, [m1])).balance)
  assert.ok(bal > 0)
  await q(`select leave_member($1)`, [m1])
  const m = await one('select * from members where id = $1', [m1])
  assert.equal(m.status, 'left')
  assert.equal(m.nickname, '탈퇴회원 0001')
  assert.equal(m.phone, null)
  assert.equal(m.user_id, null)
  assert.equal(Number((await one(`select balance from wallets where owner = $1 and currency = 'P'`, [m1])).balance), 0)
  assert.ok((await q(`select * from ledger where from_owner = $1 and reason = '회원 탈퇴 잔액 환수'`, [m1])).length >= 1)
  assert.equal((await q(`select * from audit_log where action = 'members.leave' and target_id = $1`, [m1])).length, 1)
})
await test('회원 본인 프로필 수정', async () => {
  await as(p1Uid)
  await q(`select update_my_profile('새닉네임', '🔥', null, null)`)
  const m = await one('select * from members where id = $1', [p1.id])
  assert.equal(m.nickname, '새닉네임')
  assert.equal(m.emoji, '🔥')
  assert.equal(m.color, '#57B6F2')
  assert.equal(m.real_name, '김철수')
  await q(`select update_my_profile(null, null, null, '010-1111-2222', '박실명')`)
  const m2 = await one('select * from members where id = $1', [p1.id])
  assert.equal(m2.nickname, '새닉네임')
  assert.equal(m2.phone, '010-1111-2222')
  assert.equal(m2.real_name, '박실명')
  await as(ownerUid)
})

console.log('\n역할 권한')
await test('딜러: 재화 전송·참가 등록·취소 가능, 데이터 초기화·직원 관리는 불가', async () => {
  const dealerUid = (await one(`select user_id from staff where email = 'late@test.com'`)).user_id
  await as(dealerUid)
  await q(`select transfer_to_member($1, 'P', 3, '현금 결제')`, [p1.id])
  const g2 = (await one(`select create_game('딜러 게임', $1, array[3]) as id`, [gsId])).id
  const r = (await one(`select game_buyin($1, $2, 'BUYIN', 'P') as r`, [g2, p1.id])).r
  assert.equal(r.type, 'BUYIN')
  await q(`select cancel_game($1)`, [g2])
  assert.equal((await one('select cancelled from games where id = $1', [g2])).cancelled, true)
  await fails(() => q(`select reset_store('empty')`), /권한이 없습니다/)
  await q('set role authenticated')
  const ins = await db.query(`insert into staff (store_id, email, name, role) values ($1, 'x@test.com', 'x', 'dealer')`, [storeId]).catch((e) => e)
  assert.match(String(ins.message), /row-level security/)
  await q('reset role')
  await as(ownerUid)
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
  assert.equal((await q('select * from audit_log')).length, 0)
  assert.ok((await q('select * from waitlist')).every((w) => w.member_id === p1.id))
  assert.ok((await q('select * from rp_log')).every((w) => w.member_id === p1.id))
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
await test("reset_store('empty') → 데이터 비움, 구조 유지, 새 시즌·audit 기록", async () => {
  const auditBefore = (await q('select * from audit_log')).length
  await q(`select reset_store('empty')`)
  assert.equal((await q('select * from members where store_id = $1', [storeId])).length, 0)
  assert.equal((await q('select * from ledger where store_id = $1', [storeId])).length, 0)
  assert.equal((await q('select * from waitlist where store_id = $1', [storeId])).length, 0)
  assert.equal((await q('select * from passes where store_id = $1', [storeId])).length, 0)
  assert.equal((await q('select * from game_sets where store_id = $1', [storeId])).length, 1)
  assert.ok((await q('select * from pass_types where store_id = $1', [storeId])).length >= 3)
  assert.equal((await q(`select * from seasons where store_id = $1 and status = 'open'`, [storeId])).length, 1)
  assert.equal((await q(`select * from wallets where store_id = $1 and owner = 'store'`, [storeId])).length, 3)
  const audit = await q('select action from audit_log order by ts desc limit 1')
  assert.equal(audit[0].action, 'store.reset')
  assert.equal((await q('select * from audit_log')).length, auditBefore + 1) // 초기화 중 삭제 행은 로그에 남기지 않음
  await q(`select issue_to_store('P', 10, '초기화 후 발행')`)
  await fails(() => q(`delete from ledger`), /수정·삭제할 수 없습니다/) // 초기화 밖에서는 여전히 차단
})

console.log('\nconsole_state(jsonb) → 테이블 마이그레이션')
await test('기존 jsonb 상태를 넣고 schema.sql 재적용 → pass_types·seasons·rp_log 이관', async () => {
  const mid = (await one(`select create_member('이관회원') as id`)).id
  const now = Date.now()
  await q(`delete from pass_types where store_id = $1`, [storeId])
  await q(`delete from seasons where store_id = $1`, [storeId])
  await q(`update console_state set state = $2::jsonb where store_id = $1`, [storeId, JSON.stringify({
    passTypes: [{ id: 'aaaa1111', name: '이관권', validDays: 15, color: '#ffffff' }],
    passes: [{ id: 'p1', typeId: 'aaaa1111', memberId: mid, issuedAt: now - 86400000, expiresAt: now + 86400000, status: 'unused' }],
    seasons: [{ id: 's1', name: '이관 시즌', startedAt: now - 5 * 86400000, status: 'open' }],
    rpLog: [{ id: 'r1', ts: now, memberId: mid, delta: 10, reason: '이관', operator: '대표' }],
    bizResetAt: now - 3600000,
  })])
  await db.exec(schema)
  assert.equal((await one(`select name from pass_types where store_id = $1`, [storeId])).name, '이관권')
  const p = await one(`select * from passes where member_id = $1`, [mid])
  assert.equal(p.status, 'unused')
  assert.equal((await one(`select name from seasons where store_id = $1`, [storeId])).name, '이관 시즌')
  assert.equal((await q(`select * from rp_log where member_id = $1`, [mid])).length, 1)
  assert.deepEqual((await one(`select state from console_state where store_id = $1`, [storeId])).state, {})
})
await test('실서버 형태(구 4인자 update_my_profile 존재)에 재적용 → 오버로드 없이 5인자 하나만 남고 4인자 호출도 동작', async () => {
  await q(`create or replace function public.update_my_profile(p_nickname text, p_emoji text, p_color text, p_phone text)
           returns void language sql as $$ select null $$`)
  await db.exec(schema)
  const n = (await one(`select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                        where ns.nspname = 'public' and p.proname = 'update_my_profile'`)).n
  assert.equal(n, 1)
  // 앞선 초기화로 p1 회원 행은 사라졌으므로 새 회원으로 확인
  const uid = await signup('overload@test.com', { kind: 'member', nickname: '오버로드', real_name: '오버로드실명', phone: '010-9999-0000' })
  await as(uid)
  await q(`select update_my_profile('오버로드확인', null, null, null)`)
  const m = await one('select nickname, real_name from members where user_id = $1', [uid])
  assert.equal(m.nickname, '오버로드확인')
  assert.equal(m.real_name, '오버로드실명')
  await as(ownerUid)
})

console.log('\n플랫폼 관리자(개발자)')
await test('일반 직원(대표)은 admin_* 호출 불가, is_platform_admin = false', async () => {
  await as(ownerUid)
  await fails(() => q(`select admin_list_stores()`), /개발자/)
  assert.equal((await one(`select is_platform_admin() as b`)).b, false)
})
const devUid = await signup('dev@test.com', { kind: 'platform_admin' })
await q(`insert into platform_admins (user_id, email) values ($1, 'dev@test.com')`, [devUid])
await test('개발자 계정: 회원 행 없음, is_platform_admin = true, 매장 목록에 대표·연결 여부·회원 수', async () => {
  assert.equal((await q('select * from members where user_id = $1', [devUid])).length, 0)
  await as(devUid)
  assert.equal((await one(`select is_platform_admin() as b`)).b, true)
  const list = (await one(`select admin_list_stores() as j`)).j
  assert.equal(list.length, 1)
  assert.equal(list[0].id, storeId)
  assert.equal(list[0].owner.email, 'owner@test.com')
  assert.equal(list[0].owner.linked, true)
  assert.ok(list[0].memberCount >= 1)
})
let store2
await test('admin_create_store → 새 매장 + 대표 초대 행(미연결) + 기본 게임 셋·이용권·시즌·지갑, 감사 로그 2줄', async () => {
  store2 = (await one(`select admin_create_store('홍대 2호점', 'Buyer@Test.com', '구매자') as id`)).id
  const list = (await one(`select admin_list_stores() as j`)).j
  assert.equal(list.length, 2)
  const s2 = list.find((x) => x.id === store2)
  assert.equal(s2.name, '홍대 2호점')
  assert.deepEqual(s2.owner, { name: '구매자', email: 'buyer@test.com', linked: false })
  assert.equal((await one(`select count(*)::int n from game_sets where store_id = $1`, [store2])).n, 1)
  assert.equal((await one(`select count(*)::int n from pass_types where store_id = $1`, [store2])).n, 3)
  assert.equal((await one(`select count(*)::int n from seasons where store_id = $1`, [store2])).n, 1)
  assert.equal((await one(`select count(*)::int n from wallets where store_id = $1 and owner = 'store'`, [store2])).n, 3)
  const audit = await q(`select action from audit_log where store_id = $1`, [store2])
  assert.deepEqual(audit.map((a) => a.action).sort(), ['store.create', 'store.owner_set'])
})
await test('구매자가 그 이메일로 콘솔 가입 → 2호점 대표로 자동 연결 (my_role = owner)', async () => {
  const uid = await signup('buyer@test.com', { kind: 'staff' })
  await as(uid)
  const r = (await one('select my_role() as r')).r
  assert.equal(r.kind, 'staff'); assert.equal(r.role, 'owner'); assert.equal(r.storeId, store2)
  await as(devUid)
  const s2 = (await one(`select admin_list_stores() as j`)).j.find((x) => x.id === store2)
  assert.equal(s2.owner.linked, true)
})
await test('admin_set_store_owner: 기존 대표는 manager로, 새 이메일은 owner 초대 행 / 이미 가입된 계정이면 즉시 연결', async () => {
  await q(`select admin_set_store_owner($1, 'second@test.com', '새대표')`, [store2])
  const rows = await q(`select email, role, user_id is not null as linked from staff where store_id = $1 order by email`, [store2])
  assert.deepEqual(rows, [
    { email: 'buyer@test.com', role: 'manager', linked: true },
    { email: 'second@test.com', role: 'owner', linked: false },
  ])
  const uid3 = await signup('third@test.com', { kind: 'staff' }) // 초대 전에 먼저 가입한 계정
  await as(devUid)
  await q(`select admin_set_store_owner($1, 'third@test.com', '셋째')`, [store2])
  const t = await one(`select role, user_id from staff where store_id = $1 and email = 'third@test.com'`, [store2])
  assert.equal(t.role, 'owner'); assert.equal(t.user_id, uid3)
  assert.equal((await one(`select role from staff where store_id = $1 and email = 'second@test.com'`, [store2])).role, 'manager')
})
await test('다른 매장 직원 계정은 대표 지정 불가, 잘못된 이메일이면 매장 개설 자체가 롤백', async () => {
  await fails(() => q(`select admin_set_store_owner($1, 'owner@test.com')`, [store2]), /다른 매장/)
  await fails(() => q(`select admin_create_store('롤백매장', 'not-an-email')`), /이메일 형식/)
  assert.equal((await one(`select count(*)::int n from stores where name = '롤백매장'`)).n, 0)
})
await test('매장이 있으면 bootstrap_store 는 여전히 거부 (추가 개설은 개발자 콘솔로)', async () => {
  await fails(() => q(`select bootstrap_store('셋째 매장')`), /이미 개설된 매장/)
  await as(ownerUid)
})
await test('admin_select_store → 개발자가 그 매장의 대표처럼: my_role owner(devScope)·소속 매장·직원 전용 RPC·감사 actor=개발자', async () => {
  await as(devUid)
  assert.equal((await one('select my_role() as r')).r.kind, 'none')
  await fails(() => q(`select create_member('x')`), /직원 계정/)
  await q(`select admin_select_store($1)`, [store2])
  const r = (await one('select my_role() as r')).r
  assert.equal(r.kind, 'staff'); assert.equal(r.role, 'owner'); assert.equal(r.storeId, store2); assert.equal(r.devScope, true)
  assert.equal((await one('select staff_store_id() as s')).s, store2)
  assert.equal((await one('select staff_role() as r')).r, 'owner')
  const mid = (await one(`select create_member('개발자등록') as id`)).id
  assert.equal((await one('select store_id from members where id = $1', [mid])).store_id, store2)
  const a = await one(`select actor from audit_log where store_id = $1 and action = 'members.insert' order by ts desc limit 1`, [store2])
  assert.equal(a.actor, '개발자')
  const list = (await one(`select admin_list_stores() as j`)).j
  assert.equal(list.find((x) => x.id === store2).selected, true)
  assert.equal(list.find((x) => x.id === storeId).selected, false)
  // 다른 매장으로 전환
  await q(`select admin_select_store($1)`, [storeId])
  assert.equal((await one('select staff_store_id() as s')).s, storeId)
})
await test('admin_select_store(null) → 스코프 해제, 일반 직원은 호출 불가', async () => {
  await q(`select admin_select_store(null)`)
  assert.equal((await one('select my_role() as r')).r.kind, 'none')
  await fails(() => q(`select create_member('x')`), /직원 계정/)
  await as(ownerUid)
  await fails(() => q(`select admin_select_store($1)`, [store2]), /개발자/)
})

console.log('\n회원 명단 뷰 (members_public)')
await test('회원은 소속 매장 회원 명단(닉네임 공개)만 보고, 다른 매장 회원·실명·전화번호는 안 보임', async () => {
  const uid = await signup('roster@test.com', { kind: 'member', nickname: '명단회원', real_name: '명단실명', phone: '010-9999-1111' })
  await as(uid)
  const rows = await q(`select * from members_public order by rp desc`)
  assert.ok(rows.length >= 2)
  assert.ok(rows.every((r) => r.store_id === storeId))
  assert.ok(rows.some((r) => r.nickname === '명단회원'))
  assert.ok(!rows.some((r) => r.nickname === '개발자등록')) // 2호점 회원
  assert.deepEqual(Object.keys(rows[0]).sort(), ['color', 'emoji', 'id', 'nickname', 'no', 'rp', 'store_id'])
})
await test('비로그인은 0건, 개발자가 2호점을 보는 중이면 2호점 명단', async () => {
  await as(null)
  assert.equal((await q(`select * from members_public`)).length, 0)
  await as(devUid)
  await q(`select admin_select_store($1)`, [store2])
  const rows = await q(`select nickname from members_public`)
  assert.deepEqual(rows.map((r) => r.nickname), ['개발자등록'])
  await q(`select admin_select_store(null)`)
  await as(ownerUid)
})

console.log(`\n${passed}개 테스트 통과`)
await db.close()
