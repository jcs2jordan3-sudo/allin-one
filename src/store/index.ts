// 스토어 진입점 — Supabase 키 유무로 로컬 모드/클라우드 모드를 선택한다.
// 페이지는 useStore만 알고, 두 모드는 같은 Store 인터페이스를 구현한다.

import type { StoreApi, UseBoundStore } from 'zustand'
import { hasSupabase, supabase } from '../lib/supabase'
import { onSignOut } from '../auth'
import { createDbStore } from './db'
import { createLocalStore } from './local'
import type { Store } from './types'

const db = hasSupabase && supabase ? createDbStore(supabase) : null

export const useStore: UseBoundStore<StoreApi<Store>> = db ? db.store : createLocalStore()

/** 클라우드 모드: 직원 콘솔 데이터 로드 (로컬 모드에서는 no-op) */
export const ensureStaffScope: (storeId: string, operatorName: string) => Promise<void> =
  db ? db.ensureStaffScope : async () => {}

/** 클라우드 모드: 공개 페이지용 데이터 로드 (로컬 모드에서는 no-op) */
export const ensurePublicScope: () => Promise<void> = db ? db.ensurePublicScope : async () => {}

if (db) onSignOut(db.teardown)

export { useReady, useSession, useSyncStatus, type SyncStatus } from './status'
export { selMemberById, selPlayingCount, selTotalChips } from './selectors'
export type { Actions, Store, StoreState } from './types'
