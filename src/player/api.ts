// 플레이어(회원) 페이지용 데이터 접근 — 콘솔 스토어와 분리된 가벼운 호출.
// 읽기는 RLS(본인 데이터·공개 게임)에 맡기고, 쓰기는 RPC만 사용한다.

import { CLIENT_ID, supabase } from '../lib/supabase'
import type { Currency, Game, LedgerEntry, Member, Pass, PassType, WaitEntry, WaitStatus } from '../types'
import { errMsg, rowToGame, rowToLedger, rowToMember, rowToPass, rowToPassType, rowToWait, walletsByOwner } from '../store/map'

type Row = Record<string, unknown>
const sb = () => {
  if (!supabase) throw new Error('Supabase가 설정되지 않았습니다.')
  return supabase
}

export interface GameByCode {
  game: Game
  storeId: string
  storeName: string
}

export async function fetchGameByCode(code: string): Promise<GameByCode | null> {
  const { data, error } = await sb()
    .from('games')
    .select('*, game_entries(*), buyin_events(*), stores(name)')
    .eq('join_code', code)
    .maybeSingle()
  if (error) throw new Error(errMsg(error))
  if (!data) return null
  const row = data as Row
  const store = row.stores as { name?: string } | null
  return { game: rowToGame(row), storeId: String(row.store_id), storeName: store?.name ?? '' }
}

/** 게임 1개의 변경(상태·참가자·바인)을 구독 */
export function subscribeGame(gameId: string, onChange: () => void): () => void {
  const ch = sb()
    .channel(`allinone-game-${gameId}-${CLIENT_ID}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_entries', filter: `game_id=eq.${gameId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'buyin_events', filter: `game_id=eq.${gameId}` }, onChange)
    .subscribe()
  return () => { void sb().removeChannel(ch) }
}

export interface MyInfo {
  member: Member
  ledger: LedgerEntry[]
}

/** 로그인한 회원 본인의 프로필·잔액·최근 거래 */
export async function fetchMe(userId: string): Promise<MyInfo | null> {
  const s = sb()
  const { data: m, error } = await s.from('members').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(errMsg(error))
  if (!m) return null
  const id = String((m as Row).id)
  const [w, l] = await Promise.all([
    s.from('wallets').select('owner, currency, balance').eq('owner', id),
    s.from('ledger').select('*').or(`from_owner.eq.${id},to_owner.eq.${id}`).order('seq', { ascending: false }).limit(30),
  ])
  if (w.error) throw new Error(errMsg(w.error))
  const balances = walletsByOwner((w.data ?? []) as Row[]).get(id)
  return {
    member: rowToMember(m as Row, balances),
    ledger: ((l.data ?? []) as Row[]).map(rowToLedger),
  }
}

/** 회원 본인의 지갑·참가 변경 구독 */
export function subscribeMe(memberId: string, onChange: () => void): () => void {
  const ch = sb()
    .channel(`allinone-me-${memberId}-${CLIENT_ID}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `owner=eq.${memberId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `id=eq.${memberId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_entries', filter: `member_id=eq.${memberId}` }, onChange)
    .subscribe()
  return () => { void sb().removeChannel(ch) }
}

/** 진행·예약 중인 게임 (공개) */
export async function fetchOpenGames(storeId: string): Promise<Game[]> {
  const { data, error } = await sb()
    .from('games')
    .select('*, game_entries(*), buyin_events(*)')
    .eq('store_id', storeId)
    .neq('status', 'ended')
    .order('created_at', { ascending: false })
  if (error) throw new Error(errMsg(error))
  return (data as Row[]).map(rowToGame)
}

/** 내가 참가한 게임 (최근순). entries에는 내 엔트리만 포함된다. */
export async function fetchMyGames(memberId: string): Promise<Game[]> {
  const { data, error } = await sb()
    .from('games')
    .select('*, game_entries!inner(*), buyin_events(*)')
    .eq('game_entries.member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(errMsg(error))
  return (data as Row[]).map(rowToGame)
}

export interface BuyinResult {
  type: 'BUYIN' | 'RE_BUYIN' | 'RE_ENTRY'
  round: number
  table: number
  seat: number
  chips: number
  earlyBirdChips: number | null
  cost: number
  currency: Currency
  gameName: string
}

/** 셀프 바인 — 서버가 유형(바인/리바인/리엔트리)·회차·좌석을 결정하고 참가비를 원자적으로 차감 */
export async function selfBuyin(gameId: string, currency: Currency, requestId: string): Promise<{ result: BuyinResult | null; error: string | null }> {
  const { data, error } = await sb().rpc('game_buyin', {
    p_game: gameId, p_member: null, p_type: null, p_currency: currency, p_request: requestId,
  })
  if (error) return { result: null, error: errMsg(error) }
  return { result: data as BuyinResult, error: null }
}

export async function updateMyProfile(patch: { nickname?: string; emoji?: string; color?: string; phone?: string }): Promise<string | null> {
  const { error } = await sb().rpc('update_my_profile', {
    p_nickname: patch.nickname ?? null, p_emoji: patch.emoji ?? null, p_color: patch.color ?? null, p_phone: patch.phone ?? null,
  })
  return error ? errMsg(error) : null
}

export async function fetchStoreName(storeId?: string): Promise<{ id: string; name: string } | null> {
  let q = sb().from('stores').select('id, name').order('created_at').limit(1)
  if (storeId) q = q.eq('id', storeId)
  const { data } = await q.maybeSingle()
  return data ? { id: String(data.id), name: String(data.name) } : null
}

// ── v2: 좌석 체크인 · 대기 · 내 이용권 ──────────────────────────────────

export interface CheckinResult {
  id: string
  status: WaitStatus
  table: number | null
  seat: number | null
  position: number | null
}

/** 셀프 체크인: 좌석 QR(table·seat)이면 착석, 없으면 대기 등록 */
export async function checkinSelf(table?: number, seat?: number): Promise<{ result: CheckinResult | null; error: string | null }> {
  const { data, error } = await sb().rpc('checkin_self', { p_table: table ?? null, p_seat: seat ?? null })
  if (error) return { result: null, error: errMsg(error) }
  return { result: data as CheckinResult, error: null }
}

export async function checkoutSelf(): Promise<string | null> {
  const { error } = await sb().rpc('checkout_self', {})
  return error ? errMsg(error) : null
}

/** 내 활성 대기/착석 항목 + 대기 순번 */
export async function fetchMyWait(memberId: string): Promise<{ entry: WaitEntry; position: number | null } | null> {
  const s = sb()
  const { data, error } = await s.from('waitlist').select('*').eq('member_id', memberId)
    .in('status', ['waiting', 'called', 'seated']).order('arrived_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(errMsg(error))
  if (!data) return null
  const entry = rowToWait(data as Row)
  return { entry, position: null }
}

export async function fetchMyPasses(memberId: string): Promise<{ passes: Pass[]; types: PassType[] }> {
  const s = sb()
  const [p, t] = await Promise.all([
    s.from('passes').select('*').eq('member_id', memberId).order('issued_at', { ascending: false }),
    s.from('pass_types').select('*'),
  ])
  if (p.error) throw new Error(errMsg(p.error))
  return { passes: ((p.data ?? []) as Row[]).map(rowToPass), types: ((t.data ?? []) as Row[]).map(rowToPassType) }
}
