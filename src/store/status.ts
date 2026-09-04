import { create } from 'zustand'
import { hasSupabase } from '../lib/supabase'

// ── 데이터 준비 상태 (로컬: 하이드레이션 완료 / 클라우드: 서버 로드 완료) ──

export const useReady = create<{ ready: boolean }>(() => ({ ready: false }))

// ── 동기화 상태 (헤더 배지용) ─────────────────────────────────────────────

export type SyncStatus = 'local' | 'connecting' | 'synced' | 'error'
export const useSyncStatus = create<{ status: SyncStatus }>(() => ({
  status: hasSupabase ? 'connecting' : 'local',
}))

// ── 로컬 모드 세션 잠금 (PIN, 브라우저 세션 단위) ─────────────────────────

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
