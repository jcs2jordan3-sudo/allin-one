import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { selTotalChips, useStore } from '../store'
import type { BlindLevel, Game } from '../types'
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

  return (
    <div className="min-h-screen stage-bg text-ink flex flex-col p-6 max-sm:p-3 gap-6 max-sm:gap-4">
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
        // 게임 수·화면 폭과 상관없이 카드를 한 줄에 나란히(폭 균등) — 폰도 동일. 글자는 카드 폭 기준(cqw)이라 카드가 좁아지면 같이 줄어든다.
        // TV에서는 세로 중앙 정렬.
        <div className="flex-1 grid grid-flow-col auto-cols-fr gap-5 max-sm:gap-2 content-center">
          {live.map((g) => <GameCard key={g.id} game={g} now={now} />)}
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

// 글자 크기는 화면이 아니라 카드 폭(cqw) 기준 — 한 줄에 카드가 몇 개든 카드 안에 맞게 줄어든다
// 폭 계산: MM:SS 5자·H:MM:SS 7자 → 18cqw면 최대 78cqw, HH:MM:SS 8자 → 13cqw면 64cqw, 블라인드 21자 → 6cqw면 73cqw
// 검은 굵기 숫자는 폭이 약 0.72em, 콜론 0.3em: MM:SS≈3.2em → 16cqw면 51cqw, H:MM:SS≈4.2em → 67cqw, HH:MM:SS≈4.9em → 12cqw면 59cqw
const timerCls = 'text-[clamp(14px,16cqw,150px)]'
const clockCls = 'text-[clamp(12px,12cqw,120px)]'

// 아주 좁은 카드(@max-2xs, 288px 미만 — 폰에 게임 2개 이상)에서는 5,000/10,000 (10,000) 대신 5K/10K (10K)
const fmtK = (n: number) => (n >= 1000 ? (n % 1000 === 0 ? `${n / 1000}K` : `${(n / 1000).toFixed(1)}K`) : String(n))
const blindText = (l: BlindLevel, compact: boolean) =>
  l.type === 'break' ? 'BREAK' : compact ? `${fmtK(l.sb)}/${fmtK(l.bb)} (${fmtK(l.ante)})` : `${fmtNum(l.sb)}/${fmtNum(l.bb)} (${fmtNum(l.ante)})`
const Blinds = ({ level }: { level: BlindLevel }) => (
  <>
    <span className="@max-2xs:hidden">{blindText(level, false)}</span>
    <span className="hidden @max-2xs:inline">{blindText(level, true)}</span>
  </>
)
const blindCls = 'text-[clamp(9px,6cqw,48px)]'
const labelCls = 'text-[clamp(10px,3.2cqw,22px)]'
const nextCls = 'text-[clamp(8px,2.4cqw,18px)]'
const titleCls = 'text-[clamp(12px,3.6cqw,30px)]'
const badgeCls = 'text-[clamp(9px,2.4cqw,14px)] font-bold rounded-sm px-2 @max-3xs:px-1 py-0.5 border whitespace-nowrap'
const statCls = 'text-[clamp(10px,3cqw,24px)]'

function GameCard({ game, now }: { game: Game; now: number }) {
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
    // 컨테이너 쿼리는 조상 컨테이너 기준으로 평가되므로, 카드 자체의 여백(@max-sm:p-3)까지 줄이려면 래퍼가 컨테이너여야 한다
    <div className="@container min-w-0">
    <Link
      to={withStore(`/display/${game.id}`)}
      className="block h-full min-w-0 bg-black/40 border border-white/8 rounded-2xl backdrop-blur p-6 @max-sm:p-3 hover:border-mint/40 transition-colors"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <h2 className={`${titleCls} font-extrabold tracking-tight leading-tight`}>{game.name}</h2>
        <div className="flex flex-wrap justify-end gap-2 shrink-0">
          {scheduled && <span className={`${badgeCls} text-sky border-sky/40`}>예약</span>}
          {game.status === 'paused' && <span className={`${badgeCls} text-gold border-gold/40`}>PAUSED</span>}
          {!scheduled && closed && <span className={`${badgeCls} text-rose border-rose/40`}>REG CLOSED</span>}
        </div>
      </div>

      {/* 전광판과 같은 세로 구성(레벨 → 타이머 → 블라인드 → NEXT), 가운데 정렬. 한 줄씩이라 카드가 좁아도 넘치지 않는다 */}
      <div className="mt-5 text-center whitespace-nowrap">
        {scheduled ? (
          <>
            <div className={`${labelCls} font-bold text-sky tracking-wide`}>시작까지</div>
            <div className={`${clockCls} leading-none font-black num tracking-tight mt-1`}>{fmtClock(game.startedAt - now)}</div>
            <div className={`${nextCls} mt-3 text-white/60 font-bold tracking-widest`}>사전 등록 접수 중</div>
          </>
        ) : (
          <>
            <div className={`${labelCls} font-bold text-mint tracking-wide`}>
              {pos.level.label}
              {isBreak && <span className="text-gold ml-2">BREAK{pos.level.colorUp ? ` · 칩 제거 ${fmtNum(pos.level.colorUp)}` : ''}</span>}
            </div>
            <div className={`${timerCls} leading-none font-black num tracking-tight mt-1`}>{fmtCountdown(pos.remainMs)}</div>
            <div className={`${blindCls} font-black num leading-tight mt-3`}>
              <Blinds level={pos.level} />
            </div>
            {next && (
              <div className={`mt-1 text-white/60 font-bold tracking-widest @max-xs:tracking-normal @max-3xs:whitespace-normal ${nextCls} num`}>
                NEXT · <Blinds level={next} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-5 @max-sm:mt-3 grid grid-cols-4 @max-lg:grid-cols-2 @max-2xs:grid-cols-1 gap-2 @max-sm:gap-1.5">
        {stats.map((s) => (
          <div key={s.label} className="bg-white/5 rounded-xl px-3 py-2.5 @max-sm:px-2 @max-sm:py-1.5 @max-2xs:px-1.5 min-w-0">
            <div className="text-[clamp(8px,2cqw,13px)] font-bold tracking-[0.14em] text-white/55 whitespace-nowrap @max-2xs:whitespace-normal @max-2xs:tracking-normal">{s.label}</div>
            <div className={`mt-0.5 ${statCls} font-extrabold num ${s.tone ?? ''}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-right text-[15px] text-mint/80">전광판 열기 ›</div>
    </Link>
    </div>
  )
}
