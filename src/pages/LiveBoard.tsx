import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { selTotalChips, useStore } from '../store'
import type { Game } from '../types'
import {
  fmtClock, fmtCountdown, gameElapsedMs, isRegClosed, isScheduled, levelAt, nextLevel, regCloseRemainMs, useNow,
} from '../lib/time'
import { fmtNum, maskName } from '../lib/format'
import { bizDayRange } from '../lib/notice'
import { withStore } from '../lib/storeUrl'

const MEDALS = ['🥇', '🥈', '🥉']
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 매장 전체 실시간 현황 — 진행·예약 중인 게임을 한 화면에.
 * 주소가 게임이 아니라 매장 단위(/live?s=매장id)라 새 게임을 열어도 바뀌지 않는다.
 * 용도: 입구·바 TV 고정 화면, 카톡 공지의 고정 링크. 로그인 불필요.
 */
export default function LiveBoard() {
  const storeName = useStore((s) => s.storeName)
  const games = useStore((s) => s.games)
  const members = useStore((s) => s.members)
  const now = useNow(500)

  // 셀렉터 안에서 새 배열을 만들면 zustand v5가 무한 리렌더하므로 useMemo로 파생
  const live = useMemo(
    () => games.filter((g) => g.status !== 'ended' && !g.cancelled).sort((a, b) => a.startedAt - b.startedAt),
    [games],
  )
  const endedToday = useMemo(() => {
    const { from, to } = bizDayRange(Date.now())
    return games
      .filter((g) => g.status === 'ended' && !g.cancelled && g.startedAt >= from && g.startedAt < to)
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  }, [games])
  const nick = useMemo(() => new Map(members.map((m) => [m.id, m.nickname])), [members])

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen().catch(() => {})
  }
  const d = new Date(now)
  const cols = live.length >= 3 ? 'xl:grid-cols-3' : live.length === 2 ? 'lg:grid-cols-2' : ''

  return (
    <div className="min-h-screen stage-bg text-ink flex flex-col p-6 gap-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-extrabold tracking-tight text-sm text-white/60">
            ♠ ALL-IN <span className="text-mint">ONE</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight mt-1">{storeName} 실시간 현황</h1>
        </div>
        <div className="flex items-center gap-5">
          <span className="text-3xl font-black num text-white/85">
            {pad(d.getHours())}:{pad(d.getMinutes())}<span className="text-white/40 text-xl">:{pad(d.getSeconds())}</span>
          </span>
          <button onClick={fullscreen} className="text-[15px] text-white/40 hover:text-white/80 py-1">⛶ 전체화면</button>
        </div>
      </header>

      {live.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
          <div className="text-4xl font-black tracking-tight text-white/85">지금 진행 중인 게임이 없습니다</div>
          <div className="text-mut text-lg">게임이 시작되면 이 화면에 자동으로 나타납니다.</div>
        </div>
      ) : (
        // TV(세로 여유)에서는 카드를 세로 중앙에, 게임이 하나면 타이머를 더 크게
        <div className={`flex-1 grid grid-cols-1 ${cols} gap-5 content-center`}>
          {live.map((g) => <GameCard key={g.id} game={g} now={now} big={live.length === 1} />)}
        </div>
      )}

      {endedToday.length > 0 && (
        <section className="mt-2">
          <h2 className="text-[17px] font-bold tracking-[0.14em] text-white/55 mb-3">오늘 종료된 게임</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {endedToday.map((g) => {
              const top = [...g.entries].filter((e) => e.rank).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).slice(0, 3)
              const e = g.endedAt ? new Date(g.endedAt) : null
              return (
                <div key={g.id} className="bg-black/30 border border-white/8 rounded-2xl px-5 py-3.5 backdrop-blur flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate">{g.name}</div>
                    <div className="text-[15px] text-white/50 num">
                      {g.entries.length}명{e ? ` · ${pad(e.getHours())}:${pad(e.getMinutes())} 종료` : ''}
                    </div>
                  </div>
                  <div className="text-[16px] font-semibold whitespace-nowrap">
                    {top.length === 0
                      ? <span className="text-white/35">결과 없음</span>
                      : top.map((t, k) => (
                        <span key={t.memberId} className="mr-2">{MEDALS[k]}{maskName(nick.get(t.memberId) ?? '회원')}</span>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <footer className="text-center mt-auto pt-4">
        <Link to="/" className="text-[15px] text-white/30 hover:text-white/60">관리자 콘솔</Link>
      </footer>
    </div>
  )
}

function GameCard({ game, now, big }: { game: Game; now: number; big?: boolean }) {
  const timerCls = big ? 'text-[clamp(56px,11vw,128px)]' : 'text-[clamp(44px,7vw,72px)]'
  const blindCls = big ? 'text-[clamp(26px,4.5vw,56px)]' : 'text-[clamp(22px,3vw,34px)]'
  const elapsed = gameElapsedMs(game, now)
  const pos = levelAt(game.snapshot.levels, elapsed)
  const next = nextLevel(game.snapshot.levels, pos.idx)
  const playing = game.entries.filter((e) => e.status === 'playing').length
  const totalChips = selTotalChips(game)
  const avg = playing > 0 ? Math.round(totalChips / playing) : 0
  const closed = isRegClosed(game, now)
  const scheduled = isScheduled(game, now)
  const regRemain = regCloseRemainMs(game, now)
  const isBreak = pos.level.type === 'break'

  const stats: { label: string; value: string; tone?: string }[] = [
    { label: 'PLAYERS', value: `${playing}/${game.entries.length}` },
    { label: 'AVG STACKS', value: fmtNum(avg) },
    { label: 'TABLES', value: String(game.tables.length) },
    { label: 'REG CLOSE', value: closed ? 'CLOSED' : fmtClock(regRemain), tone: closed ? 'text-rose' : undefined },
  ]

  return (
    <Link
      to={withStore(`/display/${game.id}`)}
      className="block bg-black/40 border border-white/8 rounded-2xl backdrop-blur p-6 hover:border-mint/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight leading-tight">{game.name}</h2>
        <div className="flex gap-2 shrink-0">
          {scheduled && <span className="text-[14px] font-bold text-sky border border-sky/40 rounded-sm px-2.5 py-1">예약</span>}
          {game.status === 'paused' && <span className="text-[14px] font-bold text-gold border border-gold/40 rounded-sm px-2.5 py-1">PAUSED</span>}
          {!scheduled && closed && <span className="text-[14px] font-bold text-rose border border-rose/40 rounded-sm px-2.5 py-1">REG CLOSED</span>}
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4 flex-wrap">
        {scheduled ? (
          <div>
            <div className="text-lg font-bold text-sky tracking-wide">시작까지</div>
            <div className={`${timerCls} leading-none font-black num tracking-tight`}>{fmtClock(game.startedAt - now)}</div>
          </div>
        ) : (
          <div>
            <div className="text-lg font-bold text-mint tracking-wide">
              {pos.level.label}
              {isBreak && <span className="text-gold ml-2">BREAK{pos.level.colorUp ? ` · 칩 제거 ${fmtNum(pos.level.colorUp)}` : ''}</span>}
            </div>
            <div className={`${timerCls} leading-none font-black num tracking-tight`}>{fmtCountdown(pos.remainMs)}</div>
          </div>
        )}
        <div className="text-right max-sm:text-left">
          <div className={`${blindCls} font-black num leading-tight`}>
            {scheduled ? '사전 등록 접수 중' : isBreak ? 'BREAK' : `${fmtNum(pos.level.sb)}/${fmtNum(pos.level.bb)} (${fmtNum(pos.level.ante)})`}
          </div>
          {!scheduled && next && (
            <div className="mt-1 text-white/60 font-bold tracking-widest text-[15px] num">
              NEXT · {next.type === 'break' ? 'BREAK' : `${fmtNum(next.sb)}/${fmtNum(next.bb)} (${fmtNum(next.ante)})`}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-4 max-sm:grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="bg-white/5 rounded-xl px-3 py-2.5">
            <div className="text-[13px] font-bold tracking-[0.14em] text-white/55">{s.label}</div>
            <div className={`mt-0.5 text-xl font-extrabold num ${s.tone ?? ''}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-right text-[15px] text-mint/80">전광판 열기 ›</div>
    </Link>
  )
}
