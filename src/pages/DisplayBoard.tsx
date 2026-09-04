import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { selTotalChips, useStore } from '../store'
import {
  fmtClock, fmtCountdown, gameElapsedMs, isRegClosed, isScheduled, levelAt,
  nextBreakRemainMs, nextLevel, regCloseRemainMs, useNow,
} from '../lib/time'
import { fmtNum } from '../lib/format'
import { absUrl } from '../lib/url'
import { hasSupabase } from '../lib/supabase'
import { useSignupUrl } from '../components/SignupQr'

/** 타이머 전광판 — TV/태블릿 전체화면용, 로그인 불필요 */
export default function DisplayBoard() {
  const { id } = useParams()
  const game = useStore((s) => s.games.find((g) => g.id === id))
  const events = useStore((s) => s.events)
  const signupUrl = useSignupUrl()
  const now = useNow(250)
  const [panel, setPanel] = useState<'prize' | 'notice'>('prize')

  if (!game) {
    return (
      <div className="min-h-screen stage-bg flex flex-col items-center justify-center gap-4 text-mut">
        게임을 찾을 수 없습니다.
        <Link to="/" className="text-mint">콘솔로 돌아가기</Link>
      </div>
    )
  }

  const elapsed = gameElapsedMs(game, now)
  const pos = levelAt(game.snapshot.levels, elapsed)
  const next = nextLevel(game.snapshot.levels, pos.idx)
  const regRemain = regCloseRemainMs(game, now)
  const breakRemain = nextBreakRemainMs(game.snapshot.levels, elapsed)
  const playing = game.entries.filter((e) => e.status === 'playing').length
  const totalChips = selTotalChips(game)
  const avg = playing > 0 ? Math.round(totalChips / playing) : 0
  const closed = isRegClosed(game, now)
  const scheduled = isScheduled(game, now)

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen().catch(() => {})
  }

  const stats: { label: string; value: string; tone?: string }[] = [
    { label: 'REG CLOSE', value: closed ? 'CLOSED' : fmtClock(regRemain), tone: closed ? 'text-rose' : undefined },
    { label: 'TOTAL TIME', value: fmtClock(elapsed) },
    { label: 'NEXT BREAK', value: breakRemain === null ? '—' : fmtClock(breakRemain) },
    { label: 'TOTAL STACKS', value: fmtNum(totalChips) },
    { label: 'AVG STACKS', value: fmtNum(avg) },
    { label: 'PLAYERS', value: `${playing}/${game.entries.length}` },
  ]

  return (
    <div className="min-h-screen stage-bg text-ink grid grid-cols-[180px_1fr_260px] gap-6 p-6 max-lg:grid-cols-1">
      {/* 좌측 통계 레일 */}
      <aside className="flex flex-col gap-3 max-lg:flex-row max-lg:flex-wrap">
        {stats.map((s) => (
          <div key={s.label} className="bg-black/40 border border-white/8 rounded-2xl px-4 py-3.5 backdrop-blur max-lg:flex-1 max-lg:min-w-36">
            <div className="text-[15px] font-bold tracking-[0.14em] text-white/65">{s.label}</div>
            <div className={`mt-1 text-2xl font-extrabold num ${s.tone ?? ''}`}>{s.value}</div>
          </div>
        ))}
      </aside>

      {/* 중앙 타이머 */}
      <main className="flex flex-col items-center justify-center gap-6 py-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-center flex items-center gap-3">
          {game.name}
          {game.status === 'paused' && (
            <span className="text-sm font-bold text-gold border border-gold/40 rounded-sm px-3 py-1">PAUSED</span>
          )}
        </h1>
        <div className="stage-ring relative rounded-full border border-mint/25 w-[min(56vh,460px)] aspect-square flex flex-col items-center justify-center gap-2 bg-black/30 backdrop-blur-sm">
          {scheduled ? (
            <>
              <span className="text-2xl font-bold text-sky tracking-wide">시작까지</span>
              <span className="text-[clamp(56px,11vh,104px)] leading-none font-black num tracking-tight">
                {fmtClock(game.startedAt - now)}
              </span>
              <span className="text-white/45 text-sm font-semibold">사전 등록 접수 중</span>
            </>
          ) : (
            <>
              <span className="text-2xl font-bold text-mint tracking-wide">{pos.level.label}</span>
              <span className="text-[clamp(64px,13vh,120px)] leading-none font-black num tracking-tight">
                {fmtCountdown(pos.remainMs)}
              </span>
              {pos.level.type === 'break' && (
                <span className="text-gold text-lg font-bold">BREAK{pos.level.colorUp ? ` · 칩 제거 ${fmtNum(pos.level.colorUp)}` : ''}</span>
              )}
            </>
          )}
        </div>
        <div className="bg-black/45 border border-white/8 rounded-2xl px-10 py-5 text-center backdrop-blur">
          <div className="text-[clamp(28px,5vh,44px)] font-black num leading-tight">
            {pos.level.type === 'break' ? 'BREAK' : `${fmtNum(pos.level.sb)}/${fmtNum(pos.level.bb)} (${fmtNum(pos.level.ante)})`}
          </div>
          {next && (
            <div className="mt-1.5 text-white/65 font-bold tracking-widest text-base num">
              NEXT · {next.type === 'break' ? 'BREAK' : `${fmtNum(next.sb)}/${fmtNum(next.bb)} (${fmtNum(next.ante)})`}
            </div>
          )}
        </div>
      </main>

      {/* 우측 패널 */}
      <aside className="flex flex-col gap-4">
        <div className="bg-black/40 border border-white/8 rounded-2xl backdrop-blur flex-1 min-h-56 flex flex-col">
          <div className="flex border-b border-white/8">
            {(['prize', 'notice'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPanel(p)}
                className={`flex-1 py-3 text-sm font-bold tracking-widest ${
                  panel === p ? 'text-mint border-b-2 border-mint' : 'text-white/35'
                }`}
              >
                {p === 'prize' ? 'PRIZE' : 'NOTICE'}
              </button>
            ))}
          </div>
          <div className="p-4 space-y-2 overflow-y-auto">
            {panel === 'prize' ? (
              game.snapshot.prizes.length === 0 ? (
                <div className="text-white/35 text-sm py-4 text-center">프라이즈 미설정</div>
              ) : (
                game.snapshot.prizes.map((p) => (
                  <div key={p.rank} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2.5">
                    <span className="font-bold text-white/80">{p.rank}위</span>
                    <span className="font-extrabold num text-gold">{fmtNum(p.amount)}P</span>
                  </div>
                ))
              )
            ) : !game.notice && events.length === 0 ? (
              <div className="text-white/35 text-sm py-4 text-center">공지가 없습니다</div>
            ) : (
              <>
                {game.notice && (
                  <div className="bg-gold/15 border border-gold/30 rounded-xl px-4 py-2.5 text-sm text-gold font-semibold">
                    {game.notice}
                  </div>
                )}
                {events.slice(0, 3).map((e) => (
                  <div key={e.id} className="bg-white/5 rounded-xl px-4 py-2.5 text-sm text-white/80">{e.title}</div>
                ))}
              </>
            )}
          </div>
        </div>
        <div className="bg-black/40 border border-white/8 rounded-2xl backdrop-blur p-4 flex flex-col items-center gap-3">
          <div className="font-extrabold tracking-tight text-sm">
            ♠ ALL-IN <span className="text-mint">ONE</span>
          </div>
          {hasSupabase && game.joinCode && !closed && game.status !== 'ended' ? (
            // 셀프 바인 QR: 회원이 스캔 → 로그인 → 포인트로 즉시 바인 (레지 마감 전까지만 노출)
            <>
              <div className="bg-white p-2.5 rounded-xl ring-4 ring-mint/40">
                <QRCodeSVG value={absUrl(`/g/${game.joinCode}`)} size={128} />
              </div>
              <span className="text-[15px] font-bold text-mint tracking-wide">스캔하고 포인트로 바인</span>
              <div className="flex items-center gap-2 pt-1 border-t border-white/8 w-full justify-center">
                <div className="bg-white p-1 rounded-md">
                  <QRCodeSVG value={signupUrl} size={44} />
                </div>
                <span className="text-[13px] text-white/45 leading-tight">처음이면<br />회원가입</span>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white p-2.5 rounded-xl">
                <QRCodeSVG value={absUrl('/rank')} size={110} />
              </div>
              <span className="text-[15px] text-white/60">{closed && hasSupabase ? '레지 마감 · 스캔하고 랭킹 확인' : '스캔하고 랭킹 확인'}</span>
            </>
          )}
        </div>
        <button
          onClick={fullscreen}
          className="text-[15px] text-white/40 hover:text-white/80 py-1"
        >
          ⛶ 전체화면 전환
        </button>
      </aside>
    </div>
  )
}
