import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { hasSupabase, supabase } from './lib/supabase'
import type { StaffRole } from './types'

// ── 인증 상태 (클라우드 모드 전용) ──────────────────────────────────────
// 로그인 계정은 직원(staff) 또는 회원(member) 중 하나로 서버(my_role RPC)가 판정한다.

export type Role =
  | { kind: 'none' }
  | { kind: 'staff'; staffId: string; storeId: string; name: string; role: StaffRole; email: string }
  | { kind: 'member'; memberId: string; storeId: string; nickname: string; no: string }

interface AuthState {
  status: 'loading' | 'ready'
  session: Session | null
  role: Role
}

export const useAuth = create<AuthState>(() => ({
  status: hasSupabase ? 'loading' : 'ready',
  session: null,
  role: { kind: 'none' },
}))

const NONE: Role = { kind: 'none' }
const signOutListeners = new Set<() => void>()
/** 로그아웃 시 정리 작업 등록 (스토어 스코프 해제 등) */
export const onSignOut = (fn: () => void) => { signOutListeners.add(fn) }

export async function refreshRole(): Promise<Role> {
  if (!supabase || !useAuth.getState().session) {
    useAuth.setState({ role: NONE })
    return NONE
  }
  let role = await fetchRole()
  if (role.kind === 'none') {
    // 가입이 직원 초대보다 먼저였을 수 있음 → 이메일로 초대 행 연결 시도
    const { data } = await supabase.rpc('claim_staff')
    if (data === true) role = await fetchRole()
  }
  useAuth.setState({ role })
  return role
}

async function fetchRole(): Promise<Role> {
  const { data, error } = await supabase!.rpc('my_role')
  if (error || !data) return NONE
  const r = data as Record<string, string>
  if (r.kind === 'staff') return { kind: 'staff', staffId: r.staffId, storeId: r.storeId, name: r.name, role: r.role as StaffRole, email: r.email }
  if (r.kind === 'member') return { kind: 'member', memberId: r.memberId, storeId: r.storeId, nickname: r.nickname, no: r.no }
  return NONE
}

let started = false
export function initAuth() {
  if (!supabase || started) return
  started = true
  supabase.auth.getSession().then(async ({ data }) => {
    useAuth.setState({ session: data.session })
    await refreshRole()
    useAuth.setState({ status: 'ready' })
  })
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      useAuth.setState({ session })
      return
    }
    useAuth.setState({ session })
    if (event === 'SIGNED_OUT') {
      useAuth.setState({ role: NONE })
      signOutListeners.forEach((fn) => fn())
      return
    }
    // SIGNED_IN·USER_UPDATED: 역할 재판정 (콜백 안에서 supabase 호출은 데드락 위험 → 다음 틱)
    setTimeout(() => { void refreshRole() }, 0)
  })
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Supabase가 설정되지 않았습니다.'
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) return authErrMsg(error.message)
  useAuth.setState({ session: data.session })
  await refreshRole()
  return null
}

export interface SignUpOpts {
  email: string
  password: string
  kind: 'staff' | 'member'
  nickname?: string
  realName?: string
  phone?: string
  emoji?: string
  color?: string
  storeId?: string
}

/** 가입. 이메일 인증이 켜져 있으면 세션 없이 needsConfirm=true */
export async function signUp(opts: SignUpOpts): Promise<{ error: string | null; needsConfirm: boolean }> {
  if (!supabase) return { error: 'Supabase가 설정되지 않았습니다.', needsConfirm: false }
  const { data, error } = await supabase.auth.signUp({
    email: opts.email.trim(),
    password: opts.password,
    options: {
      data: {
        kind: opts.kind,
        nickname: opts.nickname?.trim() || undefined,
        real_name: opts.realName?.trim() || undefined,
        phone: opts.phone?.trim() || undefined,
        emoji: opts.emoji,
        color: opts.color,
        store_id: opts.storeId,
      },
    },
  })
  if (error) return { error: authErrMsg(error.message), needsConfirm: false }
  // 이미 가입된 이메일은 Supabase가 오류 대신 빈 identities로 응답할 수 있음
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: '이미 가입된 이메일입니다. 로그인해주세요.', needsConfirm: false }
  }
  if (data.session) {
    useAuth.setState({ session: data.session })
    await refreshRole()
    return { error: null, needsConfirm: false }
  }
  return { error: null, needsConfirm: true }
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}

export function authErrMsg(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (/Email not confirmed/i.test(msg)) return '이메일 인증이 완료되지 않았습니다. 받은 메일의 링크를 확인해주세요.'
  if (/already registered|already been registered/i.test(msg)) return '이미 가입된 이메일입니다.'
  if (/at least 6 characters|Password should be/i.test(msg)) return '비밀번호는 6자 이상이어야 합니다.'
  if (/valid email|Unable to validate email/i.test(msg)) return '올바른 이메일 주소를 입력해주세요.'
  if (/rate limit/i.test(msg)) return '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.'
  if (/Failed to fetch|NetworkError/i.test(msg)) return '서버에 연결할 수 없습니다. 네트워크를 확인해주세요.'
  return msg
}
