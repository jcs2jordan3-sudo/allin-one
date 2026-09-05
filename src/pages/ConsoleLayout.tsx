import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSession, useStore, useSyncStatus, type SyncStatus } from '../store'
import { hasSupabase } from '../lib/supabase'
import { refreshRole, signOut, useAuth } from '../auth'
import { adminSelectStore } from '../dev/api'
import { STAFF_ROLE_LABEL } from '../types'
import { appUrl } from '../lib/url'
import { withStore } from '../lib/storeUrl'
import OfflineBanner from '../components/OfflineBanner'

const SYNC_META: Record<SyncStatus, { label: string; dot: string; text: string }> = {
  local: { label: '로컬 모드', dot: 'bg-faint', text: 'text-mut' },
  connecting: { label: '연결 중', dot: 'bg-gold animate-pulse', text: 'text-gold' },
  synced: { label: '클라우드 동기화', dot: 'bg-mint', text: 'text-mint' },
  error: { label: '동기화 오류', dot: 'bg-rose', text: 'text-rose' },
  offline: { label: '오프라인', dot: 'bg-rose animate-pulse', text: 'text-rose' },
}

const tabs = [
  { to: '/', label: '매장 현황' },
  { to: '/points', label: '포인트 내역' },
  { to: '/passes', label: '이용권' },
  { to: '/ranking', label: '랭킹' },
  { to: '/events', label: '이벤트' },
  { to: '/admin', label: '관리' },
]

export default function ConsoleLayout() {
  const storeName = useStore((s) => s.storeName)
  const operatorName = useStore((s) => s.operatorName)
  const sync = useSyncStatus((s) => s.status)
  const syncMeta = SYNC_META[sync]
  const lockPin = useStore((s) => s.lockPin)
  const lock = useSession((s) => s.lock)
  const role = useAuth((s) => s.role)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const onLogout = () => {
    if (hasSupabase) {
      void signOut()
      return
    }
    if (lockPin) lock()
    else navigate('/admin') // PIN 미설정 시 잠금 설정 화면으로 안내
  }

  const roleLabel = role.kind === 'staff' ? STAFF_ROLE_LABEL[role.role] : null
  const logoutLabel = hasSupabase ? '로그아웃' : lockPin ? '잠금' : '로그아웃'
  const logoutTitle = hasSupabase
    ? '계정 로그아웃'
    : lockPin ? '잠금 화면으로 전환' : '관리 탭에서 PIN을 설정하면 잠금이 활성화됩니다'

  return (
    <div className="min-h-screen">
      <OfflineBanner />
      {role.kind === 'staff' && role.devScope && <DevScopeBanner storeName={storeName} />}
      <header className="glass-panel border-b border-line !rounded-none sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-mint/15 border border-mint/30 text-mint flex items-center justify-center text-base font-black">
                  ♠
                </span>
                <span className="font-extrabold tracking-tight text-[17px]">
                  ALL-IN <span className="text-mint">ONE</span>
                </span>
              </div>
              <span className="hidden sm:inline-flex text-[15px] text-mut border border-line rounded-sm px-2.5 py-0.5">
                {storeName}
              </span>
              <span
                className={`hidden md:inline-flex items-center gap-1.5 text-[14px] font-semibold ${syncMeta.text}`}
                title={sync === 'local' ? '.env.local에 Supabase 키를 설정하면 클라우드 모드가 켜집니다 (SUPABASE_SETUP.md)' : undefined}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${syncMeta.dot}`} aria-hidden />
                {syncMeta.label}
              </span>
            </div>
            <nav className="flex items-center gap-1 text-[16px] text-mut">
              <a href={appUrl(withStore('/rank'))} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-lg hover:text-ink hover:bg-surface2">
                공개 랭킹
              </a>
              <span className="px-2.5 py-1.5 hidden sm:inline">
                {operatorName}
                {roleLabel && <span className="text-faint ml-1">({roleLabel})</span>}
              </span>
              <button onClick={onLogout} className="px-2.5 py-1.5 rounded-lg hover:text-ink hover:bg-surface2" title={logoutTitle}>
                {logoutLabel}
              </button>
            </nav>
          </div>
          {/* 게임 상세 등 하위 페이지에서도 탭 유지 */}
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map((t) => {
              const active = t.to === '/' ? pathname === '/' || pathname.startsWith('/game') : pathname.startsWith(t.to)
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  className={`px-3.5 py-2.5 text-[18px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    active ? 'border-mint text-ink' : 'border-transparent text-mut hover:text-ink'
                  }`}
                >
                  {t.label}
                </NavLink>
              )
            })}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24">
        <Outlet />
      </main>
    </div>
  )
}

/** 개발자(플랫폼 관리자)가 선택한 매장을 대표 권한으로 보는 중임을 표시 */
function DevScopeBanner({ storeName }: { storeName: string }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const back = async () => {
    setBusy(true)
    navigate('/dev')
    await adminSelectStore(null)
    await refreshRole()
  }
  return (
    <div className="bg-gold/15 border-b border-gold/40 text-[15px] px-4 py-2 flex items-center justify-center gap-x-3 gap-y-1 flex-wrap text-center">
      <span className="font-bold text-gold">개발자 모드</span>
      <span>"{storeName}" 매장을 대표 권한으로 보는 중입니다. 여기서 하는 변경은 실제 매장 데이터에 반영됩니다.</span>
      <button onClick={back} disabled={busy} className="underline font-semibold hover:text-mint">개발자 콘솔로 돌아가기</button>
    </div>
  )
}
