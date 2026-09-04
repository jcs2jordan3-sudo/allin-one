import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { hasSupabase } from '../lib/supabase'
import { signOut, useAuth } from '../auth'
import type { BuyinType, Currency } from '../types'
import { BUYIN_TYPE_LABEL, CURRENCY_LABEL, CURRENCY_UNIT } from '../types'
import { fmtCountdown, gameElapsedMs, isRegClosed, isScheduled, levelAt, useNow, fmtClock } from '../lib/time'
import { fmtNum } from '../lib/format'
import { Badge, Btn, Card } from '../components/ui'
import Splash from '../components/Splash'
import Avatar from '../components/Avatar'
import PlayerShell from './PlayerShell'
import AuthForm from './AuthForm'
import { LocalNotice } from './JoinPage'
import { fetchGameByCode, fetchMe, selfBuyin, subscribeGame, subscribeMe, type BuyinResult, type GameByCode, type MyInfo } from './api'

/** 전광판 QR → 셀프 바인 페이지 (/g/:code) */
export default function GameJoinPage() {
  const { code = '' } = useParams()
  const status = useAuth((s) => s.status)
  const role = useAuth((s) => s.role)
  const session = useAuth((s) => s.session)
  const now = useNow(1000)

  const [data, setData] = useState<GameByCode | null | 'notfound' | 'error'>(null)
  const [me, setMe] = useState<MyInfo | null>(null)
  const [currency, setCurrency] = useState<Currency>('P')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BuyinResult | null>(null)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const load = useCallback(() => {
    fetchGameByCode(code).then((d) => setData(d ?? 'notfound')).catch(() => setData('error'))
  }, [code])
  useEffect(() => { if (hasSupabase) load() }, [load])

  const gameId = typeof data === 'object' && data ? data.game.id : null
  useEffect(() => {
    if (!gameId) return
    return subscribeGame(gameId, load)
  }, [gameId, load])

  const userId = session?.user.id
  const memberId = role.kind === 'member' ? role.memberId : null
  const loadMe = useCallback(() => {
    if (!userId) return
    fetchMe(userId).then(setMe).catch(() => setMe(null))
  }, [userId])
  useEffect(() => { if (role.kind === 'member') loadMe() }, [role.kind, loadMe])
  useEffect(() => {
    if (!memberId) return
    return subscribeMe(memberId, loadMe)
  }, [memberId, loadMe])

  // ── 바인 규칙 계산 (서버와 같은 규칙, 표시용) ─────────────────────────
  const game = typeof data === 'object' && data ? data.game : null
  const myEntry = game && me ? game.entries.find((e) => e.memberId === me.member.id) : undefined
  const type: BuyinType = !myEntry ? 'BUYIN' : myEntry.status === 'playing' ? 'RE_BUYIN' : 'RE_ENTRY'
  const round = useMemo(() => {
    if (!game || !me || type === 'BUYIN') return 1
    return game.buyins.filter((b) => b.memberId === me.member.id && b.type === type).length + 1
  }, [game, me, type])
  const rule = game?.snapshot.buyinRules.find((r) => r.type === type && r.round === round)
  const pos = game ? levelAt(game.snapshot.levels, gameElapsedMs(game, now)) : null
  const earlyBird = game && pos && type !== 'RE_BUYIN' ? game.snapshot.earlyBird.find((r) => r.levelIndex === pos.idx) : undefined
  const closed = game ? isRegClosed(game, now) : false
  const scheduled = game ? isScheduled(game, now) : false
  const ended = game?.status === 'ended'
  const allowed = (['P', 'S', 'V'] as Currency[]).filter((c) => rule?.cost[c] !== undefined)

  useEffect(() => {
    if (allowed.length > 0 && !allowed.includes(currency)) setCurrency(allowed[0])
  }, [allowed, currency])

  const submit = async () => {
    if (!game) return
    setBusy(true)
    setError(null)
    const r = await selfBuyin(game.id, currency, requestId)
    setBusy(false)
    if (r.error) return setError(r.error)
    setResult(r.result)
    setRequestId(crypto.randomUUID()) // 다음 바인은 새 요청
    load()
    loadMe()
  }

  if (!hasSupabase) return <LocalNotice />
  if (status === 'loading' || data === null) return <Splash text="게임 정보 불러오는 중…" />
  if (data === 'notfound') return <Splash text="게임을 찾을 수 없습니다" sub="QR이 오래됐거나 게임이 삭제됐을 수 있어요. 전광판의 QR을 다시 스캔해주세요." />
  if (data === 'error') return <Splash text="게임 정보를 불러오지 못했습니다" sub="네트워크를 확인하고 다시 시도해주세요." />
  if (!game || !pos) return null

  const cost = rule ? rule.cost[currency] : undefined
  const myBal = me?.member.balances[currency] ?? 0
  const insufficient = cost !== undefined && myBal < cost

  return (
    <PlayerShell
      storeName={data.storeName}
      right={session ? <Link to="/me" className="text-[13px] text-mut hover:text-ink">내 정보</Link> : undefined}
    >
      {/* 게임 상태 */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold tracking-widest text-faint uppercase">{game.gameSetName}</div>
            <h1 className="text-xl font-extrabold tracking-tight truncate">{game.name}</h1>
          </div>
          {ended ? <Badge tone="mut">종료</Badge> : scheduled ? <Badge tone="sky">예약</Badge> : closed ? <Badge tone="rose">레지 마감</Badge> : <Badge tone="mint">참여 가능</Badge>}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label={scheduled ? '시작까지' : pos.level.label} value={scheduled ? fmtClock(game.startedAt - now) : fmtCountdown(pos.remainMs)} accent />
          <Stat label="블라인드" value={pos.level.type === 'break' ? 'BREAK' : `${fmtNum(pos.level.sb)}/${fmtNum(pos.level.bb)}`} />
          <Stat label="PLAYERS" value={`${game.entries.filter((e) => e.status === 'playing').length}/${game.entries.length}`} />
        </div>
        {game.notice && <div className="mt-3 text-[13px] text-gold bg-gold/10 border border-gold/25 rounded-xl px-3 py-2">{game.notice}</div>}
      </Card>

      {/* 성공 */}
      {result && (
        <Card className="p-5 border-mint/40 bg-mint/8">
          <div className="text-mint font-extrabold text-lg">✓ {BUYIN_TYPE_LABEL[result.type]} 완료</div>
          <div className="mt-2 text-3xl font-black num tracking-tight">
            TABLE {result.table} · {result.seat}번 좌석
          </div>
          <div className="mt-1.5 text-sm text-mut num">
            {fmtNum(result.chips)}칩{result.earlyBirdChips ? ` + 얼리버드 ${fmtNum(result.earlyBirdChips)}칩` : ''} ·{' '}
            {CURRENCY_LABEL[result.currency]} {result.cost}{CURRENCY_UNIT[result.currency]} 결제
          </div>
          <p className="mt-3 text-[13px] text-mut">좌석으로 이동해 딜러에게 이 화면을 보여주세요.</p>
          <Btn sm variant="ghost" className="mt-2" onClick={() => setResult(null)}>닫기</Btn>
        </Card>
      )}

      {/* 로그인 필요 */}
      {!session && !ended && (
        <Card className="p-5">
          <div className="font-bold mb-1">바인하려면 로그인하세요</div>
          <p className="text-[13px] text-mut mb-4">처음이면 30초 만에 가입할 수 있어요. 가입 후 이 게임으로 바로 돌아옵니다.</p>
          <AuthForm storeId={data.storeId} defaultMode="login" onDone={() => { /* 역할 갱신 후 자동 렌더 */ }} />
        </Card>
      )}

      {session && role.kind === 'staff' && (
        <Card className="p-5 text-center space-y-3">
          <div className="font-bold">직원 계정입니다</div>
          <p className="text-sm text-mut">손님 참가 등록은 콘솔의 "참가 등록"에서 처리하세요.</p>
          <Link to="/" className="block"><Btn className="w-full">관리자 콘솔로</Btn></Link>
          <Btn variant="ghost" className="w-full" onClick={() => signOut()}>로그아웃</Btn>
        </Card>
      )}

      {session && role.kind === 'none' && (
        <Card className="p-5 text-center space-y-3">
          <div className="font-bold">회원 정보를 찾을 수 없습니다</div>
          <p className="text-sm text-mut">카운터 직원에게 문의해주세요.</p>
          <Btn variant="ghost" className="w-full" onClick={() => signOut()}>로그아웃</Btn>
        </Card>
      )}

      {/* 셀프 바인 */}
      {role.kind === 'member' && me && !ended && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar emoji={me.member.emoji} color={me.member.color} size={40} />
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate">{me.member.nickname} <span className="text-mut font-normal text-[13px] num">({me.member.no})</span></div>
              <div className="text-[13px] text-mut num">
                {fmtNum(me.member.balances.P)}P · {fmtNum(me.member.balances.S)}S · {me.member.balances.V}장
              </div>
            </div>
            {myEntry && (
              <Badge tone={myEntry.status === 'playing' ? 'mint' : 'rose'}>
                {myEntry.status === 'playing' ? `T${myEntry.table}·${myEntry.seat}번 참여 중` : `탈락 ${myEntry.rank ? myEntry.rank + '위' : ''}`}
              </Badge>
            )}
          </div>

          {closed ? (
            <div className="text-sm text-rose bg-rose/10 border border-rose/25 rounded-xl px-3 py-2.5">
              레지스트레이션이 마감되어 더 이상 바인할 수 없습니다.
            </div>
          ) : !rule ? (
            <div className="text-sm text-mut bg-surface2 rounded-xl px-3 py-2.5">
              {round}회차 {BUYIN_TYPE_LABEL[type]} 규칙이 없습니다 (한도 초과). 직원에게 문의해주세요.
            </div>
          ) : (
            <>
              <div>
                <div className="text-[13px] font-semibold text-mut mb-1.5">
                  {round}회차 {BUYIN_TYPE_LABEL[type]} → <span className="text-gold num">{fmtNum(rule.chips)}칩</span>
                  {earlyBird && <span className="text-mint num"> + 얼리버드 {fmtNum(earlyBird.chips)}칩</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['P', 'S', 'V'] as Currency[]).map((c) => {
                    const cc = rule.cost[c]
                    const disabled = cc === undefined
                    const bal = me.member.balances[c]
                    return (
                      <button
                        key={c}
                        disabled={disabled}
                        onClick={() => setCurrency(c)}
                        className={`px-2 py-2.5 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-30 ${
                          currency === c ? 'border-mint/60 bg-mint/10 text-mint' : 'border-line2 text-mut'
                        }`}
                      >
                        {CURRENCY_LABEL[c]}
                        <span className="block text-[12px] font-normal num">
                          {disabled ? '사용 불가' : `${cc}${CURRENCY_UNIT[c]} · 보유 ${fmtNum(bal)}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              {insufficient && (
                <div className="text-[13px] text-rose">
                  {CURRENCY_LABEL[currency]} 잔액이 부족합니다. 카운터에서 현금·카드로 결제하면 직원이 포인트를 넣어드려요.
                </div>
              )}
              {error && <div className="text-sm text-rose">{error}</div>}
              <Btn
                variant="primary"
                className="w-full !py-3.5 text-base"
                disabled={busy || insufficient || cost === undefined}
                onClick={submit}
              >
                {busy ? '처리 중…' : `${CURRENCY_LABEL[currency]} ${cost ?? ''}${cost !== undefined ? CURRENCY_UNIT[currency] : ''}로 ${BUYIN_TYPE_LABEL[type]}하기`}
              </Btn>
              <p className="text-[12px] text-faint leading-relaxed">
                누르는 즉시 참가비가 차감되고 좌석이 배정됩니다. 참가비는 매장 재화로만 결제되며 현금으로 환전되지 않습니다.
              </p>
            </>
          )}
        </Card>
      )}

      {ended && <Card className="p-5 text-center text-mut text-sm">종료된 게임입니다.</Card>}
    </PlayerShell>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-surface2/60 border border-line rounded-xl px-2 py-2.5">
      <div className="text-[11px] font-bold tracking-widest text-faint uppercase truncate">{label}</div>
      <div className={`mt-0.5 text-lg font-extrabold num ${accent ? 'text-mint' : ''}`}>{value}</div>
    </div>
  )
}
