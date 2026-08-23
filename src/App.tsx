import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSession, useStore } from './store'
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

/** 관리자 콘솔 잠금 게이트 — PIN이 설정된 경우에만 동작. 공개 페이지(전광판·랭킹·QR)는 통과 */
function LockGate({ children }: { children: ReactNode }) {
  const lockPin = useStore((s) => s.lockPin)
  const unlocked = useSession((s) => s.unlocked)
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated())

  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), [])

  if (!hydrated) return <div className="min-h-screen bg-bg" />
  if (lockPin && !unlocked) return <LockScreen pin={lockPin} />
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
        <button
          onClick={submit}
          className="mt-4 w-full bg-mint text-mintink font-semibold rounded-xl py-2.5 hover:brightness-110"
        >
          잠금 해제
        </button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<LockGate><ConsoleLayout /></LockGate>}>
        <Route index element={<DashboardTab />} />
        <Route path="points" element={<PointsTab />} />
        <Route path="passes" element={<PassesTab />} />
        <Route path="ranking" element={<RankingTab />} />
        <Route path="events" element={<EventsTab />} />
        <Route path="admin" element={<AdminTab />} />
        <Route path="game/:id" element={<GameDetail />} />
      </Route>
      <Route path="/display/:id" element={<DisplayBoard />} />
      <Route path="/rank" element={<PublicRanking />} />
      <Route path="/qr/:tableNo" element={<QrSheet />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
