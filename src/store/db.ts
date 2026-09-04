// 클라우드 모드 스토어 — Supabase가 원본. 이 스토어는 서버 데이터의 읽기 캐시이고,
// 모든 변경은 RPC/테이블 쓰기로 보낸 뒤 해당 테이블을 다시 읽어 반영한다.
// 다른 기기의 변경은 Realtime(postgres_changes)로 받아 같은 방식으로 다시 읽는다.

import { create } from 'zustand'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { CLIENT_ID } from '../lib/supabase'
import { emptyState } from './seed'
import { useReady, useSyncStatus } from './status'
import type { Actions, LocalOnlyKey, Store } from './types'
import {
  errMsg, gameSetToData, rowToAudit, rowToEvent, rowToGame, rowToGameSet, rowToLedger, rowToMember, rowToPass,
  rowToPassLog, rowToPassType, rowToPublicMember, rowToRpLog, rowToSeason, rowToStaff, rowToWait, walletsByOwner,
} from './map'

type Scope = 'none' | 'public' | 'staff'
type Group = 'store' | 'members' | 'ledger' | 'gameSets' | 'games' | 'staff' | 'events' | 'ranking' | 'passes' | 'seasons' | 'waitlist' | 'audit'
type Row = Record<string, unknown>

const ALL_STAFF_GROUPS: Group[] = ['store', 'members', 'ledger', 'gameSets', 'games', 'staff', 'events', 'passes', 'seasons', 'waitlist', 'audit']
const PUBLIC_GROUPS: Group[] = ['store', 'games', 'events', 'ranking']
const GAME_SELECT = '*, game_entries(*), buyin_events(*)'
const OFFLINE_MSG = '오프라인 상태입니다. 네트워크 연결 후 다시 시도하세요.'
const iso = (ms: number) => new Date(ms).toISOString()

export function createDbStore(sb: SupabaseClient) {
  let scope: Scope = 'none'
  let storeId: string | null = null
  let channel: RealtimeChannel | null = null
  let loadSeq = 0

  // ── 서버 → 스토어 읽기 ────────────────────────────────────────────────

  const fetchers: Record<Group, () => Promise<void>> = {
    async store() {
      const { data, error } = await sb.from('stores').select('id, name, tables, biz_reset_at').eq('id', storeId!).single()
      if (error) throw error
      store.setState({
        storeName: String(data.name),
        tables: (data.tables as Store['tables']) ?? [],
        bizResetAt: data.biz_reset_at ? new Date(String(data.biz_reset_at)).getTime() : Date.now(),
      })
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
      const { from, to } = store.getState().ledgerRange
      const { data, error } = await sb.from('ledger').select('*').eq('store_id', storeId!)
        .gte('ts', iso(from)).lte('ts', iso(to)).order('seq', { ascending: false }).limit(2000)
      if (error) throw error
      store.setState({ ledger: (data as Row[]).map(rowToLedger) })
    },
    async gameSets() {
      const { data, error } = await sb.from('game_sets').select('*').eq('store_id', storeId!).order('created_at')
      if (error) throw error
      store.setState({ gameSets: (data as Row[]).map(rowToGameSet) })
    },
    async games() {
      // 진행·예약 중인 게임은 항상, 종료 게임은 조회 기간 내만 (조회 상한 대응)
      const { from, to } = store.getState().historyRange
      const [live, ended] = await Promise.all([
        sb.from('games').select(GAME_SELECT).eq('store_id', storeId!).neq('status', 'ended').order('created_at', { ascending: false }),
        sb.from('games').select(GAME_SELECT).eq('store_id', storeId!).eq('status', 'ended')
          .gte('ended_at', iso(from)).lte('ended_at', iso(to)).order('ended_at', { ascending: false }).limit(500),
      ])
      if (live.error) throw live.error
      if (ended.error) throw ended.error
      store.setState({ games: [...(live.data as Row[]), ...(ended.data as Row[])].map(rowToGame) })
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
        sb.from('seasons').select('id, name, started_at, status, closed_at').eq('store_id', storeId!).order('started_at', { ascending: false }),
      ])
      if (r.error) throw r.error
      store.setState({
        members: (r.data as Row[]).map(rowToPublicMember),
        seasons: ((s.data ?? []) as Row[]).map(rowToSeason),
      })
    },
    async passes() {
      const [t, p, l] = await Promise.all([
        sb.from('pass_types').select('*').eq('store_id', storeId!).order('sort').order('created_at'),
        sb.from('passes').select('*').eq('store_id', storeId!).order('issued_at', { ascending: false }).limit(2000),
        sb.from('pass_log').select('*').eq('store_id', storeId!).order('ts', { ascending: false }).limit(500),
      ])
      if (t.error) throw t.error
      if (p.error) throw p.error
      if (l.error) throw l.error
      store.setState({
        passTypes: (t.data as Row[]).map(rowToPassType),
        passes: (p.data as Row[]).map(rowToPass),
        passLog: (l.data as Row[]).map(rowToPassLog),
      })
    },
    async seasons() {
      const [s, r] = await Promise.all([
        sb.from('seasons').select('*').eq('store_id', storeId!).order('started_at', { ascending: false }),
        sb.from('rp_log').select('*').eq('store_id', storeId!).order('ts', { ascending: false }).limit(500),
      ])
      if (s.error) throw s.error
      if (r.error) throw r.error
      store.setState({ seasons: (s.data as Row[]).map(rowToSeason), rpLog: (r.data as Row[]).map(rowToRpLog) })
    },
    async waitlist() {
      // 활성 항목 전부 + 최근 24시간 내 종료 항목 (노쇼·퇴장 이력)
      const since = iso(Date.now() - 24 * 3_600_000)
      const { data, error } = await sb.from('waitlist').select('*').eq('store_id', storeId!)
        .or(`status.in.(waiting,called,seated),ended_at.gte.${since}`)
        .order('arrived_at')
      if (error) throw error
      store.setState({ waitlist: (data as Row[]).map(rowToWait) })
    },
    async audit() {
      const { data, error } = await sb.from('audit_log').select('*').eq('store_id', storeId!).order('ts', { ascending: false }).limit(500)
      if (error) throw error
      store.setState({ auditLog: (data as Row[]).map(rowToAudit) })
    },
  }

  const refresh = async (...groups: Group[]) => {
    if (scope === 'none') return
    const allowed = scope === 'staff' ? ALL_STAFF_GROUPS : PUBLIC_GROUPS
    try {
      await Promise.all(groups.filter((g) => allowed.includes(g)).map((g) => fetchers[g]()))
      if (useSyncStatus.getState().status === 'error') useSyncStatus.setState({ status: 'synced' })
    } catch (e) {
      console.warn('[allinone] refresh 실패', e)
      useSyncStatus.setState({ status: navigator.onLine ? 'error' : 'offline' })
    }
  }

  const timers = new Map<Group, ReturnType<typeof setTimeout>>()
  const refreshSoon = (g: Group) => {
    clearTimeout(timers.get(g))
    timers.set(g, setTimeout(() => { void refresh(g) }, 150))
  }

  // ── 쓰기 헬퍼 ────────────────────────────────────────────────────────

  type Op = () => PromiseLike<{ error: unknown }>
  /** 서버 쓰기 → 실패 시 메시지, 성공 시 관련 그룹 재조회. 오프라인이면 즉시 거부. */
  const run = async (op: Op, ...groups: Group[]): Promise<string | null> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return OFFLINE_MSG
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
    const localOnly: Pick<Actions, LocalOnlyKey> = {
      savePassType(t) {
        const exists = get().passTypes.some((x) => x.id === t.id)
        return run(
          () => exists
            ? sb.from('pass_types').update({ name: t.name, valid_days: t.validDays, color: t.color }).eq('id', t.id)
            : sb.from('pass_types').insert({ store_id: requireStore(), name: t.name, valid_days: t.validDays, color: t.color, sort: get().passTypes.length }),
          'passes',
        )
      },
      removePassType: (id) => run(() => rpc('remove_pass_type', { p_type: id }), 'passes'),
      issuePasses: (typeId, memberId, count) => run(() => rpc('issue_passes', { p_type: typeId, p_member: memberId, p_count: count }), 'passes'),
      usePass: (passId) => run(() => rpc('use_pass', { p_pass: passId }), 'passes'),
      extendPass: (passId, days) => run(() => rpc('extend_pass', { p_pass: passId, p_days: days }), 'passes'),
      revokePass: (passId) => run(() => rpc('revoke_pass', { p_pass: passId }), 'passes'),
      resetBizDay: () => run(() => rpc('reset_biz_day', {}), 'store', 'passes'),
      closeSeason: () => run(() => rpc('close_season', {}), 'seasons'),
      startSeason: (name) => run(() => rpc('start_season', { p_name: name }), 'seasons'),
      addWait: (memberId, guestName, note) =>
        run(() => rpc('waitlist_add', { p_member: memberId ?? null, p_guest_name: guestName ?? null, p_note: note ?? null }), 'waitlist'),
      updateWait: (id, status, table, seat) =>
        run(() => rpc('waitlist_update', { p_id: id, p_status: status, p_table: table ?? null, p_seat: seat ?? null }), 'waitlist'),
    }

    const core: Omit<Actions, LocalOnlyKey> = {
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
        }).eq('id', id), 'members', 'audit'),

      leaveMember: (id) => run(() => rpc('leave_member', { p_member: id }), 'members', 'ledger', 'waitlist', 'audit'),
      adjustRp: (memberId, delta, reason) => run(() => rpc('adjust_rp', { p_member: memberId, p_delta: delta, p_reason: reason }), 'members', 'seasons'),

      addManager: (email, name, role) =>
        run(() => sb.from('staff').insert({ store_id: requireStore(), email: email.trim().toLowerCase(), name: name.trim(), role: role ?? 'manager' }), 'staff', 'audit'),
      updateManager: (id, patch) =>
        run(() => sb.from('staff').update({
          ...(patch.loginId !== undefined ? { email: patch.loginId.trim().toLowerCase() } : {}),
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.role !== undefined ? { role: patch.role } : {}),
        }).eq('id', id), 'staff', 'audit'),
      removeManager: (id) => run(() => sb.from('staff').delete().eq('id', id), 'staff', 'audit'),

      saveGameSet(gs) {
        const exists = get().gameSets.some((x) => x.id === gs.id)
        return run(
          () => exists
            ? sb.from('game_sets').update({ name: gs.name, data: gameSetToData(gs) }).eq('id', gs.id)
            : sb.from('game_sets').insert({ store_id: requireStore(), name: gs.name, data: gameSetToData(gs) }),
          'gameSets', 'audit',
        )
      },
      async duplicateGameSet(id) {
        const src = get().gameSets.find((x) => x.id === id)
        if (!src) return '게임 셋을 찾을 수 없습니다.'
        return run(() => sb.from('game_sets').insert({ store_id: requireStore(), name: `${src.name} (복사본)`, data: gameSetToData(src) }), 'gameSets', 'audit')
      },
      removeGameSet: (id) => run(() => sb.from('game_sets').delete().eq('id', id), 'gameSets', 'audit'),

      createGame: (name, gameSetId, tables, opts) =>
        run(() => rpc('create_game', {
          p_name: name, p_game_set: gameSetId, p_tables: tables,
          p_start: opts?.startAt ? iso(opts.startAt) : null,
          p_notice: opts?.notice ?? null,
        }), 'games', 'audit'),
      cancelGame: (id) => run(() => rpc('cancel_game', { p_game: id }), 'games', 'members', 'ledger', 'audit'),
      pauseGame: (id) => run(() => rpc('pause_game', { p_game: id }), 'games'),
      resumeGame: (id) => run(() => rpc('resume_game', { p_game: id }), 'games'),
      closeReg: (id) => run(() => sb.from('games').update({ reg_closed_manual: true }).eq('id', id), 'games', 'audit'),
      adjustToLevel: (id, levelIdx) => run(() => rpc('adjust_level', { p_game: id, p_level: levelIdx }), 'games'),
      async updateGame(id, patch) {
        const g = get().games.find((x) => x.id === id)
        if (!g || g.status === 'ended') return null
        return run(() => sb.from('games').update({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.notice !== undefined ? { notice: patch.notice || null } : {}),
          ...(patch.prizes !== undefined ? { snapshot: { ...g.snapshot, prizes: patch.prizes } } : {}),
        }).eq('id', id), 'games', 'audit')
      },
      adjustChips: (id, kind, chips) => run(() => rpc('adjust_chips', { p_game: id, p_kind: kind, p_chips: chips }), 'games'),
      joinGame: (gameId, memberId, type, currency) =>
        run(() => rpc('game_buyin', {
          p_game: gameId, p_member: memberId, p_type: type, p_currency: currency, p_request: crypto.randomUUID(),
        }), 'games', 'members', 'ledger', 'waitlist'),
      eliminate: (gameId, memberId) => run(() => rpc('eliminate_entry', { p_game: gameId, p_member: memberId }), 'games'),
      moveSeat: (gameId, memberId, table, seat) =>
        run(() => sb.from('game_entries').update({ table_no: table, seat }).eq('game_id', gameId).eq('member_id', memberId), 'games'),
      endGame: (gameId, ranking) => run(() => rpc('end_game', { p_game: gameId, p_ranking: ranking ?? null }), 'games', 'members', 'ledger', 'audit'),

      async resetData(mode) {
        const err = await run(() => rpc('reset_store', { p_mode: mode }))
        if (err) return err
        await refresh(...ALL_STAFF_GROUPS)
        return null
      },
      async setLockPin() {
        return null // 클라우드 모드는 계정 로그인이 잠금을 대신함
      },
      saveStoreName(name) {
        if (!name.trim()) return Promise.resolve('매장 이름을 입력해주세요.')
        return run(() => sb.from('stores').update({ name: name.trim() }).eq('id', requireStore()), 'store', 'audit')
      },
      saveTables: (tables) => run(() => sb.from('stores').update({ tables }).eq('id', requireStore()), 'store', 'audit'),
      saveEvent: (post) =>
        run(
          () => post.id
            ? sb.from('events').update({ title: post.title, body: post.body }).eq('id', post.id)
            : sb.from('events').insert({ store_id: requireStore(), title: post.title, body: post.body }),
          'events', 'audit',
        ),
      removeEvent: (id) => run(() => sb.from('events').delete().eq('id', id), 'events', 'audit'),

      settleSeason: (rewards) =>
        run(() => rpc('settle_season', {
          p_rewards: rewards.map((amount, i) => ({ rank: i + 1, amount })).filter((r) => r.amount > 0),
        }), 'seasons', 'members', 'ledger'),

      async setLedgerRange(range) {
        set({ ledgerRange: range })
        await refresh('ledger')
        return null
      },
      async setHistoryRange(range) {
        set({ historyRange: range })
        await refresh('games')
        return null
      },
    }

    return { ...emptyState(), ...localOnly, ...core }
  })

  // ── Realtime ──────────────────────────────────────────────────────────

  const subscribe = (kind: Scope) => {
    if (channel) { void sb.removeChannel(channel); channel = null }
    if (kind === 'none' || !storeId) return
    const ch = sb.channel(`allinone-${storeId}-${CLIENT_ID}`)
    const byStore = `store_id=eq.${storeId}`
    const on = (table: string, filter: string | undefined, handler: () => void) =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, handler as never)
    on('stores', `id=eq.${storeId}`, () => refreshSoon('store'))
    on('games', byStore, () => refreshSoon('games'))
    on('game_entries', undefined, () => refreshSoon('games'))
    on('buyin_events', undefined, () => refreshSoon('games'))
    on('events', byStore, () => refreshSoon('events'))
    if (kind === 'staff') {
      on('members', byStore, () => refreshSoon('members'))
      on('wallets', byStore, () => refreshSoon('members'))
      on('ledger', byStore, () => refreshSoon('ledger'))
      on('game_sets', byStore, () => refreshSoon('gameSets'))
      on('staff', byStore, () => refreshSoon('staff'))
      on('pass_types', byStore, () => refreshSoon('passes'))
      on('passes', byStore, () => refreshSoon('passes'))
      on('pass_log', byStore, () => refreshSoon('passes'))
      on('seasons', byStore, () => refreshSoon('seasons'))
      on('rp_log', byStore, () => refreshSoon('seasons'))
      on('waitlist', byStore, () => refreshSoon('waitlist'))
      on('audit_log', byStore, () => refreshSoon('audit'))
    } else {
      on('members', undefined, () => refreshSoon('ranking'))
      on('seasons', byStore, () => refreshSoon('ranking'))
    }
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') useSyncStatus.setState({ status: 'synced' })
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') useSyncStatus.setState({ status: navigator.onLine ? 'error' : 'offline' })
    })
    channel = ch
  }

  // ── 오프라인 감지: 타이머 표시는 계속되고, 쓰기는 거부·재접속 시 전체 재조회 ──
  if (typeof window !== 'undefined') {
    window.addEventListener('offline', () => useSyncStatus.setState({ status: 'offline' }))
    window.addEventListener('online', () => {
      useSyncStatus.setState({ status: 'connecting' })
      void refresh(...(scope === 'staff' ? ALL_STAFF_GROUPS : PUBLIC_GROUPS)).then(() => {
        if (useSyncStatus.getState().status === 'connecting') useSyncStatus.setState({ status: 'synced' })
      })
    })
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
      useSyncStatus.setState({ status: navigator.onLine ? 'error' : 'offline' })
      throw new Error(errMsg(e))
    }
    if (seq !== loadSeq) return
    subscribe(kind)
    useReady.setState({ ready: true })
  }

  /** 직원 콘솔 스코프: 매장 전체 데이터 */
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
