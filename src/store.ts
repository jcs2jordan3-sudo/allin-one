import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { CLIENT_ID, hasSupabase, supabase } from './lib/supabase'
import type {
  BuyinType, Currency, EventPost, Game, GameSet, LedgerEntry,
  Manager, Member, Pass, PassLogEntry, PassType, RpLogEntry, Season, TableInfo,
} from './types'
import { CURRENCY_UNIT } from './types'
import { gameElapsedMs, isRegClosed, levelAt, levelStartMs } from './lib/time'

const uid = () => crypto.randomUUID().slice(0, 8)

const STORE_KEY = 'allinone-store-v1'

// ── 동기화 상태 (헤더 배지용, 영속화하지 않음) ────────────────────────────

export type SyncStatus = 'local' | 'connecting' | 'synced' | 'error'
export const useSyncStatus = create<{ status: SyncStatus }>(() => ({
  status: hasSupabase ? 'connecting' : 'local',
}))

// ── 세션 잠금 (브라우저 세션 단위, 영속화하지 않음) ───────────────────────

export const useSession = create<{ unlocked: boolean; unlock: () => void; lock: () => void }>((set) => ({
  unlocked: typeof sessionStorage !== 'undefined' && sessionStorage.getItem('allinone-unlocked') === '1',
  unlock: () => {
    sessionStorage.setItem('allinone-unlocked', '1')
    set({ unlocked: true })
  },
  lock: () => {
    sessionStorage.removeItem('allinone-unlocked')
    set({ unlocked: false })
  },
}))

// ── 클라우드 저장소 어댑터 ────────────────────────────────────────────────
// Supabase 설정 시: localStorage(오프라인 캐시) + app_state 테이블(원본) 이중 기록.
// 미설정 시: localStorage 전용 로컬 모드.

let applyingRemote = false // 원격 상태 적용 중에는 클라우드로 되쓰기 금지 (핑퐁 방지)

const cloudStorage: StateStorage = {
  async getItem(name) {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('app_state')
          .select('state')
          .eq('store_key', name)
          .maybeSingle()
        if (error) throw error
        if (data?.state) {
          const raw = JSON.stringify(data.state)
          localStorage.setItem(name, raw)
          return raw
        }
        // 클라우드가 비어 있으면 로컬 데이터를 승격(첫 연결 시 마이그레이션)
      } catch {
        useSyncStatus.setState({ status: 'error' })
      }
    }
    return localStorage.getItem(name)
  },
  async setItem(name, value) {
    localStorage.setItem(name, value)
    if (!supabase || applyingRemote) return
    try {
      const { error } = await supabase.from('app_state').upsert({
        store_key: name,
        state: JSON.parse(value),
        writer: CLIENT_ID,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      useSyncStatus.setState({ status: 'synced' })
    } catch {
      useSyncStatus.setState({ status: 'error' })
    }
  },
  async removeItem(name) {
    localStorage.removeItem(name)
    if (supabase) await supabase.from('app_state').delete().eq('store_key', name)
  },
}

// ── 시드 데이터 ────────────────────────────────────────────────────────────

const now = Date.now()
const DAY = 86_400_000

const seedGameSet = (): GameSet => ({
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

const mk = (
  no: string, nickname: string, emoji: string, color: string,
  p: number, s: number, v: number, rp: number, daysAgo: number,
): Member => ({
  id: uid(), no, nickname, emoji, color,
  balances: { P: p, S: s, V: v }, rp,
  joinedAt: now - daysAgo * DAY, status: 'active',
})

function seedState() {
  const gameSet = seedGameSet()
  const members: Member[] = [
    mk('0001', '에이스', '😎', '#E9BB56', 1_019_991, 1_000_000, 15, 400_000, 90),
    mk('0002', '리버킹', '🦈', '#57B6F2', 999_998, 1_050_000, 8, 200_000, 75),
    mk('0003', '블러프', '🎭', '#A98BF5', 999_998, 1_000_000, 8, 60_000, 60),
    mk('0004', '칩리더', '🐯', '#F2A65A', 999_995, 1_000_000, 12, 60_000, 45),
    mk('0005', '포카리', '🐳', '#4FD1C5', 999_996, 1_000_000, 4, 20_000, 20),
    mk('0006', '올인맨', '🔥', '#F26D76', 969_992, 1_000_000, 9, 10_000, 7),
  ]

  const wallet: Record<Currency, number> = { P: 94_000_030, S: 93_950_000, V: 944 }

  const ledger: LedgerEntry[] = [
    {
      id: uid(), ts: now - 30 * DAY, currency: 'P', amount: 100_000_000,
      from: 'hq', to: 'store', reason: '초기 포인트 발행', storeBalanceAfter: 100_000_000,
    },
    {
      id: uid(), ts: now - 30 * DAY, currency: 'S', amount: 100_000_000,
      from: 'hq', to: 'store', reason: '초기 시드 발행', storeBalanceAfter: 100_000_000,
    },
    {
      id: uid(), ts: now - 30 * DAY, currency: 'V', amount: 1_000,
      from: 'hq', to: 'store', reason: '음료권 발행', storeBalanceAfter: 1_000,
    },
    {
      id: uid(), ts: now - 2 * DAY, currency: 'P', amount: 1,
      from: 'store', to: members[3].id, reason: '이벤트 지급', operator: '매니저1',
      storeBalanceAfter: 94_000_031,
    },
    {
      id: uid(), ts: now - 1 * DAY, currency: 'P', amount: 1,
      from: 'store', to: members[1].id, reason: '이벤트 지급', operator: '매니저1',
      storeBalanceAfter: 94_000_030,
    },
  ]

  // 진행 중 데모 게임 (5분 전 시작)
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
  }

  // 이용권 시드: 사용/미사용/만료가 섞인 상태
  const passTypes: PassType[] = [
    { id: uid(), name: '1,000P', validDays: 30, color: '#57B6F2' },
    { id: uid(), name: '10,000P', validDays: 30, color: '#E9BB56' },
    { id: uid(), name: '하이롤러', validDays: 60, color: '#A98BF5' },
  ]
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
    mkPass(0, 0, 10, 2), // 오늘 사용
    mkPass(0, 1, 10, 3),
    mkPass(1, 0, 5, 1),
    mkPass(0, 2, 3), // 미사용 (유효)
    mkPass(1, 3, 3),
    mkPass(2, 1, 7),
    mkPass(0, 4, 45), // 만료 (30일 초과)
    mkPass(1, 5, 40),
    mkPass(0, 3, 20, 30), // 지난주 사용
  ]

  return {
    storeName: '강남 1호점',
    operatorName: '매니저1',
    lockPin: null as string | null,
    passTypes,
    passes,
    passLog: [
      {
        id: uid(), ts: now - 2 * 3_600_000, action: '사용' as const,
        typeName: '1,000P', memberId: members[0].id, detail: '이용권 사용 처리', operator: '매니저1',
      },
      {
        id: uid(), ts: now - 3 * DAY, action: '발급' as const,
        typeName: '10,000P', memberId: members[3].id, detail: '10,000P × 1', operator: '매니저1',
      },
    ] as PassLogEntry[],
    bizResetAt: now - 5 * 3_600_000,
    rpLog: [] as RpLogEntry[],
    wallet,
    members,
    managers: [{ id: uid(), loginId: 'manager1', name: '매니저1' }] as Manager[],
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
    waitingCount: 1,
  }
}

// ── 스토어 ────────────────────────────────────────────────────────────────

type SeedState = ReturnType<typeof seedState>

export interface Actions {
  // 재화
  transferToMember: (memberId: string, c: Currency, amount: number, reason?: string, gameId?: string) => string | null
  reclaimFromMember: (memberId: string, c: Currency, amount: number, reason: string) => string | null
  // 회원
  addMember: (nickname: string, emoji: string, color: string, phone?: string) => void
  updateMember: (id: string, patch: Partial<Member>) => void
  leaveMember: (id: string) => void
  adjustRp: (memberId: string, delta: number, reason: string) => string | null
  // 매니저
  addManager: (loginId: string, name: string) => void
  updateManager: (id: string, patch: Partial<Manager>) => void
  removeManager: (id: string) => void
  // 게임 셋
  saveGameSet: (set: GameSet) => void
  duplicateGameSet: (id: string) => void
  removeGameSet: (id: string) => void
  // 게임
  createGame: (name: string, gameSetId: string, tables: number[], opts?: { startAt?: number; notice?: string }) => string | null
  cancelGame: (id: string) => void
  pauseGame: (id: string) => void
  resumeGame: (id: string) => void
  closeReg: (id: string) => void
  adjustToLevel: (id: string, levelIdx: number) => void
  updateGame: (id: string, patch: { name?: string; notice?: string; prizes?: import('./types').PrizeRule[] }) => void
  adjustChips: (id: string, kind: 'correction' | 'addon', chips: number) => string | null
  joinGame: (gameId: string, memberId: string, type: BuyinType, currency: Currency) => string | null
  eliminate: (gameId: string, memberId: string) => void
  moveSeat: (gameId: string, memberId: string, table: number, seat: number) => void
  endGame: (gameId: string, ranking?: string[]) => void
  issueToStore: (c: Currency, amount: number, reason: string) => string | null
  resetData: (mode: 'empty' | 'demo') => void
  setLockPin: (pin: string | null) => void
  // 이용권
  savePassType: (t: PassType) => void
  removePassType: (id: string) => string | null
  issuePasses: (typeId: string, memberId: string, count: number) => string | null
  usePass: (passId: string) => string | null
  extendPass: (passId: string, days: number) => string | null
  revokePass: (passId: string) => string | null
  resetBizDay: () => void
  // 기타
  setWaiting: (n: number) => void
  saveTables: (tables: TableInfo[]) => void
  saveEvent: (post: Partial<EventPost> & { title: string; body: string }) => void
  removeEvent: (id: string) => void
  closeSeason: () => void
  settleSeason: (rewards: number[]) => void
  startSeason: (name: string) => void
}

export type Store = SeedState & Actions

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...seedState(),

      transferToMember(memberId, c, amount, reason, gameId) {
        const st = get()
        if (amount <= 0) return '수량은 1 이상이어야 합니다.'
        if (st.wallet[c] < amount) return '지점 보유량이 부족합니다.'
        const m = st.members.find((x) => x.id === memberId)
        if (!m) return '회원을 찾을 수 없습니다.'
        const bal = st.wallet[c] - amount
        set({
          wallet: { ...st.wallet, [c]: bal },
          members: st.members.map((x) =>
            x.id === memberId ? { ...x, balances: { ...x.balances, [c]: x.balances[c] + amount } } : x,
          ),
          ledger: [
            {
              id: uid(), ts: Date.now(), currency: c, amount,
              from: 'store', to: memberId, reason, operator: st.operatorName, gameId,
              storeBalanceAfter: bal,
            },
            ...st.ledger,
          ],
        })
        return null
      },

      reclaimFromMember(memberId, c, amount, reason) {
        const st = get()
        if (amount <= 0) return '수량은 1 이상이어야 합니다.'
        const m = st.members.find((x) => x.id === memberId)
        if (!m) return '회원을 찾을 수 없습니다.'
        if (m.balances[c] < amount) return `${m.nickname}님의 보유량이 부족합니다.`
        const bal = get().wallet[c] + amount
        set({
          wallet: { ...st.wallet, [c]: bal },
          members: st.members.map((x) =>
            x.id === memberId ? { ...x, balances: { ...x.balances, [c]: x.balances[c] - amount } } : x,
          ),
          ledger: [
            {
              id: uid(), ts: Date.now(), currency: c, amount,
              from: memberId, to: 'store', reason, operator: st.operatorName,
              storeBalanceAfter: bal,
            },
            ...st.ledger,
          ],
        })
        return null
      },

      addMember(nickname, emoji, color, phone) {
        const st = get()
        const used = new Set(st.members.map((m) => m.no))
        let n = st.members.length + 1
        while (used.has(String(n).padStart(4, '0'))) n++
        set({
          members: [
            {
              id: uid(), no: String(n).padStart(4, '0'), nickname, emoji, color, phone,
              balances: { P: 0, S: 0, V: 0 }, rp: 0, joinedAt: Date.now(), status: 'active',
            },
            ...st.members,
          ],
        })
      },

      updateMember(id, patch) {
        set({ members: get().members.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
      },

      leaveMember(id) {
        // 탈퇴: 잔액을 지점으로 전액 환수 후 상태 변경
        const st = get()
        const m = st.members.find((x) => x.id === id)
        if (!m) return
        for (const c of ['P', 'S', 'V'] as Currency[]) {
          if (m.balances[c] > 0) get().reclaimFromMember(id, c, m.balances[c], '회원 탈퇴 잔액 환수')
        }
        set({ members: get().members.map((x) => (x.id === id ? { ...x, status: 'left' } : x)) })
      },

      adjustRp(memberId, delta, reason) {
        const st = get()
        const m = st.members.find((x) => x.id === memberId)
        if (!m) return '회원을 찾을 수 없습니다.'
        if (!delta) return '수량을 입력해주세요.'
        if (!reason.trim()) return '사유를 입력해주세요. (수동 RP 조정은 사유 필수)'
        if (m.rp + delta < 0) return `${m.nickname}님의 RP가 부족합니다.`
        set({
          members: st.members.map((x) => (x.id === memberId ? { ...x, rp: x.rp + delta } : x)),
          rpLog: [
            { id: uid(), ts: Date.now(), memberId, delta, reason: reason.trim(), operator: st.operatorName },
            ...(st.rpLog ?? []),
          ],
        })
        return null
      },

      addManager(loginId, name) {
        set({ managers: [...get().managers, { id: uid(), loginId, name }] })
      },
      updateManager(id, patch) {
        set({ managers: get().managers.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
      },
      removeManager(id) {
        set({ managers: get().managers.filter((m) => m.id !== id) })
      },

      saveGameSet(gs) {
        const st = get()
        const exists = st.gameSets.some((x) => x.id === gs.id)
        set({ gameSets: exists ? st.gameSets.map((x) => (x.id === gs.id ? gs : x)) : [...st.gameSets, gs] })
      },
      duplicateGameSet(id) {
        const src = get().gameSets.find((x) => x.id === id)
        if (!src) return
        const copy: GameSet = JSON.parse(JSON.stringify(src))
        copy.id = uid()
        copy.name = `${src.name} (복사본)`
        set({ gameSets: [...get().gameSets, copy] })
      },
      removeGameSet(id) {
        set({ gameSets: get().gameSets.filter((x) => x.id !== id) })
      },

      createGame(name, gameSetId, tables, opts) {
        const st = get()
        const gs = st.gameSets.find((x) => x.id === gameSetId)
        if (!gs) return '게임 셋을 선택해주세요.'
        if (tables.length === 0) return '테이블을 1개 이상 선택해주세요.'
        // 진행·예약 중인 게임이 점유한 테이블은 사용 불가
        const occupied = new Set(
          st.games.filter((x) => x.status !== 'ended').flatMap((x) => x.tables),
        )
        const conflict = tables.filter((t) => occupied.has(t))
        if (conflict.length > 0) return `TABLE ${conflict.join(', ')}은(는) 다른 게임에서 사용 중입니다.`
        if (opts?.startAt && opts.startAt < Date.now() - 60_000) return '시작 시간이 이미 지났습니다.'
        const g: Game = {
          id: uid(), name, gameSetName: gs.name,
          snapshot: JSON.parse(JSON.stringify(gs)),
          status: 'running', startedAt: opts?.startAt ?? Date.now(), pausedTotal: 0,
          entries: [], buyins: [], tables,
          notice: opts?.notice || undefined,
        }
        set({ games: [g, ...st.games] })
        return null
      },

      cancelGame(id) {
        const st = get()
        const g = st.games.find((x) => x.id === id)
        if (!g || g.cancelled) return
        const wasEnded = g.status === 'ended'
        // 1) 참가비 환불 (바인 이벤트 역거래)
        for (const b of g.buyins) {
          get().transferToMember(b.memberId, b.currency, b.cost, `${g.name} 취소 — 참가비 환불`, id)
        }
        if (wasEnded) {
          for (const e of g.entries) {
            if (!e.rank) continue
            // 2) 지급된 프라이즈 회수
            const prize = g.snapshot.prizes.find((p) => p.rank === e.rank)
            if (prize) get().reclaimFromMember(e.memberId, prize.currency, prize.amount, `${g.name} 취소 — 프라이즈 회수`)
            // 3) 지급된 RP 역거래
            const rp = g.snapshot.rpByRank[e.rank - 1]
            if (rp) {
              set({
                members: get().members.map((m) =>
                  m.id === e.memberId ? { ...m, rp: Math.max(0, m.rp - rp) } : m,
                ),
              })
            }
          }
        }
        set({
          games: get().games.map((x) =>
            x.id === id
              ? { ...x, status: 'ended' as const, endedAt: x.endedAt ?? Date.now(), cancelled: true }
              : x,
          ),
        })
      },

      pauseGame(id) {
        set({
          games: get().games.map((g) =>
            g.id === id && g.status === 'running' ? { ...g, status: 'paused', pausedAt: Date.now() } : g,
          ),
        })
      },

      resumeGame(id) {
        set({
          games: get().games.map((g) =>
            g.id === id && g.status === 'paused' && g.pausedAt
              ? { ...g, status: 'running', pausedAt: undefined, pausedTotal: g.pausedTotal + (Date.now() - g.pausedAt) }
              : g,
          ),
        })
      },

      closeReg(id) {
        set({ games: get().games.map((g) => (g.id === id ? { ...g, regClosedManual: true } : g)) })
      },

      adjustToLevel(id, levelIdx) {
        set({
          games: get().games.map((g) => {
            if (g.id !== id) return g
            const target = levelStartMs(g.snapshot.levels, levelIdx)
            const ref = g.status === 'paused' && g.pausedAt ? g.pausedAt : Date.now()
            return { ...g, startedAt: ref - g.pausedTotal - target }
          }),
        })
      },

      updateGame(id, patch) {
        set({
          games: get().games.map((g) => {
            if (g.id !== id || g.status === 'ended') return g
            return {
              ...g,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.notice !== undefined ? { notice: patch.notice || undefined } : {}),
              ...(patch.prizes !== undefined ? { snapshot: { ...g.snapshot, prizes: patch.prizes } } : {}),
            }
          }),
        })
      },

      adjustChips(id, kind, chips) {
        const st = get()
        const g = st.games.find((x) => x.id === id)
        if (!g || g.status === 'ended') return '진행 중인 게임이 아닙니다.'
        if (kind === 'addon' && chips <= 0) return '애드온 칩은 1 이상이어야 합니다.'
        const base = selTotalChips(g)
        if (kind === 'correction' && base + chips < 0) return '보정 후 전체 칩이 음수가 될 수 없습니다.'
        set({
          games: st.games.map((x) =>
            x.id === id
              ? kind === 'correction'
                ? { ...x, chipCorrection: (x.chipCorrection ?? 0) + chips, correctionCount: (x.correctionCount ?? 0) + 1 }
                : { ...x, addonChips: (x.addonChips ?? 0) + chips, addonCount: (x.addonCount ?? 0) + 1 }
              : x,
          ),
        })
        return null
      },

      joinGame(gameId, memberId, type, currency) {
        const st = get()
        const g = st.games.find((x) => x.id === gameId)
        const m = st.members.find((x) => x.id === memberId)
        if (!g || !m) return '게임 또는 회원을 찾을 수 없습니다.'
        if (g.status === 'ended') return '종료된 게임입니다.'
        const nowTs = Date.now()
        if (isRegClosed(g, nowTs)) return '레지스트레이션이 마감된 게임입니다.'

        const entry = g.entries.find((e) => e.memberId === memberId)
        if (type === 'BUYIN' && entry) return '이미 참가한 회원입니다. 리바인 또는 리엔트리를 사용하세요.'
        if (type === 'RE_BUYIN' && (!entry || entry.status !== 'playing')) return '참여 중인 회원만 리바인할 수 있습니다.'
        if (type === 'RE_ENTRY' && (!entry || entry.status !== 'eliminated')) return '탈락한 회원만 리엔트리할 수 있습니다.'

        const round = type === 'BUYIN' ? 1 : g.buyins.filter((b) => b.memberId === memberId && b.type === type).length + 1
        const rule = g.snapshot.buyinRules.find((r) => r.type === type && r.round === round)
        if (!rule) return `${round}회차 ${type === 'RE_BUYIN' ? '리바인' : type === 'RE_ENTRY' ? '리엔트리' : '바인'} 규칙이 없습니다 (한도 초과).`
        const cost = rule.cost[currency]
        if (cost === undefined) return '이 게임에서 사용할 수 없는 재화입니다.'
        if (m.balances[currency] < cost) return `${m.nickname}님의 ${CURRENCY_UNIT[currency]} 잔액이 부족합니다.`

        // 참가비 결제 (회원 → 지점)
        const err = get().reclaimFromMember(memberId, currency, cost, `${g.name} ${type === 'BUYIN' ? '바인' : type === 'RE_BUYIN' ? '리바인' : '리엔트리'}`)
        if (err) return err

        // 얼리버드: 현재 레벨 기준, 리바인에는 미적용
        const pos = levelAt(g.snapshot.levels, gameElapsedMs(g, nowTs))
        const eb = type !== 'RE_BUYIN' ? g.snapshot.earlyBird.find((r) => r.levelIndex === pos.idx) : undefined

        // 좌석 배정 (신규/리엔트리)
        const cur = get()
        const game = cur.games.find((x) => x.id === gameId)!
        let entries = game.entries
        if (type === 'BUYIN' || type === 'RE_ENTRY') {
          const counts = new Map<number, number>(game.tables.map((t) => [t, 0]))
          for (const e of entries) if (e.status === 'playing') counts.set(e.table, (counts.get(e.table) ?? 0) + 1)
          const targetTable = [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0]
          const tinfo = cur.tables.find((t) => t.no === targetTable)
          const usedSeats = new Set(entries.filter((e) => e.table === targetTable && e.status === 'playing').map((e) => e.seat))
          let seat = 1
          while (usedSeats.has(seat) && seat <= (tinfo?.seats ?? 9)) seat++
          if (type === 'BUYIN') {
            entries = [...entries, { memberId, table: targetTable, seat, status: 'playing' as const }]
          } else {
            entries = entries.map((e) =>
              e.memberId === memberId ? { ...e, table: targetTable, seat, status: 'playing' as const, rank: undefined, outAt: undefined } : e,
            )
          }
        }

        set({
          games: cur.games.map((x) =>
            x.id === gameId
              ? {
                  ...x,
                  entries,
                  buyins: [
                    ...x.buyins,
                    {
                      id: uid(), ts: nowTs, memberId, type, round, currency, cost,
                      chips: rule.chips, earlyBirdChips: eb?.chips,
                    },
                  ],
                }
              : x,
          ),
        })
        return null
      },

      eliminate(gameId, memberId) {
        const st = get()
        const g = st.games.find((x) => x.id === gameId)
        if (!g) return
        const playing = g.entries.filter((e) => e.status === 'playing').length
        set({
          games: st.games.map((x) =>
            x.id === gameId
              ? {
                  ...x,
                  entries: x.entries.map((e) =>
                    e.memberId === memberId && e.status === 'playing'
                      ? { ...e, status: 'eliminated' as const, rank: playing, outAt: Date.now() }
                      : e,
                  ),
                }
              : x,
          ),
        })
      },

      moveSeat(gameId, memberId, table, seat) {
        set({
          games: get().games.map((g) =>
            g.id === gameId
              ? { ...g, entries: g.entries.map((e) => (e.memberId === memberId ? { ...e, table, seat } : e)) }
              : g,
          ),
        })
      },

      endGame(gameId, ranking) {
        const st = get()
        const g = st.games.find((x) => x.id === gameId)
        if (!g || g.status === 'ended') return
        // 남은 참가자 순위: 지정된 순서(1위부터) 우선, 없으면 좌석 순 폴백
        const playing = g.entries.filter((e) => e.status === 'playing')
        const ranked = ranking
          ? ranking
              .map((id) => playing.find((e) => e.memberId === id))
              .filter((e): e is (typeof playing)[number] => !!e)
          : [...playing].sort((a, b) => a.table - b.table || a.seat - b.seat)
        const entries = g.entries.map((e) => {
          const i = ranked.findIndex((r) => r.memberId === e.memberId)
          return i >= 0 ? { ...e, status: 'eliminated' as const, rank: i + 1, outAt: Date.now() } : e
        })
        set({
          games: st.games.map((x) =>
            x.id === gameId ? { ...x, entries, status: 'ended' as const, endedAt: Date.now() } : x,
          ),
        })
        // 프라이즈 + RP 지급
        const cur = get()
        for (const e of entries) {
          if (!e.rank) continue
          const prize = g.snapshot.prizes.find((p) => p.rank === e.rank)
          if (prize) cur.transferToMember(e.memberId, prize.currency, prize.amount, `${g.name} ${e.rank}위 프라이즈`, gameId)
          const rp = g.snapshot.rpByRank[e.rank - 1]
          if (rp) {
            set({
              members: get().members.map((m) => (m.id === e.memberId ? { ...m, rp: m.rp + rp } : m)),
            })
          }
        }
      },

      savePassType(t) {
        const st = get()
        const exists = st.passTypes.some((x) => x.id === t.id)
        set({ passTypes: exists ? st.passTypes.map((x) => (x.id === t.id ? t : x)) : [...st.passTypes, t] })
      },

      removePassType(id) {
        const st = get()
        if (st.passes.some((p) => p.typeId === id && p.status === 'unused')) {
          return '미사용 이용권이 남아 있는 유형은 삭제할 수 없습니다.'
        }
        set({ passTypes: st.passTypes.filter((x) => x.id !== id) })
        return null
      },

      issuePasses(typeId, memberId, count) {
        const st = get()
        const t = st.passTypes.find((x) => x.id === typeId)
        const m = st.members.find((x) => x.id === memberId)
        if (!t || !m) return '유형 또는 회원을 찾을 수 없습니다.'
        if (count < 1 || count > 100) return '발급 수량은 1~100 사이여야 합니다.'
        const ts = Date.now()
        const created: Pass[] = Array.from({ length: count }, () => ({
          id: uid(), typeId, memberId, issuedAt: ts,
          expiresAt: ts + t.validDays * DAY, status: 'unused' as const,
        }))
        set({
          passes: [...created, ...st.passes],
          passLog: [
            { id: uid(), ts, action: '발급' as const, typeName: t.name, memberId, detail: `${t.name} × ${count}`, operator: st.operatorName },
            ...st.passLog,
          ],
        })
        return null
      },

      usePass(passId) {
        const st = get()
        const p = st.passes.find((x) => x.id === passId)
        if (!p) return '이용권을 찾을 수 없습니다.'
        if (p.status !== 'unused') return '이미 사용되었거나 회수된 이용권입니다.'
        const ts = Date.now()
        if (ts > p.expiresAt) return '만료된 이용권입니다. 연장 후 사용 처리하세요.'
        const t = st.passTypes.find((x) => x.id === p.typeId)
        set({
          passes: st.passes.map((x) => (x.id === passId ? { ...x, status: 'used' as const, usedAt: ts } : x)),
          passLog: [
            { id: uid(), ts, action: '사용' as const, typeName: t?.name, memberId: p.memberId, operator: st.operatorName },
            ...st.passLog,
          ],
        })
        return null
      },

      extendPass(passId, days) {
        const st = get()
        const p = st.passes.find((x) => x.id === passId)
        if (!p) return '이용권을 찾을 수 없습니다.'
        if (p.status !== 'unused') return '미사용 상태의 이용권만 연장할 수 있습니다.'
        if (days < 1 || days > 365) return '연장 일수는 1~365 사이여야 합니다.'
        const ts = Date.now()
        const base = Math.max(ts, p.expiresAt) // 만료된 권은 오늘부터 재시작
        const t = st.passTypes.find((x) => x.id === p.typeId)
        set({
          passes: st.passes.map((x) => (x.id === passId ? { ...x, expiresAt: base + days * DAY } : x)),
          passLog: [
            { id: uid(), ts, action: '연장' as const, typeName: t?.name, memberId: p.memberId, detail: `+${days}일`, operator: st.operatorName },
            ...st.passLog,
          ],
        })
        return null
      },

      revokePass(passId) {
        const st = get()
        const p = st.passes.find((x) => x.id === passId)
        if (!p) return '이용권을 찾을 수 없습니다.'
        if (p.status !== 'unused') return '미사용 상태의 이용권만 회수할 수 있습니다.'
        const ts = Date.now()
        const t = st.passTypes.find((x) => x.id === p.typeId)
        set({
          passes: st.passes.map((x) => (x.id === passId ? { ...x, status: 'revoked' as const } : x)),
          passLog: [
            { id: uid(), ts, action: '회수' as const, typeName: t?.name, memberId: p.memberId, operator: st.operatorName },
            ...st.passLog,
          ],
        })
        return null
      },

      resetBizDay() {
        const st = get()
        const ts = Date.now()
        set({
          bizResetAt: ts,
          passLog: [
            { id: uid(), ts, action: '집계 초기화' as const, operator: st.operatorName },
            ...st.passLog,
          ],
        })
      },

      issueToStore(c, amount, reason) {
        const st = get()
        if (amount <= 0) return '수량은 1 이상이어야 합니다.'
        if (!reason.trim()) return '사유를 입력해주세요.'
        const bal = st.wallet[c] + amount
        set({
          wallet: { ...st.wallet, [c]: bal },
          ledger: [
            {
              id: uid(), ts: Date.now(), currency: c, amount,
              from: 'hq', to: 'store', reason: reason.trim(), operator: st.operatorName,
              storeBalanceAfter: bal,
            },
            ...st.ledger,
          ],
        })
        return null
      },

      resetData(mode) {
        const keepPin = get().lockPin
        const seed = seedState()
        if (mode === 'demo') {
          set({ ...seed, lockPin: keepPin })
          return
        }
        // 빈 상태: 게임 셋·이용권 유형·테이블·매니저 등 구조만 유지, 데이터는 전부 비움
        set({
          ...seed,
          members: [],
          games: [],
          ledger: [],
          events: [],
          passes: [],
          passLog: [],
          wallet: { P: 0, S: 0, V: 0 },
          seasons: [{ id: uid(), name: '시즌 1', startedAt: Date.now(), status: 'open' as const }],
          waitingCount: 0,
          bizResetAt: Date.now(),
          lockPin: keepPin,
        })
      },

      setLockPin(pin) {
        set({ lockPin: pin })
      },

      setWaiting(n) {
        set({ waitingCount: Math.max(0, n) })
      },
      saveTables(tables) {
        set({ tables })
      },

      saveEvent(post) {
        const st = get()
        if (post.id) {
          set({ events: st.events.map((e) => (e.id === post.id ? { ...e, title: post.title, body: post.body } : e)) })
        } else {
          set({ events: [{ id: uid(), title: post.title, body: post.body, createdAt: Date.now() }, ...st.events] })
        }
      },
      removeEvent(id) {
        set({ events: get().events.filter((e) => e.id !== id) })
      },

      closeSeason() {
        const st = get()
        const season = st.seasons.find((s) => s.status === 'open')
        if (!season) return
        const ranked = [...st.members]
          .filter((m) => m.status === 'active' && m.rp > 0)
          .sort((a, b) => b.rp - a.rp)
          .map((m, i) => ({
            memberId: m.id, nickname: m.nickname, emoji: m.emoji, color: m.color, rp: m.rp, rank: i + 1,
          }))
        set({
          seasons: st.seasons.map((s) =>
            s.id === season.id ? { ...s, status: 'closed' as const, closedAt: Date.now(), results: ranked } : s,
          ),
        })
      },

      settleSeason(rewards) {
        // 전송 및 환수: 마감된 시즌 결과에 보상 지급 + 전 회원 RP 리셋
        const st = get()
        const season = st.seasons.find((s) => s.status === 'closed')
        if (!season?.results) return
        for (const r of season.results) {
          const reward = rewards[r.rank - 1]
          if (reward) get().transferToMember(r.memberId, 'P', reward, `${season.name} ${r.rank}위 시즌 보상`)
        }
        set({
          seasons: get().seasons.map((s) =>
            s.id === season.id
              ? {
                  ...s,
                  status: 'settled' as const,
                  results: s.results?.map((r) => ({ ...r, paid: rewards[r.rank - 1] ?? 0 })),
                }
              : s,
          ),
          members: get().members.map((m) => ({ ...m, rp: 0 })),
        })
      },

      startSeason(name) {
        set({ seasons: [{ id: uid(), name, startedAt: Date.now(), status: 'open' }, ...get().seasons] })
      },
    }),
    {
      name: STORE_KEY,
      version: 3,
      storage: createJSONStorage(() => cloudStorage),
      // 이전 버전 저장분 마이그레이션: 없는 필드를 보충
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown> & { members?: Member[]; passTypes?: PassType[] }
        if (state && !state.passTypes) {
          const seed = seedState()
          const memberIds = (state.members ?? []).map((m) => m.id)
          state.passTypes = seed.passTypes
          state.passes = memberIds.length
            ? seed.passes.map((p, i) => ({ ...p, memberId: memberIds[i % memberIds.length] }))
            : []
          state.passLog = []
          state.bizResetAt = Date.now() - 5 * 3_600_000
        }
        if (state && !state.rpLog) state.rpLog = []
        return state as never
      },
    },
  ),
)

// ── 실시간 동기화 (Supabase Realtime) ─────────────────────────────────────
// 다른 기기(콘솔 PC ↔ TV 전광판)의 변경을 수신해 즉시 반영.

declare global {
  interface Window {
    __allinoneSyncStarted?: boolean
  }
}

if (supabase && typeof window !== 'undefined' && !window.__allinoneSyncStarted) {
  window.__allinoneSyncStarted = true // HMR로 중복 구독 방지

  useStore.persist.onFinishHydration(() => {
    if (useSyncStatus.getState().status === 'connecting') {
      useSyncStatus.setState({ status: 'synced' })
    }
  })

  supabase
    .channel('allinone-app-state')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_state', filter: `store_key=eq.${STORE_KEY}` },
      (payload) => {
        const row = payload.new as { state?: { state?: Partial<Store>; version?: number }; writer?: string } | null
        if (!row?.state?.state || row.writer === CLIENT_ID) return
        applyingRemote = true
        try {
          useStore.setState(row.state.state as never)
          localStorage.setItem(STORE_KEY, JSON.stringify(row.state))
        } finally {
          applyingRemote = false
        }
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') useSyncStatus.setState({ status: 'synced' })
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') useSyncStatus.setState({ status: 'error' })
    })
}

// ── 파생 셀렉터 ───────────────────────────────────────────────────────────

export const selMemberById = (st: Store, id: string) => st.members.find((m) => m.id === id)

export const selPlayingCount = (st: Store) =>
  st.games
    .filter((g) => g.status !== 'ended')
    .reduce((acc, g) => acc + g.entries.filter((e) => e.status === 'playing').length, 0)

export const selTotalChips = (g: Game) =>
  g.buyins.reduce((acc, b) => acc + b.chips + (b.earlyBirdChips ?? 0), 0) +
  (g.chipCorrection ?? 0) +
  (g.addonChips ?? 0)
