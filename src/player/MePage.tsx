import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hasSupabase } from '../lib/supabase'
import { refreshRole, signOut, useAuth } from '../auth'
import type { Game } from '../types'
import { CURRENCY_LABEL, CURRENCY_UNIT } from '../types'
import { fmtDateTime, fmtNum } from '../lib/format'
import { isRegClosed, isScheduled, useNow } from '../lib/time'
import { COLORS, EMOJIS } from '../lib/avatar'
import { formatPhone, isKrMobile } from '../lib/phone'
import { Badge, Btn, Card, Field, Input, Modal } from '../components/ui'
import Splash from '../components/Splash'
import Avatar from '../components/Avatar'
import PasswordChange from '../components/PasswordChange'
import PlayerShell from './PlayerShell'
import { LocalNotice } from './JoinPage'
import { WAIT_STATUS_LABEL, type Pass, type PassType, type WaitEntry } from '../types'
import { withCompetitionRanks } from '../lib/rank'
import { ParticipantPreview, toRosterMap } from './Participants'
import { checkinSelf, checkoutSelf, fetchMe, fetchMyGames, fetchMyPasses, fetchMyWait, fetchOpenGames, fetchOpenSeason, fetchRoster, fetchStoreName, subscribeMe, subscribeStoreGames, updateMyProfile, type MyInfo, type RosterMember } from './api'

const MEDALS = ['🥇', '🥈', '🥉']

/** 회원 내 정보 — 지갑·회원번호·매장 랭킹·진행 중 게임(참가자)·참가 현황·최근 거래 */
export default function MePage() {
  const navigate = useNavigate()
  const status = useAuth((s) => s.status)
  const role = useAuth((s) => s.role)
  const session = useAuth((s) => s.session)
  const now = useNow(1000)
  const [me, setMe] = useState<MyInfo | null | undefined>(undefined)
  const [open, setOpen] = useState<Game[]>([])
  const [mine, setMine] = useState<Game[]>([])
  const [storeName, setStoreName] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [wait, setWait] = useState<WaitEntry | null>(null)
  const [passes, setPasses] = useState<{ passes: Pass[]; types: PassType[] }>({ passes: [], types: [] })
  const [waitBusy, setWaitBusy] = useState(false)
  const [waitErr, setWaitErr] = useState<string | null>(null)
  const [roster, setRoster] = useState<RosterMember[]>([])
  const [season, setSeason] = useState<{ id: string; name: string } | null>(null)
  const [rankOpen, setRankOpen] = useState(false)

  useEffect(() => {
    if (status === 'ready' && !session) navigate('/join?r=/me', { replace: true })
  }, [status, session, navigate])

  const userId = session?.user.id
  const memberId = role.kind === 'member' ? role.memberId : null
  const storeId = role.kind === 'member' ? role.storeId : null

  const load = useCallback(() => {
    if (!userId || !memberId || !storeId) return
    fetchMe(userId).then(setMe).catch(() => setMe(null))
    fetchOpenGames(storeId).then(setOpen).catch(() => {})
    fetchMyGames(memberId).then(setMine).catch(() => {})
    fetchStoreName(storeId).then((s) => setStoreName(s?.name ?? '')).catch(() => {})
    fetchMyWait(memberId).then((w) => setWait(w?.entry ?? null)).catch(() => {})
    fetchMyPasses(memberId).then(setPasses).catch(() => {})
    fetchRoster().then(setRoster).catch(() => {})
    fetchOpenSeason(storeId).then(setSeason).catch(() => {})
  }, [userId, memberId, storeId])

  const doCheckin = async () => {
    setWaitBusy(true); setWaitErr(null)
    const r = await checkinSelf()
    setWaitBusy(false)
    if (r.error) return setWaitErr(r.error)
    load()
  }
  const doCheckout = async () => {
    setWaitBusy(true); setWaitErr(null)
    const err = await checkoutSelf()
    setWaitBusy(false)
    if (err) return setWaitErr(err)
    load()
  }
  useEffect(load, [load])
  useEffect(() => {
    if (!memberId) return
    return subscribeMe(memberId, load)
  }, [memberId, load])
  useEffect(() => {
    if (!storeId) return
    return subscribeStoreGames(storeId, load)
  }, [storeId, load])

  if (!hasSupabase) return <LocalNotice />
  if (status === 'loading' || !session) return <Splash text="불러오는 중…" />

  if (role.kind === 'staff') {
    return (
      <PlayerShell>
        <Card className="p-6 text-center space-y-3">
          <div className="font-bold">직원 계정입니다</div>
          <Link to="/" className="block"><Btn className="w-full">관리자 콘솔로</Btn></Link>
          <Btn variant="ghost" className="w-full" onClick={() => signOut()}>로그아웃</Btn>
        </Card>
      </PlayerShell>
    )
  }
  if (role.kind === 'none') {
    return (
      <PlayerShell>
        <Card className="p-6 text-center space-y-3">
          <div className="font-bold">회원 정보를 찾을 수 없습니다</div>
          <p className="text-sm text-mut">카운터 직원에게 문의해주세요.</p>
          <Btn className="w-full" onClick={() => refreshRole()}>다시 확인</Btn>
          <Btn variant="ghost" className="w-full" onClick={() => signOut()}>로그아웃</Btn>
        </Card>
      </PlayerShell>
    )
  }
  if (me === undefined) return <Splash text="내 정보 불러오는 중…" />
  if (me === null) return <Splash text="내 정보를 불러오지 못했습니다" sub="네트워크를 확인하고 다시 시도해주세요." />

  const m = me.member
  const rosterMap = toRosterMap(roster)
  const ranked = withCompetitionRanks([...roster].filter((r) => r.rp > 0).sort((a, b) => b.rp - a.rp))
  const myRank = ranked.find((r) => r.item.id === m.id)?.rank ?? null

  return (
    <PlayerShell
      storeName={storeName}
      right={<button onClick={() => signOut()} className="text-[15px] text-mut hover:text-ink">로그아웃</button>}
    >
      {/* 프로필 */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Avatar emoji={m.emoji} color={m.color} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg truncate">{m.nickname}</span>
              <button onClick={() => setEditOpen(true)} className="text-mut hover:text-mint text-sm" aria-label="프로필 수정">✎</button>
            </div>
            <div className="text-[15px] text-mut">회원번호 <span className="text-ink font-bold num text-base">{m.no}</span></div>
          </div>
          <div className="text-right">
            <div className="text-[13px] font-bold tracking-widest text-faint">RP</div>
            <div className="text-xl font-extrabold num">{fmtNum(m.rp)}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(['P', 'S', 'V'] as const).map((c) => (
            <div key={c} className="bg-surface2/60 border border-line rounded-xl px-3 py-2.5 text-center">
              <div className="text-[13px] font-bold tracking-widest text-faint">{CURRENCY_LABEL[c]}</div>
              <div className={`mt-0.5 text-lg font-extrabold num ${c === 'P' ? 'text-gold' : c === 'S' ? 'text-sky' : 'text-viol'}`}>
                {fmtNum(m.balances[c])}<span className="text-[14px] ml-0.5">{CURRENCY_UNIT[c]}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[14px] text-faint leading-relaxed">
          포인트 충전은 카운터에서 현금·카드로 결제하면 직원이 넣어드립니다. 회원번호를 알려주세요.
        </p>
      </Card>

      {/* 매장 랭킹 */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold tracking-widest text-faint">
              매장 랭킹{season && <span className="ml-1.5 text-mut tracking-normal font-semibold">{season.name}</span>}
            </div>
            <div className="mt-0.5 font-bold">
              {myRank
                ? <>내 순위 <span className="text-gold num text-lg">{myRank}위</span><span className="text-mut font-normal text-[15px]"> / {ranked.length}명</span></>
                : <span className="text-mut font-normal text-[15px]">RP를 모으면 순위에 올라요</span>}
            </div>
          </div>
          <Btn sm onClick={() => setRankOpen(true)}>전체 보기</Btn>
        </div>
        {ranked.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {ranked.slice(0, 3).map(({ item, rank }) => (
              <span key={item.id} className="inline-flex items-center gap-1.5 text-[15px]">
                <span>{MEDALS[rank - 1] ?? `${rank}위`}</span>
                <Avatar emoji={item.emoji} color={item.color} size={22} />
                <span className={item.id === m.id ? 'text-mint font-bold' : 'text-mut'}>{item.nickname}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* 체크인 · 이용권 */}
      <Card className="p-4 flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold tracking-widest text-faint">매장 체크인</div>
          {wait ? (
            <div className="font-bold">
              {wait.status === 'seated' ? `TABLE ${wait.table} · ${wait.seat}번 좌석 착석 중` : WAIT_STATUS_LABEL[wait.status]}
              {wait.status === 'called' && <span className="text-gold text-[15px] ml-2">직원이 호출했어요!</span>}
            </div>
          ) : (
            <div className="text-mut text-sm">체크인 전 · 좌석 QR을 스캔하면 자리에 체크인됩니다</div>
          )}
          {waitErr && <div className="text-[15px] text-rose mt-1">{waitErr}</div>}
        </div>
        {wait
          ? <Btn sm variant="ghost" onClick={doCheckout} disabled={waitBusy}>체크아웃</Btn>
          : <Btn sm variant="primary" onClick={doCheckin} disabled={waitBusy}>{waitBusy ? '…' : '도착 체크인'}</Btn>}
        {(() => {
          const valid = passes.passes.filter((p) => p.status === 'unused' && Date.now() <= p.expiresAt)
          if (valid.length === 0) return null
          // 종류별 장수와 가장 빠른 만료일
          const groups = [...new Set(valid.map((p) => p.typeId))].map((typeId) => {
            const list = valid.filter((p) => p.typeId === typeId)
            const t = passes.types.find((x) => x.id === typeId)
            return { key: typeId, name: t?.name ?? '이용권', color: t?.color ?? '#57B6F2', count: list.length, soonest: Math.min(...list.map((p) => p.expiresAt)) }
          })
          return (
            <div className="w-full border-t border-line pt-2 mt-1 space-y-1">
              <div className="text-[13px] font-bold tracking-widest text-faint">🎫 내 이용권 <span className="text-ink num">{valid.length}장</span></div>
              {groups.map((g) => (
                <div key={g.key} className="flex items-center gap-2 text-[15px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: g.color }} />
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-ink num">{g.count}장</span>
                  <span className="ml-auto text-[14px] text-faint num">{fmtDateTime(g.soonest).slice(0, 10)} 까지</span>
                </div>
              ))}
            </div>
          )
        })()}
      </Card>

      {/* 진행 중인 게임 */}
      <section>
        <h2 className="text-[17px] font-bold mb-2">진행 중인 게임</h2>
        {open.length === 0 ? (
          <Card className="p-5 text-center text-sm text-mut">지금 진행 중인 게임이 없습니다.</Card>
        ) : (
          <div className="space-y-2">
            {open.map((g) => {
              const closed = isRegClosed(g, now)
              const scheduled = isScheduled(g, now)
              const mineEntry = g.entries.find((e) => e.memberId === m.id)
              return (
                <Link key={g.id} to={`/g/${g.joinCode}`} className="block">
                  <Card className="px-4 py-3.5 flex items-center gap-3 hover:border-mint/40 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">{g.name}</div>
                      <div className="text-[15px] text-mut num">
                        {g.entries.filter((e) => e.status === 'playing').length}명 참여 중
                        {mineEntry && ` · 내 좌석 T${mineEntry.table}-${mineEntry.seat}`}
                      </div>
                      <div className="mt-1.5"><ParticipantPreview entries={g.entries} roster={rosterMap} myId={m.id} /></div>
                    </div>
                    {scheduled ? <Badge tone="sky">예약</Badge> : closed ? <Badge tone="rose">마감</Badge> : <Badge tone="mint">바인 가능 ›</Badge>}
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* 내 참가 기록 */}
      {mine.length > 0 && (
        <section>
          <h2 className="text-[17px] font-bold mb-2">내 참가 기록</h2>
          <div className="space-y-1.5">
            {mine.slice(0, 10).map((g) => {
              const e = g.entries[0]
              return (
                <div key={g.id} className="px-4 py-2.5 bg-surface2/50 rounded-xl text-sm flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{g.name}{g.cancelled && <span className="text-rose text-[14px] ml-1">취소</span>}</div>
                    <div className="text-[14px] text-faint num">{fmtDateTime(g.startedAt)}</div>
                  </div>
                  <span className={`num font-bold ${e?.rank === 1 ? 'text-gold' : 'text-mut'}`}>
                    {g.status !== 'ended' ? (e?.status === 'playing' ? '참여 중' : '탈락') : e?.rank ? `${e.rank}위` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 최근 거래 */}
      <section>
        <h2 className="text-[17px] font-bold mb-2">최근 거래</h2>
        {me.ledger.length === 0 ? (
          <Card className="p-5 text-center text-sm text-mut">거래 내역이 없습니다.</Card>
        ) : (
          <div className="space-y-1.5">
            {me.ledger.map((l) => {
              const gain = l.to === m.id
              return (
                <div key={l.id} className="px-4 py-2.5 bg-surface2/50 rounded-xl text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold num ${gain ? 'text-mint' : 'text-rose'}`}>
                      {gain ? '+' : '−'}{fmtNum(l.amount)}{CURRENCY_UNIT[l.currency]}
                    </span>
                    <span className="text-mut truncate">{l.reason ?? '—'}</span>
                    <span className="ml-auto text-[14px] text-faint num shrink-0">{fmtDateTime(l.ts)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {editOpen && <ProfileModal me={me} onClose={() => { setEditOpen(false); load() }} />}
      {rankOpen && <RankingModal ranked={ranked} myId={m.id} season={season} onClose={() => setRankOpen(false)} />}
    </PlayerShell>
  )
}

/** 매장 전체 랭킹 (같은 매장 회원에게는 닉네임 그대로 표시) */
function RankingModal({ ranked, myId, season, onClose }: {
  ranked: { item: RosterMember; rank: number }[]
  myId: string
  season: { id: string; name: string } | null
  onClose: () => void
}) {
  return (
    <Modal open onClose={onClose} title={`매장 랭킹${season ? ` · ${season.name}` : ''}`}>
      {ranked.length === 0 ? (
        <div className="text-center text-mut text-sm py-6">아직 랭킹 데이터가 없습니다.</div>
      ) : (
        <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
          {ranked.map(({ item, rank }) => {
            const mine = item.id === myId
            return (
              <div key={item.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${mine ? 'border-mint/50 bg-mint/8' : 'border-line bg-surface2/40'}`}>
                <span className="w-8 text-center font-bold num">{MEDALS[rank - 1] ?? rank}</span>
                <Avatar emoji={item.emoji} color={item.color} size={28} />
                <span className={`font-semibold truncate flex-1 ${mine ? 'text-mint' : ''}`}>{item.nickname}{mine && ' (나)'}</span>
                <span className="num font-bold">{fmtNum(item.rp)}<span className="text-[13px] text-faint ml-0.5">RP</span></span>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

function ProfileModal({ me, onClose }: { me: MyInfo; onClose: () => void }) {
  const [realName, setRealName] = useState(me.member.realName ?? '')
  const [nickname, setNickname] = useState(me.member.nickname)
  const [phone, setPhone] = useState(me.member.phone ?? '')
  const [emoji, setEmoji] = useState(me.member.emoji)
  const [color, setColor] = useState(me.member.color)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!nickname.trim()) return setError('닉네임을 입력해주세요.')
    if (phone.trim() && !isKrMobile(phone)) return setError('휴대폰 번호를 정확히 입력해주세요. (예: 010-1234-5678)')
    setBusy(true)
    const err = await updateMyProfile({ nickname, phone: formatPhone(phone), emoji, color, realName })
    setBusy(false)
    if (err) return setError(err)
    await refreshRole()
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="프로필 수정">
      <div className="space-y-4">
        <Field label="이름">
          <Input value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="실명" autoComplete="name" maxLength={20} />
        </Field>
        <Field label="닉네임">
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={12} />
        </Field>
        <Field label="휴대폰 번호">
          <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setPhone((p) => formatPhone(p))} placeholder="010-0000-0000" />
        </Field>
        <Field label="아바타">
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)} className={`w-9 h-9 rounded-xl border text-lg ${emoji === e ? 'border-mint/70 bg-mint/10' : 'border-line2'}`}>{e}</button>
            ))}
          </div>
        </Field>
        <Field label="컬러">
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`컬러 ${c}`} className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`} style={{ background: c }} />
            ))}
          </div>
        </Field>
        {error && <div className="text-sm text-rose">{error}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" onClick={submit} disabled={busy}>{busy ? '저장 중…' : '저장'}</Btn>
        </div>
        <div className="border-t border-line pt-4">
          <div className="text-[16px] font-bold mb-2">비밀번호 변경</div>
          <PasswordChange compact />
        </div>
      </div>
    </Modal>
  )
}
