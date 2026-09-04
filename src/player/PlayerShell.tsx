import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import OfflineBanner from '../components/OfflineBanner'

/** 플레이어 모바일 화면 공통 틀 */
export default function PlayerShell({
  storeName,
  right,
  children,
}: {
  storeName?: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-screen stage-bg">
      <OfflineBanner />
      <header className="sticky top-0 z-30 glass-panel border-b border-line !rounded-none">
        <div className="max-w-md mx-auto px-4 h-13 flex items-center justify-between py-3">
          <Link to="/me" className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-mint/15 border border-mint/30 text-mint flex items-center justify-center text-sm font-black">♠</span>
            <span className="font-extrabold tracking-tight text-[15px] truncate">
              {storeName || <>ALL-IN <span className="text-mint">ONE</span></>}
            </span>
          </Link>
          {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
        </div>
      </header>
      <main className="max-w-md mx-auto px-4 py-5 pb-16 space-y-4">{children}</main>
    </div>
  )
}
