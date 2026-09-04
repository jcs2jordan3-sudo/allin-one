import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { hasSupabase } from './lib/supabase'
import { useAuth } from './auth'
import { ensurePublicScope, ensureStaffScope, useReady, useSession, useStore } from './store'
import Splash from './components/Splash'
import ConsoleLayout from './pages/ConsoleLayout'
import DashboardTab from './pages/DashboardTab'
import PointsTab from './pages/PointsTab'
import PassesTab from './pages/PassesTab'
import RankingTab from './pages/RankingTab'
import EventsTab from './pages/EventsTab'
import AdminTab from './pages/AdminTab'
import GameDetail from './pages/GameDetail'
import DisplayBoard from './pages/DisplayBoard'
import PublicRanking from './pages/PublicRanking'
import QrSheet from './pages/QrSheet'
import StaffLogin from './pages/StaffLogin'
import JoinPage from './player/JoinPage'
import MePage from './player/MePage'
import GameJoinPage from './player/GameJoinPage'

// ── 콘솔 게이트 ───────────────────────────────────────────────────────────
// 로컬 모드: PIN 간편 잠금 / 클라우드 모드: 직원 계정 로그인

function ConsoleGate({ children }: { children: ReactNode }) {
  return hasSupabase ? <StaffGate>{children}</StaffGate> : <LocalLockGate>{children}</LocalLockGate>
}

function LocalLockGate({ children }: { children: ReactNode }) {
  const ready = useReady((s) => s.ready)
  const lockPin = useStore((s) => s.lockPin)
  const unlocked = useSession((s) => s.unlocked)
  if (!ready) return <div className="min-h-screen bg-bg" />
  if (lockPin && !unlocked) return <LockScreen pin={lockPin} />
  return <>{children}</>
}

function StaffGate({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status)
  const role = useAuth((s) => s.role)
  const ready = useReady((s) => s.ready)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (role.kind !== 'staff') return
    setLoadError(null)
    ensureStaffScope(role.storeId, role.name).catch((e) => setLoadError(String(e?.message ?? e)))
  }, [role])

  if (status === 'loading') return <Splash text="세션 확인 중…" />
  if (role.kind !== 'staff') return <StaffLogin />
  if (loadError) return <Splash text="매장 데이터를 불러오지 못했습니다" sub={loadError} />
  if (!ready) return <Splash text="매장 데이터 불러오는 중…" />
  return <>{children}</>
}

/** 공개 페이지(전광판·공개 랭킹·QR 시트): 로그인 없이 읽기 전용 데이터 */
function PublicScope({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status)
  const role = useAuth((s) => s.role)
  const ready = useReady((s) => s.ready)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasSupabase || status !== 'ready') return
    setLoadError(null)
    const p = role.kind === 'staff' ? ensureStaffScope(role.storeId, role.name) : ensurePublicScope()
    p.catch((e) => setLoadError(String(e?.message ?? e)))
  }, [status, role])

  if (loadError) return <Splash text="데이터를 불러오지 못했습니다" sub={loadError} />
  if (!ready) return <Splash text="불러오는 중…" />
  return <>{children}</>
}

function LockScreen({ pin }: { pin: string }) {
  const unlock = useSession((s) => s.unlock)
  const storeName = useStore((s) => s.storeName)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  const submit = () => {
    if (input === pin) unlock()
    else {
      setError(true)
      setInput('')
    }
  }

  return (
    <div className="min-h-screen stage-bg flex items-center justify-center p-6">
      <div className="card w-full max-w-xs p-8 text-center">
        <div className="font-extrabold tracking-tight text-lg mb-1">
          ♠ ALL-IN <span className="text-mint">ONE</span>
        </div>
        <div className="text-[14px] text-mut mb-6">{storeName} · 잠금 상태</div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          autoFocus
          value={input}
          onChange={(e) => { setInput(e.target.value.replace(/\D/g, '')); setError(false) }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="PIN 입력"
          className="w-full bg-surface2 border border-line2 rounded-xl px-4 py-3 text-center text-lg tracking-[0.4em] placeholder:tracking-normal placeholder:text-faint outline-none focus:border-mint/60"
        />
        {error && <div className="text-rose text-[14px] mt-2">PIN이 올바르지 않습니다</div>}
        <button onClick={submit} className="mt-4 w-full bg-mint text-mintink font-semibold rounded-xl py-2.5 hover:brightness-110">
          잠금 해제
        </button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<ConsoleGate><ConsoleLayout /></ConsoleGate>}>
        <Route index element={<DashboardTab />} />
        <Route path="points" element={<PointsTab />} />
        <Route path="passes" element={<PassesTab />} />
        <Route path="ranking" element={<RankingTab />} />
        <Route path="events" element={<EventsTab />} />
        <Route path="admin" element={<AdminTab />} />
        <Route path="game/:id" element={<GameDetail />} />
      </Route>
      {/* 공개 페이지 */}
      <Route path="/display/:id" element={<PublicScope><DisplayBoard /></PublicScope>} />
      <Route path="/rank" element={<PublicScope><PublicRanking /></PublicScope>} />
      <Route path="/qr/:tableNo" element={<PublicScope><QrSheet /></PublicScope>} />
      {/* 플레이어(회원) 페이지 — 클라우드 모드 */}
      <Route path="/join" element={<JoinPage />} />
      <Route path="/me" element={<MePage />} />
      <Route path="/g/:code" element={<GameJoinPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
