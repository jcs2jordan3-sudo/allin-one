import type { Pass } from '../types'
import { DAY, uid } from './seed'
import type { Actions, GetState, LocalOnlyKey, SetState } from './types'

/**
 * 로컬 모드 전용 구현 — 이용권·시즌·대기자.
 * 클라우드 모드에서는 같은 규칙이 SQL RPC(issue_passes, close_season, waitlist_* …)로 서버에서 실행된다.
 */
export function localOnlyActions(set: SetState, get: GetState): Pick<Actions, LocalOnlyKey> {
  return {
    async savePassType(t) {
      const st = get()
      const exists = st.passTypes.some((x) => x.id === t.id)
      set({ passTypes: exists ? st.passTypes.map((x) => (x.id === t.id ? t : x)) : [...st.passTypes, t] })
      return null
    },

    async removePassType(id) {
      const st = get()
      if (st.passes.some((p) => p.typeId === id && p.status === 'unused' && Date.now() <= p.expiresAt)) {
        return '미사용 이용권이 남아 있는 유형은 삭제할 수 없습니다.'
      }
      if (st.passes.some((p) => p.typeId === id)) {
        set({ passTypes: st.passTypes.map((x) => (x.id === id ? { ...x, archived: true } : x)) })
      } else {
        set({ passTypes: st.passTypes.filter((x) => x.id !== id) })
      }
      return null
    },

    async issuePasses(typeId, memberId, count) {
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
          { id: uid(), ts, action: '발급', typeName: t.name, memberId, detail: `${t.name} × ${count}`, operator: st.operatorName },
          ...st.passLog,
        ],
      })
      return null
    },

    async usePass(passId) {
      const st = get()
      const p = st.passes.find((x) => x.id === passId)
      if (!p) return '이용권을 찾을 수 없습니다.'
      if (p.status !== 'unused') return '이미 사용되었거나 회수된 이용권입니다.'
      const ts = Date.now()
      if (ts > p.expiresAt) return '만료된 이용권입니다. 연장 후 사용 처리하세요.'
      const t = st.passTypes.find((x) => x.id === p.typeId)
      set({
        passes: st.passes.map((x) => (x.id === passId ? { ...x, status: 'used' as const, usedAt: ts } : x)),
        passLog: [{ id: uid(), ts, action: '사용', typeName: t?.name, memberId: p.memberId, operator: st.operatorName }, ...st.passLog],
      })
      return null
    },

    async extendPass(passId, days) {
      const st = get()
      const p = st.passes.find((x) => x.id === passId)
      if (!p) return '이용권을 찾을 수 없습니다.'
      if (p.status !== 'unused') return '미사용 상태의 이용권만 연장할 수 있습니다.'
      if (days < 1 || days > 365) return '연장 일수는 1~365 사이여야 합니다.'
      const ts = Date.now()
      const base = Math.max(ts, p.expiresAt)
      const t = st.passTypes.find((x) => x.id === p.typeId)
      set({
        passes: st.passes.map((x) => (x.id === passId ? { ...x, expiresAt: base + days * DAY } : x)),
        passLog: [{ id: uid(), ts, action: '연장', typeName: t?.name, memberId: p.memberId, detail: `+${days}일`, operator: st.operatorName }, ...st.passLog],
      })
      return null
    },

    async revokePass(passId) {
      const st = get()
      const p = st.passes.find((x) => x.id === passId)
      if (!p) return '이용권을 찾을 수 없습니다.'
      if (p.status !== 'unused') return '미사용 상태의 이용권만 회수할 수 있습니다.'
      const ts = Date.now()
      const t = st.passTypes.find((x) => x.id === p.typeId)
      set({
        passes: st.passes.map((x) => (x.id === passId ? { ...x, status: 'revoked' as const } : x)),
        passLog: [{ id: uid(), ts, action: '회수', typeName: t?.name, memberId: p.memberId, operator: st.operatorName }, ...st.passLog],
      })
      return null
    },

    async resetBizDay() {
      const st = get()
      const ts = Date.now()
      set({ bizResetAt: ts, passLog: [{ id: uid(), ts, action: '집계 초기화', operator: st.operatorName }, ...st.passLog] })
      return null
    },

    async closeSeason() {
      const st = get()
      const season = st.seasons.find((s) => s.status === 'open')
      if (!season) return '진행 중인 시즌이 없습니다.'
      const ranked = [...st.members]
        .filter((m) => m.status === 'active' && m.rp > 0)
        .sort((a, b) => b.rp - a.rp)
        .map((m, i) => ({ memberId: m.id, nickname: m.nickname, emoji: m.emoji, color: m.color, rp: m.rp, rank: i + 1 }))
      set({
        seasons: st.seasons.map((s) => (s.id === season.id ? { ...s, status: 'closed' as const, closedAt: Date.now(), results: ranked } : s)),
      })
      return null
    },

    async startSeason(name) {
      const st = get()
      if (st.seasons.some((s) => s.status === 'open' || s.status === 'closed')) return '진행 중이거나 정산 대기 중인 시즌이 있습니다.'
      set({ seasons: [{ id: uid(), name, startedAt: Date.now(), status: 'open' }, ...st.seasons] })
      return null
    },

    async addWait(memberId, guestName, note) {
      const st = get()
      if (!memberId && !guestName?.trim()) return '회원을 선택하거나 이름을 입력해주세요.'
      if (memberId && st.waitlist.some((w) => w.memberId === memberId && ['waiting', 'called', 'seated'].includes(w.status))) {
        return '이미 대기 명단(또는 착석 중)에 있는 회원입니다.'
      }
      set({
        waitlist: [
          ...st.waitlist,
          { id: uid(), memberId, guestName: guestName?.trim() || undefined, status: 'waiting', source: 'staff', arrivedAt: Date.now(), note: note?.trim() || undefined },
        ],
      })
      return null
    },

    async updateWait(id, status, table, seat) {
      const now = Date.now()
      set({
        waitlist: get().waitlist.map((w) =>
          w.id !== id
            ? w
            : {
                ...w,
                status,
                calledAt: status === 'called' ? now : w.calledAt,
                seatedAt: status === 'seated' ? now : w.seatedAt,
                endedAt: ['noshow', 'cancelled', 'left'].includes(status) ? now : undefined,
                table: status === 'seated' ? table ?? w.table : w.table,
                seat: status === 'seated' ? seat ?? w.seat : w.seat,
              },
        ),
      })
      return null
    },
  }
}
