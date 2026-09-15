import { useAuth } from '../auth'
import { hasSupabase } from './supabase'
import type { StaffRole } from '../types'

/**
 * 직원 역할 3단계 권한 (서버 schema.sql의 _require_staff / RLS와 동일한 기준).
 * - 대표(owner): 전체 — 직원·매장 설정·포인트 발행·시즌·이용권 종류·데이터 초기화
 * - 매니저(manager): 당일 운영 — 게임 생성·종료·취소, 회원, 재화 전송·환수, 이용권, 대기자, 공지, 작업 이력
 * - 딜러(dealer): 테이블 진행 — 바인, 일시정지·재개, 레벨·칩, 좌석 이동·해체, 탈락, 대기자
 * 화면은 여기서 숨기고, 최종 차단은 서버가 한다.
 */
export type Perm =
  | 'manageStaff' | 'resetData' | 'storeSettings' | 'issuePoints' | 'season' | 'passTypes'
  | 'auditLog' | 'games' | 'gameSets' | 'members' | 'transfers' | 'passes' | 'notice' | 'events' | 'regClose'

const MIN_ROLE: Record<Perm, StaffRole> = {
  manageStaff: 'owner', resetData: 'owner', storeSettings: 'owner', issuePoints: 'owner', season: 'owner', passTypes: 'owner',
  auditLog: 'manager', games: 'manager', gameSets: 'manager', members: 'manager', transfers: 'manager',
  passes: 'manager', notice: 'manager', events: 'manager', regClose: 'manager',
}
const RANK: Record<StaffRole, number> = { owner: 3, manager: 2, dealer: 1 }

export function roleCan(role: StaffRole, p: Perm): boolean {
  return RANK[role] >= RANK[MIN_ROLE[p]]
}

/** 현재 로그인한 직원의 역할. 로컬 모드(PIN 잠금)는 단일 운영자이므로 대표로 본다. */
export function useStaffRole(): StaffRole {
  const role = useAuth((s) => s.role)
  if (!hasSupabase) return localRoleOverride() ?? 'owner'
  return role.kind === 'staff' ? role.role : 'dealer'
}

export function useCan(): (p: Perm) => boolean {
  const role = useStaffRole()
  return (p) => roleCan(role, p)
}

/** 로컬 모드 화면 점검용: localStorage.allinone-role = 'manager' | 'dealer' (클라우드 모드에서는 무시) */
function localRoleOverride(): StaffRole | null {
  try {
    const v = localStorage.getItem('allinone-role')
    return v === 'manager' || v === 'dealer' ? v : null
  } catch {
    return null
  }
}
