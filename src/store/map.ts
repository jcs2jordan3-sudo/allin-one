// Supabase 행 ↔ 앱 타입 매핑. 시각은 앱 전체가 epoch ms(number)를 쓰므로 여기서 변환한다.

import type {
  BuyinEvent, Currency, Entry, EventPost, Game, GameSet, LedgerEntry, Manager, Member, StaffRole,
} from '../types'

type Row = Record<string, unknown>
const str = (v: unknown) => (v == null ? undefined : String(v))
const num = (v: unknown) => (v == null ? 0 : Number(v))
export const ms = (v: unknown): number | undefined => (v ? new Date(String(v)).getTime() : undefined)

export const CURRENCIES: Currency[] = ['P', 'S', 'V']

/** wallets 행 목록 → owner별 잔액 */
export function walletsByOwner(rows: Row[]): Map<string, Record<Currency, number>> {
  const map = new Map<string, Record<Currency, number>>()
  for (const r of rows) {
    const owner = String(r.owner)
    const cur = map.get(owner) ?? { P: 0, S: 0, V: 0 }
    cur[String(r.currency) as Currency] = num(r.balance)
    map.set(owner, cur)
  }
  return map
}

export function rowToMember(r: Row, balances?: Record<Currency, number>): Member {
  return {
    id: String(r.id),
    no: String(r.no),
    nickname: String(r.nickname),
    emoji: String(r.emoji ?? '🙂'),
    color: String(r.color ?? '#57B6F2'),
    realName: str(r.real_name),
    phone: str(r.phone),
    balances: balances ?? { P: 0, S: 0, V: 0 },
    rp: num(r.rp),
    joinedAt: ms(r.joined_at) ?? Date.now(),
    status: r.status === 'left' ? 'left' : 'active',
    memo: str(r.memo),
    linked: r.user_id != null,
  }
}

/** ranking_public 뷰 행 → 공개 화면용 부분 회원 */
export function rowToPublicMember(r: Row): Member {
  return {
    id: String(r.id),
    no: '',
    nickname: String(r.nickname),
    emoji: String(r.emoji ?? '🙂'),
    color: String(r.color ?? '#57B6F2'),
    balances: { P: 0, S: 0, V: 0 },
    rp: num(r.rp),
    joinedAt: 0,
    status: 'active',
  }
}

export function rowToLedger(r: Row): LedgerEntry {
  return {
    id: String(r.id),
    ts: ms(r.ts) ?? 0,
    currency: String(r.currency) as Currency,
    amount: num(r.amount),
    from: String(r.from_owner),
    to: String(r.to_owner),
    reason: str(r.reason),
    operator: str(r.operator),
    gameId: str(r.game_id),
    storeBalanceAfter: num(r.store_balance_after),
  }
}

export function rowToGameSet(r: Row): GameSet {
  const data = (r.data ?? {}) as Partial<GameSet>
  return {
    id: String(r.id),
    name: String(r.name),
    levels: data.levels ?? [],
    regCloseLevelIndex: data.regCloseLevelIndex ?? 0,
    buyinRules: data.buyinRules ?? [],
    earlyBird: data.earlyBird ?? [],
    prizes: data.prizes ?? [],
    rpByRank: data.rpByRank ?? [],
  }
}

/** GameSet → game_sets.data (id·name 제외) */
export function gameSetToData(gs: GameSet) {
  const { id: _id, name: _name, ...data } = gs
  return data
}

function rowToEntry(r: Row): Entry {
  return {
    memberId: String(r.member_id),
    table: num(r.table_no),
    seat: num(r.seat),
    status: r.status === 'eliminated' ? 'eliminated' : 'playing',
    rank: r.rank == null ? undefined : num(r.rank),
    outAt: ms(r.out_at),
  }
}

function rowToBuyin(r: Row): BuyinEvent {
  return {
    id: String(r.id),
    ts: ms(r.ts) ?? 0,
    memberId: String(r.member_id),
    type: String(r.type) as BuyinEvent['type'],
    round: num(r.round),
    currency: String(r.currency) as Currency,
    cost: num(r.cost),
    chips: num(r.chips),
    earlyBirdChips: r.early_bird_chips == null ? undefined : num(r.early_bird_chips),
  }
}

export function rowToGame(r: Row): Game {
  const entries = ((r.game_entries as Row[] | undefined) ?? []).map(rowToEntry)
  const buyins = ((r.buyin_events as Row[] | undefined) ?? []).map(rowToBuyin).sort((a, b) => a.ts - b.ts)
  return {
    id: String(r.id),
    name: String(r.name),
    gameSetName: String(r.game_set_name),
    snapshot: r.snapshot as GameSet,
    status: String(r.status) as Game['status'],
    startedAt: ms(r.started_at) ?? Date.now(),
    pausedAt: ms(r.paused_at),
    pausedTotal: num(r.paused_total_ms),
    regClosedManual: Boolean(r.reg_closed_manual) || undefined,
    entries,
    buyins,
    tables: ((r.tables as number[] | undefined) ?? []).map(Number),
    endedAt: ms(r.ended_at),
    notice: str(r.notice) || undefined,
    cancelled: Boolean(r.cancelled) || undefined,
    chipCorrection: num(r.chip_correction) || undefined,
    correctionCount: num(r.correction_count) || undefined,
    addonChips: num(r.addon_chips) || undefined,
    addonCount: num(r.addon_count) || undefined,
    joinCode: str(r.join_code),
  }
}

export function rowToStaff(r: Row): Manager {
  return {
    id: String(r.id),
    loginId: String(r.email),
    name: String(r.name),
    role: String(r.role) as StaffRole,
    linked: r.user_id != null,
  }
}

export function rowToEvent(r: Row): EventPost {
  return {
    id: String(r.id),
    title: String(r.title),
    body: String(r.body ?? ''),
    createdAt: ms(r.created_at) ?? 0,
  }
}

/** 오류 객체 → 사용자 메시지 (RPC의 raise exception 메시지는 그대로 통과) */
export function errMsg(e: unknown): string {
  const raw = typeof e === 'string' ? e : ((e as { message?: string })?.message ?? '')
  const code = (e as { code?: string })?.code
  if (code === '23505') return '이미 존재하는 항목입니다.'
  if (code === '42501' || /permission denied|row-level security/i.test(raw)) return '이 작업을 수행할 권한이 없습니다.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) return '서버에 연결할 수 없습니다. 네트워크를 확인해주세요.'
  if (/JWT expired|invalid claim/i.test(raw)) return '로그인이 만료되었습니다. 다시 로그인해주세요.'
  return raw || '알 수 없는 오류가 발생했습니다.'
}
