// 로컬 모드 스토어 — Supabase 키가 없을 때. 모든 데이터는 이 브라우저의 localStorage에 저장된다.

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Currency, Game, GameSet, Member, PassType } from '../types'
import { CURRENCY_UNIT } from '../types'
import { gameElapsedMs, isRegClosed, levelAt, levelStartMs } from '../lib/time'
import { localOnlyActions } from './console'
import { defaultLocalExtras, seedState, uid } from './seed'
import { selTotalChips } from './selectors'
import { useReady } from './status'
import type { Actions, GetState, LocalOnlyKey, SetState, Store } from './types'

const STORE_KEY = 'allinone-store-v1'

function coreActions(set: SetState, get: GetState): Omit<Actions, LocalOnlyKey> {
  return {
    async transferToMember(memberId, c, amount, reason, gameId) {
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
          { id: uid(), ts: Date.now(), currency: c, amount, from: 'store', to: memberId, reason, operator: st.operatorName, gameId, storeBalanceAfter: bal },
          ...st.ledger,
        ],
      })
      return null
    },

    async reclaimFromMember(memberId, c, amount, reason) {
      const st = get()
      if (amount <= 0) return '수량은 1 이상이어야 합니다.'
      const m = st.members.find((x) => x.id === memberId)
      if (!m) return '회원을 찾을 수 없습니다.'
      if (m.balances[c] < amount) return `${m.nickname}님의 보유량이 부족합니다.`
      const bal = st.wallet[c] + amount
      set({
        wallet: { ...st.wallet, [c]: bal },
        members: st.members.map((x) =>
          x.id === memberId ? { ...x, balances: { ...x.balances, [c]: x.balances[c] - amount } } : x,
        ),
        ledger: [
          { id: uid(), ts: Date.now(), currency: c, amount, from: memberId, to: 'store', reason, operator: st.operatorName, storeBalanceAfter: bal },
          ...st.ledger,
        ],
      })
      return null
    },

    async issueToStore(c, amount, reason) {
      const st = get()
      if (amount <= 0) return '수량은 1 이상이어야 합니다.'
      if (!reason.trim()) return '사유를 입력해주세요.'
      const bal = st.wallet[c] + amount
      set({
        wallet: { ...st.wallet, [c]: bal },
        ledger: [
          { id: uid(), ts: Date.now(), currency: c, amount, from: 'hq', to: 'store', reason: reason.trim(), operator: st.operatorName, storeBalanceAfter: bal },
          ...st.ledger,
        ],
      })
      return null
    },

    async addMember(nickname, emoji, color, phone) {
      const st = get()
      const used = new Set(st.members.map((m) => m.no))
      let n = st.members.length + 1
      while (used.has(String(n).padStart(4, '0'))) n++
      set({
        members: [
          { id: uid(), no: String(n).padStart(4, '0'), nickname, emoji, color, phone, balances: { P: 0, S: 0, V: 0 }, rp: 0, joinedAt: Date.now(), status: 'active' },
          ...st.members,
        ],
      })
      return null
    },

    async updateMember(id, patch) {
      set({ members: get().members.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
      return null
    },

    async leaveMember(id) {
      const st = get()
      const m = st.members.find((x) => x.id === id)
      if (!m) return '회원을 찾을 수 없습니다.'
      if (m.status === 'left') return null
      for (const c of ['P', 'S', 'V'] as Currency[]) {
        if (m.balances[c] > 0) await get().reclaimFromMember(id, c, m.balances[c], '회원 탈퇴 잔액 환수')
      }
      // 개인정보 익명화 — 원장 행은 익명 ID로 보존 (기획서 §6-9)
      set({
        members: get().members.map((x) =>
          x.id === id ? { ...x, status: 'left', nickname: `탈퇴회원 ${x.no}`, phone: undefined, realName: undefined, memo: undefined, emoji: '👤', color: '#64707f', linked: false } : x,
        ),
        waitlist: get().waitlist.map((w) => (w.memberId === id && ['waiting', 'called', 'seated'].includes(w.status) ? { ...w, status: 'left' as const, endedAt: Date.now() } : w)),
      })
      return null
    },

    async adjustRp(memberId, delta, reason) {
      const st = get()
      const m = st.members.find((x) => x.id === memberId)
      if (!m) return '회원을 찾을 수 없습니다.'
      if (!delta) return '수량을 입력해주세요.'
      if (!reason.trim()) return '사유를 입력해주세요. (수동 RP 조정은 사유 필수)'
      if (m.rp + delta < 0) return `${m.nickname}님의 RP가 부족합니다.`
      set({
        members: st.members.map((x) => (x.id === memberId ? { ...x, rp: x.rp + delta } : x)),
        rpLog: [{ id: uid(), ts: Date.now(), memberId, delta, reason: reason.trim(), operator: st.operatorName }, ...(st.rpLog ?? [])],
      })
      return null
    },

    async addManager(loginId, name, role) {
      set({ managers: [...get().managers, { id: uid(), loginId, name, role: role ?? 'manager' }] })
      return null
    },
    async updateManager(id, patch) {
      set({ managers: get().managers.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
      return null
    },
    async removeManager(id) {
      set({ managers: get().managers.filter((m) => m.id !== id) })
      return null
    },

    async saveGameSet(gs) {
      const st = get()
      const exists = st.gameSets.some((x) => x.id === gs.id)
      set({ gameSets: exists ? st.gameSets.map((x) => (x.id === gs.id ? gs : x)) : [...st.gameSets, gs] })
      return null
    },
    async duplicateGameSet(id) {
      const src = get().gameSets.find((x) => x.id === id)
      if (!src) return '게임 셋을 찾을 수 없습니다.'
      const copy: GameSet = JSON.parse(JSON.stringify(src))
      copy.id = uid()
      copy.name = `${src.name} (복사본)`
      set({ gameSets: [...get().gameSets, copy] })
      return null
    },
    async removeGameSet(id) {
      set({ gameSets: get().gameSets.filter((x) => x.id !== id) })
      return null
    },

    async createGame(name, gameSetId, tables, opts) {
      const st = get()
      const gs = st.gameSets.find((x) => x.id === gameSetId)
      if (!gs) return '게임 셋을 선택해주세요.'
      if (tables.length === 0) return '테이블을 1개 이상 선택해주세요.'
      const occupied = new Set(st.games.filter((x) => x.status !== 'ended').flatMap((x) => x.tables))
      const conflict = tables.filter((t) => occupied.has(t))
      if (conflict.length > 0) return `TABLE ${conflict.join(', ')}은(는) 다른 게임에서 사용 중입니다.`
      if (opts?.startAt && opts.startAt < Date.now() - 60_000) return '시작 시간이 이미 지났습니다.'
      const g: Game = {
        id: uid(), name, gameSetName: gs.name,
        snapshot: JSON.parse(JSON.stringify(gs)),
        status: 'running', startedAt: opts?.startAt ?? Date.now(), pausedTotal: 0,
        entries: [], buyins: [], tables,
        notice: opts?.notice || undefined,
        joinCode: uid(),
      }
      set({ games: [g, ...st.games] })
      return null
    },

    async cancelGame(id) {
      const st = get()
      const g = st.games.find((x) => x.id === id)
      if (!g || g.cancelled) return null
      const wasEnded = g.status === 'ended'
      for (const b of g.buyins) {
        await get().transferToMember(b.memberId, b.currency, b.cost, `${g.name} 취소 — 참가비 환불`, id)
      }
      if (wasEnded) {
        for (const e of g.entries) {
          if (!e.rank) continue
          const prize = g.snapshot.prizes.find((p) => p.rank === e.rank)
          if (prize) await get().reclaimFromMember(e.memberId, prize.currency, prize.amount, `${g.name} 취소 — 프라이즈 회수`)
          const rp = g.snapshot.rpByRank[e.rank - 1]
          if (rp) {
            set({ members: get().members.map((m) => (m.id === e.memberId ? { ...m, rp: Math.max(0, m.rp - rp) } : m)) })
          }
        }
      }
      set({
        games: get().games.map((x) =>
          x.id === id ? { ...x, status: 'ended' as const, endedAt: x.endedAt ?? Date.now(), cancelled: true } : x,
        ),
      })
      return null
    },

    async pauseGame(id) {
      set({
        games: get().games.map((g) =>
          g.id === id && g.status === 'running' ? { ...g, status: 'paused', pausedAt: Date.now() } : g,
        ),
      })
      return null
    },

    async resumeGame(id) {
      set({
        games: get().games.map((g) =>
          g.id === id && g.status === 'paused' && g.pausedAt
            ? { ...g, status: 'running', pausedAt: undefined, pausedTotal: g.pausedTotal + (Date.now() - g.pausedAt) }
            : g,
        ),
      })
      return null
    },

    async closeReg(id) {
      set({ games: get().games.map((g) => (g.id === id ? { ...g, regClosedManual: true } : g)) })
      return null
    },

    async adjustToLevel(id, levelIdx) {
      set({
        games: get().games.map((g) => {
          if (g.id !== id) return g
          const target = levelStartMs(g.snapshot.levels, levelIdx)
          const ref = g.status === 'paused' && g.pausedAt ? g.pausedAt : Date.now()
          return { ...g, startedAt: ref - g.pausedTotal - target }
        }),
      })
      return null
    },

    async updateGame(id, patch) {
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
      return null
    },

    async adjustChips(id, kind, chips) {
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

    async joinGame(gameId, memberId, type, currency) {
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

      const err = await get().reclaimFromMember(memberId, currency, cost, `${g.name} ${type === 'BUYIN' ? '바인' : type === 'RE_BUYIN' ? '리바인' : '리엔트리'}`)
      if (err) return err

      const pos = levelAt(g.snapshot.levels, gameElapsedMs(g, nowTs))
      const eb = type !== 'RE_BUYIN' ? g.snapshot.earlyBird.find((r) => r.levelIndex === pos.idx) : undefined

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
        entries = type === 'BUYIN'
          ? [...entries, { memberId, table: targetTable, seat, status: 'playing' as const }]
          : entries.map((e) => (e.memberId === memberId ? { ...e, table: targetTable, seat, status: 'playing' as const, rank: undefined, outAt: undefined } : e))
      }

      set({
        games: cur.games.map((x) =>
          x.id === gameId
            ? { ...x, entries, buyins: [...x.buyins, { id: uid(), ts: nowTs, memberId, type, round, currency, cost, chips: rule.chips, earlyBirdChips: eb?.chips }] }
            : x,
        ),
      })
      return null
    },

    async eliminate(gameId, memberId) {
      const st = get()
      const g = st.games.find((x) => x.id === gameId)
      if (!g) return '게임을 찾을 수 없습니다.'
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
      return null
    },

    async moveSeat(gameId, memberId, table, seat) {
      set({
        games: get().games.map((g) =>
          g.id === gameId ? { ...g, entries: g.entries.map((e) => (e.memberId === memberId ? { ...e, table, seat } : e)) } : g,
        ),
      })
      return null
    },

    async endGame(gameId, ranking) {
      const st = get()
      const g = st.games.find((x) => x.id === gameId)
      if (!g || g.status === 'ended') return null
      const playing = g.entries.filter((e) => e.status === 'playing')
      const ranked = ranking
        ? ranking.map((id) => playing.find((e) => e.memberId === id)).filter((e): e is (typeof playing)[number] => !!e)
        : [...playing].sort((a, b) => a.table - b.table || a.seat - b.seat)
      const entries = g.entries.map((e) => {
        const i = ranked.findIndex((r) => r.memberId === e.memberId)
        return i >= 0 ? { ...e, status: 'eliminated' as const, rank: i + 1, outAt: Date.now() } : e
      })
      set({
        games: st.games.map((x) => (x.id === gameId ? { ...x, entries, status: 'ended' as const, endedAt: Date.now() } : x)),
      })
      for (const e of entries) {
        if (!e.rank) continue
        const prize = g.snapshot.prizes.find((p) => p.rank === e.rank)
        if (prize) await get().transferToMember(e.memberId, prize.currency, prize.amount, `${g.name} ${e.rank}위 프라이즈`, gameId)
        const rp = g.snapshot.rpByRank[e.rank - 1]
        if (rp) set({ members: get().members.map((m) => (m.id === e.memberId ? { ...m, rp: m.rp + rp } : m)) })
      }
      return null
    },

    async resetData(mode) {
      const keepPin = get().lockPin
      const seed = seedState()
      if (mode === 'demo') {
        set({ ...seed, lockPin: keepPin })
        return null
      }
      set({
        ...seed,
        members: [], games: [], ledger: [], events: [], passes: [], passLog: [],
        wallet: { P: 0, S: 0, V: 0 },
        seasons: [{ id: uid(), name: '시즌 1', startedAt: Date.now(), status: 'open' as const }],
        waitlist: [],
        auditLog: [],
        bizResetAt: Date.now(),
        lockPin: keepPin,
      })
      return null
    },

    async setLockPin(pin) {
      set({ lockPin: pin })
      return null
    },

    async saveStoreName(name) {
      if (!name.trim()) return '매장 이름을 입력해주세요.'
      set({ storeName: name.trim() })
      return null
    },

    async setLedgerRange(range) {
      set({ ledgerRange: range })
      return null
    },
    async setHistoryRange(range) {
      set({ historyRange: range })
      return null
    },

    async saveTables(tables) {
      set({ tables })
      return null
    },

    async saveEvent(post) {
      const st = get()
      if (post.id) {
        set({ events: st.events.map((e) => (e.id === post.id ? { ...e, title: post.title, body: post.body } : e)) })
      } else {
        set({ events: [{ id: uid(), title: post.title, body: post.body, createdAt: Date.now() }, ...st.events] })
      }
      return null
    },
    async removeEvent(id) {
      set({ events: get().events.filter((e) => e.id !== id) })
      return null
    },

    async settleSeason(rewards) {
      const st = get()
      const season = st.seasons.find((s) => s.status === 'closed')
      if (!season?.results) return '마감된 시즌이 없습니다.'
      for (const r of season.results) {
        const reward = rewards[r.rank - 1]
        if (reward) await get().transferToMember(r.memberId, 'P', reward, `${season.name} ${r.rank}위 시즌 보상`)
      }
      set({
        seasons: get().seasons.map((s) =>
          s.id === season.id
            ? { ...s, status: 'settled' as const, results: s.results?.map((r) => ({ ...r, paid: rewards[r.rank - 1] ?? 0 })) }
            : s,
        ),
        members: get().members.map((m) => ({ ...m, rp: 0 })),
      })
      return null
    },
  }
}

export function createLocalStore() {
  const store = create<Store>()(
    persist(
      (set, get) => ({
        ...seedState(),
        ...localOnlyActions(set, get),
        ...coreActions(set, get),
      }),
      {
        name: STORE_KEY,
        version: 5,
        storage: createJSONStorage(() => localStorage),
        migrate: (persisted: unknown) => {
          const state = persisted as Record<string, unknown> & { members?: Member[]; passTypes?: PassType[]; games?: Game[] }
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
          if (state?.games) state.games = state.games.map((g) => (g.joinCode ? g : { ...g, joinCode: uid() }))
          if (state && state.storeId === undefined) state.storeId = null
          // v5: 대기 인원 카운트 → 대기자 명단, 감사 로그·조회 기간 추가
          if (state) {
            const extras = defaultLocalExtras()
            for (const k of ['waitlist', 'auditLog', 'ledgerRange', 'historyRange'] as const) {
              if (state[k] === undefined) (state as Record<string, unknown>)[k] = extras[k]
            }
            delete (state as Record<string, unknown>).waitingCount
          }
          return state as never
        },
      },
    ),
  )
  if (store.persist.hasHydrated()) useReady.setState({ ready: true })
  store.persist.onFinishHydration(() => useReady.setState({ ready: true }))
  return store
}
