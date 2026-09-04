import type { Pass } from '../types'
import { DAY, uid } from './seed'
import type { Actions, ConsoleActionKey, GetState, SetState } from './types'

/**
 * 콘솔 전용 액션 — 이용권·시즌·대기자.
 * 로컬 모드와 클라우드 모드가 같은 로직을 공유한다. 클라우드 모드는 set을 감싸서
 * 변경 후 console_state 저장을 예약한다.
 */
export function consoleActions(set: SetState, get: GetState): Pick<Actions, ConsoleActionKey> {
  return {
    async savePassType(t) {
      const st = get()
      const exists = st.passTypes.some((x) => x.id === t.id)
      set({ passTypes: exists ? st.passTypes.map((x) => (x.id === t.id ? t : x)) : [...st.passTypes, t] })
      return null
    },

    async removePassType(id) {
      const st = get()
      if (st.passes.some((p) => p.typeId === id && p.status === 'unused')) {
        return '미사용 이용권이 남아 있는 유형은 삭제할 수 없습니다.'
      }
      set({ passTypes: st.passTypes.filter((x) => x.id !== id) })
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
        passLog: [
          { id: uid(), ts, action: '사용', typeName: t?.name, memberId: p.memberId, operator: st.operatorName },
          ...st.passLog,
        ],
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
      const base = Math.max(ts, p.expiresAt) // 만료된 권은 오늘부터 재시작
      const t = st.passTypes.find((x) => x.id === p.typeId)
      set({
        passes: st.passes.map((x) => (x.id === passId ? { ...x, expiresAt: base + days * DAY } : x)),
        passLog: [
          { id: uid(), ts, action: '연장', typeName: t?.name, memberId: p.memberId, detail: `+${days}일`, operator: st.operatorName },
          ...st.passLog,
        ],
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
        passLog: [
          { id: uid(), ts, action: '회수', typeName: t?.name, memberId: p.memberId, operator: st.operatorName },
          ...st.passLog,
        ],
      })
      return null
    },

    async resetBizDay() {
      const st = get()
      const ts = Date.now()
      set({
        bizResetAt: ts,
        passLog: [{ id: uid(), ts, action: '집계 초기화', operator: st.operatorName }, ...st.passLog],
      })
      return null
    },

    async setWaiting(n) {
      set({ waitingCount: Math.max(0, n) })
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
        seasons: st.seasons.map((s) =>
          s.id === season.id ? { ...s, status: 'closed' as const, closedAt: Date.now(), results: ranked } : s,
        ),
      })
      return null
    },

    async startSeason(name) {
      set({ seasons: [{ id: uid(), name, startedAt: Date.now(), status: 'open' }, ...get().seasons] })
      return null
    },
  }
}
