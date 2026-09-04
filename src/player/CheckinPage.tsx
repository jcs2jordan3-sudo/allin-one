import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { hasSupabase } from '../lib/supabase'
import { signOut, useAuth } from '../auth'
import type { Game } from '../types'
import { isRegClosed, isScheduled, useNow } from '../lib/time'
import { Badge, Btn, Card } from '../components/ui'
import Splash from '../components/Splash'
import PlayerShell from './PlayerShell'
import { LocalNotice } from './JoinPage'
import { checkinSelf, checkoutSelf, fetchOpenGames, fetchStoreName, type CheckinResult } from './api'

/** 좌석 QR(/checkin?table=T&seat=N) 또는 매장 도착 체크인(/checkin) */
export default function CheckinPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const table = params.get('table') ? Number(params.get('table')) : undefined
  const seat = params.get('seat') ? Number(params.get('seat')) : undefined
  const status = useAuth((s) => s.status)
  const role = useAuth((s) => s.role)
  const session = useAuth((s) => s.session)
  const now = useNow(1000)
  const [result, setResult] = useState<CheckinResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [games, setGames] = useState<Game[]>([])
  const [storeName, setStoreName] = useState('')

  // 미로그인: 좌석 QR이면 가입 페이지가 좌석 안내를 보여주도록 table·seat를 그대로 넘김
  const joinUrl = table ? `/join?table=${table}&seat=${seat ?? ''}` : `/join?r=${encodeURIComponent('/checkin')}`

  useEffect(() => {
    if (status === 'ready' && !session) navigate(joinUrl, { replace: true })
  }, [status, session, navigate, joinUrl])

  // 회원이면 진입 즉시 체크인 (좌석 QR은 그 자리, 아니면 대기 등록)
  useEffect(() => {
    if (role.kind !== 'member') return
    let cancelled = false
    setBusy(true)
    checkinSelf(table, seat).then((r) => {
      if (cancelled) return
      setBusy(false)
      if (r.error) setError(r.error)
      else setResult(r.result)
    })
    fetchOpenGames(role.storeId).then(setGames).catch(() => {})
    fetchStoreName(role.storeId).then((s) => setStoreName(s?.name ?? '')).catch(() => {})
    return () => { cancelled = true }
  }, [role, table, seat])

  if (!hasSupabase) return <LocalNotice />
  if (status === 'loading' || !session) return <Splash text="확인 중…" />
  if (role.kind !== 'member') {
    return (
      <PlayerShell>
        <Card className="p-6 text-center space-y-3">
          <div className="font-bold">{role.kind === 'staff' ? '직원 계정입니다' : '회원 정보를 찾을 수 없습니다'}</div>
          <p className="text-sm text-mut">체크인은 손님(회원) 계정으로만 가능합니다.</p>
          {role.kind === 'staff' && <Link to="/" className="block"><Btn className="w-full">관리자 콘솔로</Btn></Link>}
          <Btn variant="ghost" className="w-full" onClick={() => signOut()}>로그아웃</Btn>
        </Card>
      </PlayerShell>
    )
  }

  const checkout = async () => {
    setBusy(true)
    const err = await checkoutSelf()
    setBusy(false)
    if (err) return setError(err)
    navigate('/me')
  }

  return (
    <PlayerShell storeName={storeName} right={<Link to="/me" className="text-[15px] text-mut hover:text-ink">내 정보</Link>}>
      <Card className={`p-6 text-center ${result ? 'border-mint/40 bg-mint/8' : ''}`}>
        {busy && !result && <div className="text-mut">체크인 처리 중…</div>}
        {error && (
          <>
            <div className="text-rose font-bold text-lg">체크인 실패</div>
            <p className="text-sm text-mut mt-2 leading-relaxed">{error}</p>
            <Btn className="mt-4" onClick={() => navigate('/me')}>내 정보로</Btn>
          </>
        )}
        {result && (
          <>
            <div className="text-mint font-extrabold text-lg">✓ 체크인 완료</div>
            {result.status === 'seated' ? (
              <div className="mt-2 text-3xl font-black num tracking-tight">TABLE {result.table} · {result.seat}번 좌석</div>
            ) : (
              <div className="mt-2 text-3xl font-black num tracking-tight">대기 {result.position ?? '-'}번째</div>
            )}
            <p className="mt-3 text-[15px] text-mut leading-relaxed">
              {result.status === 'seated'
                ? '직원이 화면에서 확인합니다. 아래 게임을 선택해 바인하면 이 자리로 배정됩니다.'
                : '순서가 되면 직원이 호출합니다. 자리에 앉은 뒤 좌석 QR을 스캔하면 착석 처리됩니다.'}
            </p>
          </>
        )}
      </Card>

      {result && games.length > 0 && (
        <section>
          <h2 className="text-[17px] font-bold mb-2">지금 바인 가능한 게임</h2>
          <div className="space-y-2">
            {games.map((g) => {
              const closed = isRegClosed(g, now)
              const scheduled = isScheduled(g, now)
              return (
                <Link key={g.id} to={`/g/${g.joinCode}`} className="block">
                  <Card className="px-4 py-3.5 flex items-center gap-3 hover:border-mint/40 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">{g.name}</div>
                      <div className="text-[15px] text-mut num">TABLE {g.tables.join('·')} · {g.entries.filter((e) => e.status === 'playing').length}명 참여 중</div>
                    </div>
                    {scheduled ? <Badge tone="sky">예약</Badge> : closed ? <Badge tone="rose">마감</Badge> : <Badge tone="mint">바인 ›</Badge>}
                  </Card>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {result && (
        <Btn variant="ghost" className="w-full" onClick={checkout} disabled={busy}>체크아웃 (매장 나감)</Btn>
      )}
    </PlayerShell>
  )
}
