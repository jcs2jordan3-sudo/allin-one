import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSession, useStore, useSyncStatus, type SyncStatus } from '../store'
import { appUrl } from '../lib/url'

const SYNC_META: Record<SyncStatus, { label: string; dot: string; text: string }> = {
  local: { label: '로컬 모드', dot: 'bg-faint', text: 'text-mut' },
  connecting: { label: '연결 중', dot: 'bg-gold animate-pulse', text: 'text-gold' },
  synced: { label: '클라우드 동기화', dot: 'bg-mint', text: 'text-mint' },
  error: { label: '동기화 오류', dot: 'bg-rose', text: 'text-rose' },
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
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const onLogout = () => {
    if (lockPin) lock()
    else navigate('/admin') // PIN 미설정 시 잠금 설정 화면으로 안내
  }

  return (
    <div className="min-h-screen">
      <header className="glass-panel border-b border-line !rounded-none sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-mint/15 border border-mint/30 text-mint flex items-center justify-center text-base font-black">
                  ♠
                </span>
                <span className="font-extrabold tracking-tight text-[15px]">
                  ALL-IN <span className="text-mint">ONE</span>
                </span>
              </div>
              <span className="hidden sm:inline-flex text-[12px] text-mut border border-line rounded-full px-2.5 py-0.5">
                {storeName}
              </span>
              <span
                className={`hidden md:inline-flex items-center gap-1.5 text-[11px] font-semibold ${syncMeta.text}`}
                title={sync === 'local' ? '.env.local에 Supabase 키를 설정하면 클라우드 동기화가 켜집니다' : undefined}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${syncMeta.dot}`} aria-hidden />
                {syncMeta.label}
              </span>
            </div>
            <nav className="flex items-center gap-1 text-[13px] text-mut">
              <a href={appUrl('/rank')} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-lg hover:text-ink hover:bg-surface2">
                공개 랭킹
              </a>
              <span className="px-2.5 py-1.5 hidden sm:inline">{operatorName}</span>
              <button
                onClick={onLogout}
                className="px-2.5 py-1.5 rounded-lg hover:text-ink hover:bg-surface2"
                title={lockPin ? '잠금 화면으로 전환' : '관리 탭에서 PIN을 설정하면 잠금이 활성화됩니다'}
              >
                {lockPin ? '잠금' : '로그아웃'}
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
                  className={`px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
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
