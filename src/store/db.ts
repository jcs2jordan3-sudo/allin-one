// 클라우드 모드 스토어 — Supabase가 원본. 이 스토어는 서버 데이터의 읽기 캐시이고,
// 모든 변경은 RPC/테이블 쓰기로 보낸 뒤 해당 테이블을 다시 읽어 반영한다.
// 다른 기기의 변경은 Realtime(postgres_changes)로 받아 같은 방식으로 다시 읽는다.

import { create } from 'zustand'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { CLIENT_ID } from '../lib/supabase'
import { consoleActions } from './console'
import { defaultConsoleState, emptyState, uid } from './seed'
import { useReady, useSyncStatus } from './status'
import { CONSOLE_KEYS, type Actions, type ConsoleActionKey, type ConsoleState, type SetState, type Store } from './types'
import {
  errMsg, gameSetToData, rowToEvent, rowToGame, rowToGameSet, rowToLedger, rowToMember, rowToPublicMember,
  rowToStaff, walletsByOwner,
} from './map'

type Scope = 'none' | 'public' | 'staff'
type Group = 'store' | 'console' | 'members' | 'ledger' | 'gameSets' | 'games' | 'staff' | 'events' | 'ranking'
type Row = Record<string, unknown>

const ALL_STAFF_GROUPS: Group[] = ['store', 'console', 'members', 'ledger', 'gameSets', 'games', 'staff', 'events']
const PUBLIC_GROUPS: Group[] = ['store', 'games', 'events', 'ranking']

export function createDbStore(sb: SupabaseClient) {
  let scope: Scope = 'none'
  let storeId: string | null = null
  let channel: RealtimeChannel | null = null
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let applyingRemote = false
  let loadSeq = 0

  // ── 서버 → 스토어 읽기 ────────────────────────────────────────────────

  const fetchers: Record<Group, () => Promise<void>> = {
    async store() {
      const { data, error } = await sb.from('stores').select('id, name, tables').eq('id', storeId!).single()
      if (error) throw error
      store.setState({ storeName: String(data.name), tables: (data.tables as Store['tables']) ?? [] })
    },
    async console() {
      const { data, error } = await sb.from('console_state').select('state').eq('store_id', storeId!).maybeSingle()
      if (error) throw error
      const remote = (data?.state ?? {}) as Partial<ConsoleState>
      const merged: ConsoleState = { ...defaultConsoleState(), ...remote }
      applyingRemote = true
      try { store.setState(merged) } finally { applyingRemote = false }
      if (!remote.seasons) void saveConsole() // 첫 연결: 기본값을 서버에 고정
    },
    async members() {
      const [m, w] = await Promise.all([
        sb.from('members').select('*').eq('store_id', storeId!).order('joined_at', { ascending: false }),
        sb.from('wallets').select('owner, currency, balance').eq('store_id', storeId!),
      ])
      if (m.error) throw m.error
      if (w.error) throw w.error
      const byOwner = walletsByOwner(w.data as Row[])
      store.setState({
        members: (m.data as Row[]).map((r) => rowToMember(r, byOwner.get(String(r.id)))),
        wallet: byOwner.get('store') ?? { P: 0, S: 0, V: 0 },
      })
    },
    async ledger() {
      const { data, error } = await sb.from('ledger').select('*').eq('store_id', storeId!).order('seq', { ascending: false }).limit(1000)
      if (error) throw error
      store.setState({ ledger: (data as Row[]).map(rowToLedger) })
    },
    async gameSets() {
      const { data, error } = await sb.from('game_sets').select('*').eq('store_id', storeId!).order('created_at')
      if (error) throw error
      store.setState({ gameSets: (data as Row[]).map(rowToGameSet) })
    },
    async games() {
      const { data, error } = await sb
        .from('games')
        .select('*, game_entries(*), buyin_events(*)')
        .eq('store_id', storeId!)
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      store.setState({ games: (data as Row[]).map(rowToGame) })
    },
    async staff() {
      const { data, error } = await sb.from('staff').select('*').eq('store_id', storeId!).order('created_at')
      if (error) throw error
      store.setState({ managers: (data as Row[]).map(rowToStaff) })
    },
    async events() {
      const { data, error } = await sb.from('events').select('*').eq('store_id', storeId!).order('created_at', { ascending: false })
      if (error) throw error
      store.setState({ events: (data as Row[]).map(rowToEvent) })
    },
    async ranking() {
      const [r, s] = await Promise.all([
        sb.from('ranking_public').select('*').eq('store_id', storeId!).order('rp', { ascending: false }),
        sb.from('seasons_public').select('seasons').eq('store_id', storeId!).maybeSingle(),
      ])
      if (r.error) throw r.error
      store.setState({
        members: (r.data as Row[]).map(rowToPublicMember),
        seasons: ((s.data?.seasons as Store['seasons'] | undefined) ?? []),
      })
    },
  }

  const refresh = async (...groups: Group[]) => {
    if (scope === 'none') return
    const allowed = scope === 'staff' ? ALL_STAFF_GROUPS : PUBLIC_GROUPS
    try {
      await Promise.all(groups.filter((g) => allowed.includes(g)).map((g) => fetchers[g]()))
    } catch (e) {
      console.warn('[allinone] refresh 실패', e)
      useSyncStatus.setState({ status: 'error' })
    }
  }

  const timers = new Map<Group, ReturnType<typeof setTimeout>>()
  const refreshSoon = (g: Group) => {
    clearTimeout(timers.get(g))
    timers.set(g, setTimeout(() => { void refresh(g) }, 150))
  }

  // ── 콘솔 전용 상태 저장 (console_state jsonb) ─────────────────────────

  const scheduleConsoleSave = () => {
    if (applyingRemote || scope !== 'staff') return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { void saveConsole() }, 300)
  }
  const saveConsole = async () => {
    if (!storeId || scope !== 'staff') return
    const st = store.getState()
    const state = Object.fromEntries(CONSOLE_KEYS.map((k) => [k, st[k]]))
    const { error } = await sb.from('console_state').upsert({
      store_id: storeId, state, writer: CLIENT_ID, updated_at: new Date().toISOString(),
    })
    if (error) {
      console.warn('[allinone] console_state 저장 실패', error)
      useSyncStatus.setState({ status: 'error' })
    }
  }
  const applyRemoteConsole = (row: { state?: Partial<ConsoleState>; writer?: string } | null) => {
    if (!row?.state || row.writer === CLIENT_ID) return
    applyingRemote = true
    try { store.setState({ ...defaultConsoleState(), ...row.state }) } finally { applyingRemote = false }
  }

  // ── 쓰기 헬퍼 ────────────────────────────────────────────────────────

  type Op = () => PromiseLike<{ error: unknown }>
  /** 서버 쓰기 → 실패 시 메시지, 성공 시 관련 그룹 재조회 */
  const run = async (op: Op, ...groups: Group[]): Promise<string | null> => {
    try {
      const { error } = await op()
      if (error) return errMsg(error)
    } catch (e) {
      return errMsg(e)
    }
    await refresh(...groups)
    return null
  }
  const rpc = (fn: string, args: Record<string, unknown>) => sb.rpc(fn, args)
  const requireStore = () => {
    if (!storeId) throw new Error('매장이 로드되지 않았습니다.')
    return storeId
  }

  // ── 스토어 ────────────────────────────────────────────────────────────

  const store = create<Store>()((set, get) => {
    const cset: SetState = (patch) => {
      set(patch)
      scheduleConsoleSave()
    }

    const core: Omit<Actions, ConsoleActionKey> = {
      transferToMember: (memberId, c, amount, reason, gameId) =>
        run(() => rpc('transfer_to_member', {
          p_member: memberId, p_currency: c, p_amount: amount, p_reason: reason ?? null, p_game: gameId ?? null, p_request: crypto.randomUUID(),
        }), 'members', 'ledger'),

      reclaimFromMember: (memberId, c, amount, reason) =>
        run(() => rpc('reclaim_from_member', {
          p_member: memberId, p_currency: c, p_amount: amount, p_reason: reason, p_request: crypto.randomUUID(),
        }), 'members', 'ledger'),

      issueToStore: (c, amount, reason) =>
        run(() => rpc('issue_to_store', { p_currency: c, p_amount: amount, p_reason: reason, p_request: crypto.randomUUID() }), 'members', 'ledger'),

      addMember: (nickname, emoji, color, phone) =>
        run(() => rpc('create_member', { p_nickname: nickname, p_emoji: emoji, p_color: color, p_phone: phone ?? null }), 'members'),

      updateMember: (id, patch) =>
        run(() => sb.from('members').update({
          ...(patch.nickname !== undefined ? { nickname: patch.nickname } : {}),
          ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...('realName' in patch ? { real_name: patch.realName ?? null } : {}),
          ...('phone' in patch ? { phone: patch.phone ?? null } : {}),
          ...('memo' in patch ? { memo: patch.memo ?? null } : {}),
        }).eq('id', id), 'members'),

      leaveMember: (id) => run(() => rpc('leave_member', { p_member: id }), 'members', 'ledger'),

      async adjustRp(memberId, delta, reason) {
        const err = await run(() => rpc('adjust_rp', { p_member: memberId, p_delta: delta, p_reason: reason }), 'members')
        if (err) return err
        cset({ rpLog: [{ id: uid(), ts: Date.now(), memberId, delta, reason: reason.trim(), operator: get().operatorName }, ...get().rpLog] })
        return null
      },

      addManager: (email, name, role) =>
        run(() => sb.from('staff').insert({ store_id: requireStore(), email: email.trim().toLowerCase(), name: name.trim(), role: role ?? 'manager' }), 'staff'),
      updateManager: (id, patch) =>
        run(() => sb.from('staff').update({
          ...(patch.loginId !== undefined ? { email: patch.loginId.trim().toLowerCase() } : {}),
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.role !== undefined ? { role: patch.role } : {}),
        }).eq('id', id), 'staff'),
      removeManager: (id) => run(() => sb.from('staff').delete().eq('id', id), 'staff'),

      saveGameSet(gs) {
        const exists = get().gameSets.some((x) => x.id === gs.id)
        return run(
          () => exists
            ? sb.from('game_sets').update({ name: gs.name, data: gameSetToData(gs) }).eq('id', gs.id)
            : sb.from('game_sets').insert({ store_id: requireStore(), name: gs.name, data: gameSetToData(gs) }),
          'gameSets',
        )
      },
      async duplicateGameSet(id) {
        const src = get().gameSets.find((x) => x.id === id)
        if (!src) return '게임 셋을 찾을 수 없습니다.'
        return run(() => sb.from('game_sets').insert({ store_id: requireStore(), name: `${src.name} (복사본)`, data: gameSetToData(src) }), 'gameSets')
      },
      removeGameSet: (id) => run(() => sb.from('game_sets').delete().eq('id', id), 'gameSets'),

      createGame: (name, gameSetId, tables, opts) =>
        run(() => rpc('create_game', {
          p_name: name, p_game_set: gameSetId, p_tables: tables,
          p_start: opts?.startAt ? new Date(opts.startAt).toISOString() : null,
          p_notice: opts?.notice ?? null,
        }), 'games'),
      cancelGame: (id) => run(() => rpc('cancel_game', { p_game: id }), 'games', 'members', 'ledger'),
      pauseGame: (id) => run(() => rpc('pause_game', { p_game: id }), 'games'),
      resumeGame: (id) => run(() => rpc('resume_game', { p_game: id }), 'games'),
      closeReg: (id) => run(() => sb.from('games').update({ reg_closed_manual: true }).eq('id', id), 'games'),
      adjustToLevel: (id, levelIdx) => run(() => rpc('adjust_level', { p_game: id, p_level: levelIdx }), 'games'),
      async updateGame(id, patch) {
        const g = get().games.find((x) => x.id === id)
        if (!g || g.status === 'ended') return null
        return run(() => sb.from('games').update({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.notice !== undefined ? { notice: patch.notice || null } : {}),
          ...(patch.prizes !== undefined ? { snapshot: { ...g.snapshot, prizes: patch.prizes } } : {}),
        }).eq('id', id), 'games')
      },
      adjustChips: (id, kind, chips) => run(() => rpc('adjust_chips', { p_game: id, p_kind: kind, p_chips: chips }), 'games'),
      joinGame: (gameId, memberId, type, currency) =>
        run(() => rpc('game_buyin', {
          p_game: gameId, p_member: memberId, p_type: type, p_currency: currency, p_request: crypto.randomUUID(),
        }), 'games', 'members', 'ledger'),
      eliminate: (gameId, memberId) => run(() => rpc('eliminate_entry', { p_game: gameId, p_member: memberId }), 'games'),
      moveSeat: (gameId, memberId, table, seat) =>
        run(() => sb.from('game_entries').update({ table_no: table, seat }).eq('game_id', gameId).eq('member_id', memberId), 'games'),
      endGame: (gameId, ranking) => run(() => rpc('end_game', { p_game: gameId, p_ranking: ranking ?? null }), 'games', 'members', 'ledger'),

      async resetData(mode) {
        const err = await run(() => rpc('reset_store', { p_mode: mode }))
        if (err) return err
        applyingRemote = true
        try { set(defaultConsoleState()) } finally { applyingRemote = false }
        await saveConsole()
        await refresh(...ALL_STAFF_GROUPS)
        return null
      },
      async setLockPin() {
        return null // 클라우드 모드는 계정 로그인이 잠금을 대신함
      },
      saveTables: (tables) => run(() => sb.from('stores').update({ tables }).eq('id', requireStore()), 'store'),
      async saveStoreName(name) {
        if (!name.trim()) return '매장 이름을 입력해주세요.'
        return run(() => sb.from('stores').update({ name: name.trim() }).eq('id', requireStore()), 'store')
      },
      saveEvent: (post) =>
        run(
          () => post.id
            ? sb.from('events').update({ title: post.title, body: post.body }).eq('id', post.id)
            : sb.from('events').insert({ store_id: requireStore(), title: post.title, body: post.body }),
          'events',
        ),
      removeEvent: (id) => run(() => sb.from('events').delete().eq('id', id), 'events'),

      async settleSeason(rewards) {
        const season = get().seasons.find((s) => s.status === 'closed')
        if (!season?.results) return '마감된 시즌이 없습니다.'
        const list = season.results
          .map((r) => ({ memberId: r.memberId, amount: rewards[r.rank - 1] ?? 0, rank: r.rank }))
          .filter((r) => r.amount > 0)
        const err = await run(() => rpc('settle_season', { p_rewards: list, p_season_name: season.name }), 'members', 'ledger')
        if (err) return err
        cset({
          seasons: get().seasons.map((s) =>
            s.id === season.id
              ? { ...s, status: 'settled' as const, results: s.results?.map((r) => ({ ...r, paid: rewards[r.rank - 1] ?? 0 })) }
              : s,
          ),
        })
        return null
      },
    }

    return { ...emptyState(), ...consoleActions(cset, get), ...core }
  })

  // ── Realtime ──────────────────────────────────────────────────────────

  const subscribe = (kind: Scope) => {
    if (channel) { void sb.removeChannel(channel); channel = null }
    if (kind === 'none' || !storeId) return
    const ch = sb.channel(`allinone-${storeId}-${CLIENT_ID}`)
    const byStore = `store_id=eq.${storeId}`
    const on = (table: string, filter: string | undefined, handler: (payload: { new: Row | null }) => void) =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, handler as never)
    on('stores', `id=eq.${storeId}`, () => refreshSoon('store'))
    on('games', byStore, () => refreshSoon('games'))
    on('game_entries', undefined, () => refreshSoon('games'))
    on('buyin_events', undefined, () => refreshSoon('games'))
    on('events', byStore, () => refreshSoon('events'))
    if (kind === 'staff') {
      on('console_state', byStore, (p) => applyRemoteConsole(p.new as never))
      on('members', byStore, () => refreshSoon('members'))
      on('wallets', byStore, () => refreshSoon('members'))
      on('ledger', byStore, () => refreshSoon('ledger'))
      on('game_sets', byStore, () => refreshSoon('gameSets'))
      on('staff', byStore, () => refreshSoon('staff'))
    } else {
      on('members', undefined, () => refreshSoon('ranking'))
      on('console_state', byStore, () => refreshSoon('ranking'))
    }
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') useSyncStatus.setState({ status: 'synced' })
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') useSyncStatus.setState({ status: 'error' })
    })
    channel = ch
  }

  // ── 스코프 전환 ───────────────────────────────────────────────────────

  const load = async (kind: Scope, id: string, operatorName: string) => {
    const seq = ++loadSeq
    useReady.setState({ ready: false })
    useSyncStatus.setState({ status: 'connecting' })
    subscribe('none')
    storeId = id
    scope = kind
    store.setState({ ...emptyState(), storeId: id, operatorName })
    try {
      await Promise.all((kind === 'staff' ? ALL_STAFF_GROUPS : PUBLIC_GROUPS).map((g) => fetchers[g]()))
    } catch (e) {
      if (seq !== loadSeq) return
      scope = 'none'
      useSyncStatus.setState({ status: 'error' })
      throw new Error(errMsg(e))
    }
    if (seq !== loadSeq) return
    subscribe(kind)
    useReady.setState({ ready: true })
  }

  /** 직원 콘솔 스코프: 매장 전체 데이터 + 콘솔 상태 */
  const ensureStaffScope = async (id: string, operatorName: string) => {
    if (scope === 'staff' && storeId === id) {
      if (store.getState().operatorName !== operatorName) store.setState({ operatorName })
      return
    }
    await load('staff', id, operatorName)
  }

  /** 공개 스코프(전광판·공개 랭킹·QR 시트): 로그인 없이 읽을 수 있는 데이터만 */
  const ensurePublicScope = async () => {
    if (scope !== 'none') return
    const { data, error } = await sb.from('stores').select('id').order('created_at').limit(1).maybeSingle()
    if (error) throw new Error(errMsg(error))
    if (!data) throw new Error('개설된 매장이 없습니다. 관리자 콘솔에서 매장을 먼저 개설하세요.')
    await load('public', String(data.id), '')
  }

  /** 로그아웃 등: 스코프 해제 */
  const teardown = () => {
    loadSeq++
    subscribe('none')
    scope = 'none'
    storeId = null
    store.setState(emptyState())
    useReady.setState({ ready: false })
    useSyncStatus.setState({ status: 'connecting' })
  }

  return { store, ensureStaffScope, ensurePublicScope, teardown }
}
