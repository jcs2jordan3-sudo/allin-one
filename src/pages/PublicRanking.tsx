import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { fmtNum, maskName } from '../lib/format'
import { withCompetitionRanks } from './RankingTab'

const MEDALS = ['🥇', '🥈', '🥉']

/** 공개 랭킹 — 로그인 없이 접근하는 외부 공개 페이지 (닉네임 마스킹) */
export default function PublicRanking() {
  const storeName = useStore((s) => s.storeName)
  const season = useStore((s) => s.seasons.find((x) => x.status === 'open' || x.status === 'closed'))
  const allMembers = useStore((s) => s.members)
  // 셀렉터 안에서 새 배열을 만들면 zustand v5가 무한 리렌더하므로 useMemo로 파생
  const members = useMemo(
    () => [...allMembers].filter((m) => m.status === 'active' && m.rp > 0).sort((a, b) => b.rp - a.rp),
    [allMembers],
  )

  return (
    <div className="min-h-screen stage-bg">
      <div className="max-w-xl mx-auto px-4 py-10">
        <header className="text-center mb-8">
          <div className="font-extrabold tracking-tight text-lg">
            ♠ ALL-IN <span className="text-mint">ONE</span>
          </div>
          <h1 className="text-2xl font-black mt-3 tracking-tight">{storeName} 랭킹</h1>
          {season && <p className="text-mut text-sm mt-1">{season.name}</p>}
        </header>
        <div className="space-y-2.5">
          {members.length === 0 && (
            <div className="text-center text-mut py-10 text-sm">아직 랭킹 데이터가 없습니다.</div>
          )}
          {withCompetitionRanks(members).map(({ item: m, rank }) => {
            const top3 = rank <= 3
            return (
              <div
                key={m.id}
                className={`flex items-center gap-4 px-5 py-3.5 rounded-2xl border backdrop-blur ${
                  top3 ? 'border-gold/40 bg-gold/8' : 'border-white/8 bg-black/30'
                }`}
              >
                <span className={`w-8 text-center shrink-0 ${top3 ? 'text-xl' : 'text-sm font-bold text-mut num'}`}>
                  {top3 ? MEDALS[rank - 1] : rank}
                </span>
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
                  style={{ background: `color-mix(in srgb, ${m.color} 22%, #182130)` }}
                  aria-hidden
                >
                  {m.emoji}
                </span>
                <span className="font-bold">{maskName(m.nickname)}</span>
                <span className={`ml-auto font-bold num ${top3 ? 'text-gold text-lg' : ''}`}>
                  {fmtNum(m.rp)}<span className="text-[13px] text-mut ml-0.5">RP</span>
                </span>
              </div>
            )
          })}
        </div>
        <footer className="text-center mt-10">
          <Link to="/" className="text-[13px] text-white/30 hover:text-white/60">관리자 콘솔</Link>
        </footer>
      </div>
    </div>
  )
}
