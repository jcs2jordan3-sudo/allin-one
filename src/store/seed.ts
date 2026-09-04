import type {
  Currency, EventPost, Game, GameSet, LedgerEntry, Manager, Member, Pass, PassLogEntry, PassType, RpLogEntry,
  Season, TableInfo, WaitEntry,
} from '../types'
import type { StoreState } from './types'

export const uid = () => crypto.randomUUID().slice(0, 8)
export const DAY = 86_400_000

export const seedGameSet = (): GameSet => ({
  id: uid(),
  name: '데일리 스탠다드',
  levels: [
    { type: 'level', label: 'Level 1', durationMin: 7, sb: 100, bb: 200, ante: 0 },
    { type: 'level', label: 'Level 2', durationMin: 7, sb: 200, bb: 400, ante: 0 },
    { type: 'level', label: 'Level 3', durationMin: 7, sb: 300, bb: 600, ante: 0 },
    { type: 'level', label: 'Level 4', durationMin: 7, sb: 400, bb: 800, ante: 0 },
    { type: 'level', label: 'Level 5', durationMin: 7, sb: 500, bb: 1000, ante: 0 },
    { type: 'break', label: 'BREAK 1', durationMin: 10, sb: 0, bb: 0, ante: 0, colorUp: 500 },
    { type: 'level', label: 'Level 6', durationMin: 7, sb: 1000, bb: 2000, ante: 2000 },
    { type: 'level', label: 'Level 7', durationMin: 7, sb: 2000, bb: 4000, ante: 4000 },
    { type: 'level', label: 'Level 8', durationMin: 7, sb: 3000, bb: 6000, ante: 6000 },
    { type: 'level', label: 'Level 9', durationMin: 0, sb: 5000, bb: 10000, ante: 10000 },
  ],
  regCloseLevelIndex: 5,
  buyinRules: [
    { type: 'BUYIN', round: 1, cost: { P: 1, S: 1, V: 1 }, chips: 20000 },
    { type: 'RE_BUYIN', round: 1, cost: { P: 1, S: 1, V: 1 }, chips: 40000 },
    { type: 'RE_BUYIN', round: 2, cost: { P: 1, S: 1, V: 1 }, chips: 40000 },
    { type: 'RE_ENTRY', round: 1, cost: { P: 1, S: 1, V: 1 }, chips: 20000 },
  ],
  earlyBird: [
    { levelIndex: 0, chips: 10000 },
    { levelIndex: 1, chips: 5000 },
  ],
  prizes: [
    { rank: 1, currency: 'P', amount: 10 },
    { rank: 2, currency: 'P', amount: 5 },
    { rank: 3, currency: 'P', amount: 2 },
  ],
  rpByRank: [1000, 700, 500, 300, 200, 100],
})

export const seedPassTypes = (): PassType[] => [
  { id: uid(), name: '1,000P', validDays: 30, color: '#57B6F2' },
  { id: uid(), name: '10,000P', validDays: 30, color: '#E9BB56' },
  { id: uid(), name: '하이롤러', validDays: 60, color: '#A98BF5' },
]

export const DEFAULT_RANGE_DAYS = 30
export const defaultRange = () => ({ from: Date.now() - DEFAULT_RANGE_DAYS * DAY, to: Date.now() + DAY })

/** 로컬 모드 초기 콘솔 상태 (이용권 유형·시즌 등) */
export function defaultLocalExtras() {
  return {
    passTypes: seedPassTypes(),
    passes: [] as Pass[],
    passLog: [] as PassLogEntry[],
    bizResetAt: Date.now(),
    rpLog: [] as RpLogEntry[],
    seasons: [{ id: uid(), name: '시즌 1', startedAt: Date.now(), status: 'open' as const }] as Season[],
    waitlist: [] as WaitEntry[],
    auditLog: [],
    ledgerRange: defaultRange(),
    historyRange: defaultRange(),
  }
}

/** 클라우드 모드 초기 상태 — 데이터는 서버에서 채움 */
export function emptyState(): StoreState {
  return {
    storeId: null,
    storeName: '',
    operatorName: '',
    lockPin: null,
    passTypes: [],
    passes: [],
    passLog: [],
    bizResetAt: Date.now(),
    rpLog: [],
    seasons: [],
    waitlist: [],
    auditLog: [],
    ledgerRange: defaultRange(),
    historyRange: defaultRange(),
    wallet: { P: 0, S: 0, V: 0 },
    members: [],
    managers: [],
    gameSets: [],
    games: [],
    ledger: [],
    events: [],
    tables: [],
  }
}

const mk = (
  now: number, no: string, nickname: string, emoji: string, color: string,
  p: number, s: number, v: number, rp: number, daysAgo: number,
): Member => ({
  id: uid(), no, nickname, emoji, color,
  balances: { P: p, S: s, V: v }, rp,
  joinedAt: now - daysAgo * DAY, status: 'active',
})

/** 로컬 모드 데모 시드 */
export function seedState(): StoreState {
  const now = Date.now()
  const gameSet = seedGameSet()
  const members: Member[] = [
    mk(now, '0001', '에이스', '😎', '#E9BB56', 1_019_991, 1_000_000, 15, 400_000, 90),
    mk(now, '0002', '리버킹', '🦈', '#57B6F2', 999_998, 1_050_000, 8, 200_000, 75),
    mk(now, '0003', '블러프', '🎭', '#A98BF5', 999_998, 1_000_000, 8, 60_000, 60),
    mk(now, '0004', '칩리더', '🐯', '#F2A65A', 999_995, 1_000_000, 12, 60_000, 45),
    mk(now, '0005', '포카리', '🐳', '#4FD1C5', 999_996, 1_000_000, 4, 20_000, 20),
    mk(now, '0006', '올인맨', '🔥', '#F26D76', 969_992, 1_000_000, 9, 10_000, 7),
  ]

  const wallet: Record<Currency, number> = { P: 94_000_030, S: 93_950_000, V: 944 }

  const ledger: LedgerEntry[] = [
    { id: uid(), ts: now - 30 * DAY, currency: 'P', amount: 100_000_000, from: 'hq', to: 'store', reason: '초기 포인트 발행', storeBalanceAfter: 100_000_000 },
    { id: uid(), ts: now - 30 * DAY, currency: 'S', amount: 100_000_000, from: 'hq', to: 'store', reason: '초기 시드 발행', storeBalanceAfter: 100_000_000 },
    { id: uid(), ts: now - 30 * DAY, currency: 'V', amount: 1_000, from: 'hq', to: 'store', reason: '음료권 발행', storeBalanceAfter: 1_000 },
    { id: uid(), ts: now - 2 * DAY, currency: 'P', amount: 1, from: 'store', to: members[3].id, reason: '이벤트 지급', operator: '매니저1', storeBalanceAfter: 94_000_031 },
    { id: uid(), ts: now - 1 * DAY, currency: 'P', amount: 1, from: 'store', to: members[1].id, reason: '이벤트 지급', operator: '매니저1', storeBalanceAfter: 94_000_030 },
  ]

  const game: Game = {
    id: uid(),
    name: '데일리 게임',
    gameSetName: gameSet.name,
    snapshot: JSON.parse(JSON.stringify(gameSet)),
    status: 'running',
    startedAt: now - 5 * 60_000,
    pausedTotal: 0,
    entries: [
      { memberId: members[0].id, table: 2, seat: 1, status: 'playing' },
      { memberId: members[1].id, table: 2, seat: 3, status: 'playing' },
      { memberId: members[3].id, table: 2, seat: 5, status: 'playing' },
    ],
    buyins: [
      { id: uid(), ts: now - 5 * 60_000, memberId: members[0].id, type: 'BUYIN', round: 1, currency: 'P', cost: 1, chips: 20000, earlyBirdChips: 10000 },
      { id: uid(), ts: now - 4 * 60_000, memberId: members[1].id, type: 'BUYIN', round: 1, currency: 'S', cost: 1, chips: 20000, earlyBirdChips: 10000 },
      { id: uid(), ts: now - 3 * 60_000, memberId: members[3].id, type: 'BUYIN', round: 1, currency: 'P', cost: 1, chips: 20000, earlyBirdChips: 10000 },
      { id: uid(), ts: now - 2 * 60_000, memberId: members[0].id, type: 'RE_BUYIN', round: 1, currency: 'P', cost: 1, chips: 40000 },
    ],
    tables: [1, 2, 3],
    joinCode: uid(),
  }

  const finished: Game = {
    id: uid(),
    name: '베이직',
    gameSetName: gameSet.name,
    snapshot: JSON.parse(JSON.stringify(gameSet)),
    status: 'ended',
    startedAt: now - 8 * DAY,
    endedAt: now - 8 * DAY + 4 * 3_600_000,
    pausedTotal: 0,
    entries: [
      { memberId: members[0].id, table: 1, seat: 1, status: 'eliminated', rank: 1 },
      { memberId: members[2].id, table: 1, seat: 2, status: 'eliminated', rank: 2 },
      { memberId: members[4].id, table: 1, seat: 3, status: 'eliminated', rank: 3 },
    ],
    buyins: [],
    tables: [1],
    joinCode: uid(),
  }

  const passTypes = seedPassTypes()
  const mkPass = (typeIdx: number, memberIdx: number, issuedDaysAgo: number, usedHoursAgo?: number): Pass => {
    const t = passTypes[typeIdx]
    const issuedAt = now - issuedDaysAgo * DAY
    return {
      id: uid(), typeId: t.id, memberId: members[memberIdx].id,
      issuedAt, expiresAt: issuedAt + t.validDays * DAY,
      status: usedHoursAgo !== undefined ? 'used' : 'unused',
      usedAt: usedHoursAgo !== undefined ? now - usedHoursAgo * 3_600_000 : undefined,
    }
  }
  const passes: Pass[] = [
    mkPass(0, 0, 10, 2), mkPass(0, 1, 10, 3), mkPass(1, 0, 5, 1),
    mkPass(0, 2, 3), mkPass(1, 3, 3), mkPass(2, 1, 7),
    mkPass(0, 4, 45), mkPass(1, 5, 40), mkPass(0, 3, 20, 30),
  ]

  return {
    storeId: null,
    storeName: '강남 1호점',
    operatorName: '매니저1',
    lockPin: null,
    passTypes,
    passes,
    passLog: [
      { id: uid(), ts: now - 2 * 3_600_000, action: '사용', typeName: '1,000P', memberId: members[0].id, detail: '이용권 사용 처리', operator: '매니저1' },
      { id: uid(), ts: now - 3 * DAY, action: '발급', typeName: '10,000P', memberId: members[3].id, detail: '10,000P × 1', operator: '매니저1' },
    ] as PassLogEntry[],
    bizResetAt: now - 5 * 3_600_000,
    rpLog: [] as RpLogEntry[],
    wallet,
    members,
    managers: [{ id: uid(), loginId: 'manager1', name: '매니저1', role: 'manager' }] as Manager[],
    gameSets: [gameSet],
    games: [game, finished],
    ledger,
    events: [
      {
        id: uid(),
        title: '안녕하세요, 올인원입니다. 8월 업데이트 노트입니다.',
        body: '시즌 랭킹 화면이 개편되었습니다. 매장 현황에서 전광판 공유 기능을 사용해보세요.',
        createdAt: now - 20 * DAY,
      },
    ] as EventPost[],
    seasons: [{ id: uid(), name: '시즌 1', startedAt: now - 60 * DAY, status: 'open' }] as Season[],
    tables: [
      { no: 1, seats: 9 }, { no: 2, seats: 11 }, { no: 3, seats: 9 },
      { no: 4, seats: 9 }, { no: 5, seats: 11 },
    ] as TableInfo[],
    waitlist: [
      { id: uid(), memberId: members[5].id, status: 'waiting', source: 'qr', arrivedAt: now - 10 * 60_000 },
    ] as WaitEntry[],
    auditLog: [],
    ledgerRange: defaultRange(),
    historyRange: defaultRange(),
  }
}
