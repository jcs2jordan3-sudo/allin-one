import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { selPlayingCount, selTotalChips, useStore } from '../store'
import { hasSupabase } from '../lib/supabase'
import type { Game, GameSet, TableInfo } from '../types'
import { CURRENCY_UNIT } from '../types'
import { fmtClock, gameElapsedMs, isRegClosed, isScheduled, levelAt, useNow } from '../lib/time'
import { fmtDateTime, fmtNum } from '../lib/format'
import { Badge, Btn, Card, Empty, Field, Input, Modal, SectionTitle, Segmented, Select } from '../components/ui'
import JoinModal from '../components/JoinModal'
import GameSetEditor from '../components/GameSetEditor'
import EndGameModal from '../components/EndGameModal'
import GameEditModal from '../components/GameEditModal'
import WaitlistModal from '../components/WaitlistModal'
import DateRangePicker from '../components/DateRangePicker'
import { absUrl, appUrl } from '../lib/url'

export default function DashboardTab() {
  const st = useStore()
  const now = useNow()
  const playingCount = selPlayingCount(st)
  const running = st.games.filter((g) => g.status !== 'ended')
  const ended = st.games.filter((g) => g.status === 'ended')
  const waitingCount = st.waitlist.filter((w) => w.status === 'waiting' || w.status === 'called').length
  const seatedCount = st.waitlist.filter((w) => w.status === 'seated').length

  const [waitingOpen, setWaitingOpen] = useState(false)
  const [tablesOpen, setTablesOpen] = useState(false)
  const [setsOpen, setSetsOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [q, setQ] = useState('')
  const [shareMsg, setShareMsg] = useState<string | null>(null)

  const records = useMemo(
    () =>
      ended
        .filter((g) => (g.endedAt ?? g.startedAt) >= st.historyRange.from && (g.endedAt ?? g.startedAt) <= st.historyRange.to)
        .filter((g) => !q || g.name.includes(q) || g.gameSetName.includes(q))
        .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0)),
    [ended, q, st.historyRange],
  )

  const share = async (g: Game) => {
    const url = absUrl(`/display/${g.id}`)
    try {
      await navigator.clipboard.writeText(url)
      setShareMsg('전광판 링크가 복사되었습니다')
    } catch {
      setShareMsg(url)
    }
    setTimeout(() => setShareMsg(null), 2500)
  }

  return (
    <div className="space-y-8">
      {/* 벤토 타일 — 방문자·게임 셋·빠른 작업 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BentoTile label="대기 중" value={waitingCount} sub={`착석 ${seatedCount}`} onEdit={() => setWaitingOpen(true)} editLabel="명단" />
        <BentoTile label="게임 중" value={playingCount} accent="mint" />
        <BentoTile label="게임 셋" value={st.gameSets.length} onEdit={() => setSetsOpen(true)} />
        <Card className="p-5 flex flex-col justify-between gap-3">
          <span className="text-[17px] font-bold text-mut">빠른 작업</span>
          <div className="flex flex-col gap-2">
            <Btn sm variant="primary" onClick={() => setCreateOpen(true)}>+ 게임 추가</Btn>
            <Btn sm onClick={() => setTablesOpen(true)}>⚙ 테이블 설정</Btn>
          </div>
        </Card>
      </div>

      {/* 진행 중인 게임 */}
      <section>
        <SectionTitle>진행 중인 게임</SectionTitle>
        {running.length === 0 ? (
          <Empty>진행 중인 게임이 없습니다. 게임을 추가해보세요.</Empty>
        ) : (
          <div className="space-y-4">
            {running.map((g) => (
              <GameCard key={g.id} game={g} now={now} onShare={() => share(g)} />
            ))}
          </div>
        )}
        {shareMsg && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface2 border border-mint/40 text-mint text-sm px-4 py-2.5 rounded-xl z-50">
            {shareMsg}
          </div>
        )}
      </section>

      {/* 게임 기록 */}
      <section>
        <SectionTitle
          right={
            <div className="w-64 max-w-full">
              <Input placeholder="게임 또는 게임셋명을 검색해보세요" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          }
        >
          게임 기록
        </SectionTitle>
        <div className="mb-3"><DateRangePicker value={st.historyRange} onChange={(r) => st.setHistoryRange(r)} /></div>
        {records.length === 0 ? (
          <Empty>게임 기록이 없습니다.</Empty>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[15px] text-mut border-b border-line">
                  <th className="px-4 py-3 font-semibold">게임이름 (게임셋)</th>
                  <th className="px-4 py-3 font-semibold w-40">시작일시</th>
                  <th className="px-4 py-3 font-semibold w-40">종료일시</th>
                </tr>
              </thead>
              <tbody>
                {records.map((g) => (
                  <tr key={g.id} className="border-b border-line/60 last:border-0 hover:bg-surface2/50">
                    <td className="px-4 py-3">
                      <Link to={`/game/${g.id}`} className="font-semibold hover:text-mint">
                        {g.name} <span className="text-mut font-normal text-[16px]">{g.gameSetName}</span>
                        {g.cancelled && <span className="ml-2"><Badge tone="rose">취소됨</Badge></span>}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-mut num">{fmtDateTime(g.startedAt)}</td>
                    <td className="px-4 py-3 text-mut num">{g.endedAt ? fmtDateTime(g.endedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <WaitlistModal open={waitingOpen} onClose={() => setWaitingOpen(false)} />
      <TablesModal open={tablesOpen} onClose={() => setTablesOpen(false)} />
      <GameSetsModal open={setsOpen} onClose={() => setSetsOpen(false)} />
      <CreateGameModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

// ── 벤토 타일 ─────────────────────────────────────────────────────────────

function BentoTile({
  label,
  value,
  sub,
  accent,
  onEdit,
  editLabel = '편집',
}: {
  label: string
  value: number
  sub?: string
  accent?: 'mint'
  onEdit?: () => void
  editLabel?: string
}) {
  return (
    <Card className="p-5 flex flex-col justify-between gap-3 min-h-28">
      <div className="flex items-center justify-between">
        <span className="text-[17px] font-bold text-mut">{label}</span>
        {onEdit && (
          <button onClick={onEdit} className="text-[15px] text-mut hover:text-mint transition-colors">{editLabel}</button>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <div className={`text-5xl font-extrabold num leading-none ${accent === 'mint' ? 'text-mint' : ''}`}>{value}</div>
        {sub && <span className="text-[16px] font-semibold text-mut num">{sub}</span>}
      </div>
    </Card>
  )
}

// ── 게임 카드 ─────────────────────────────────────────────────────────────

function GameCard({ game: g, now, onShare }: { game: Game; now: number; onShare: () => void }) {
  const pauseGame = useStore((s) => s.pauseGame)
  const resumeGame = useStore((s) => s.resumeGame)
  const endGame = useStore((s) => s.endGame)
  const [joinOpen, setJoinOpen] = useState(false)
  const [balanceOpen, setBalanceOpen] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  const elapsed = gameElapsedMs(g, now)
  const pos = levelAt(g.snapshot.levels, elapsed)
  const closed = isRegClosed(g, now)
  const scheduled = isScheduled(g, now)
  const playing = g.entries.filter((e) => e.status === 'playing').length
  const capacity = g.tables.reduce((acc, t) => acc + (useStore.getState().tables.find((x) => x.no === t)?.seats ?? 9), 0)
  const buyinRule = g.snapshot.buyinRules.find((r) => r.type === 'BUYIN')
  const costText = buyinRule
    ? Object.entries(buyinRule.cost).map(([c, v]) => `${v}${CURRENCY_UNIT[c as keyof typeof CURRENCY_UNIT]}`).join(' 또는 ')
    : '—'

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-2xl font-bold tracking-tight">{g.name}</h3>
            {scheduled ? (
              <Badge tone="sky">예약됨 · {fmtDateTime(g.startedAt)} 시작</Badge>
            ) : closed ? (
              <Badge tone="rose">레지 마감</Badge>
            ) : (
              <Badge tone="mint">참여 가능</Badge>
            )}
            {g.status === 'paused' && <Badge tone="gold">일시정지 중</Badge>}
            {!scheduled && g.status !== 'ended' && elapsed > 12 * 3_600_000 && (
              <Badge tone="rose">12시간 초과 — 종료 확인 필요</Badge>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-base text-mut">
            <span className="inline-flex items-center gap-1.5">
              <Badge tone="gold">{pos.level.label}</Badge>
              <span className="num text-ink font-semibold">
                {pos.level.type === 'break' ? '휴식' : `${fmtNum(pos.level.sb)}/${fmtNum(pos.level.bb)} (${fmtNum(pos.level.ante)})`}
              </span>
            </span>
            <span className="num">📍 TABLE {g.tables.join('·')}</span>
            <span className="num">👥 {playing}/{capacity}</span>
            <span className="num">⏱ {fmtClock(elapsed)}</span>
            <span>
              참가 비용 <span className="text-gold font-semibold">{costText}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0 items-end">
          {/* 타이머 제어 — 카드 우측 상단 */}
          {g.status === 'paused' ? (
            <Btn sm variant="primary" onClick={() => resumeGame(g.id)} className="min-w-28" aria-label="재개">
              ▶ 재개
            </Btn>
          ) : (
            <Btn sm variant="danger" onClick={() => pauseGame(g.id)} className="min-w-28" aria-label="일시정지">
              ⏸ 일시정지
            </Btn>
          )}
          <div className="flex gap-2">
            <Btn sm onClick={() => setBalanceOpen(true)}>밸런싱</Btn>
            <Btn sm onClick={() => setJoinOpen(true)}>참가 등록</Btn>
            <Link to={`/game/${g.id}`}><Btn sm>게임 관리</Btn></Link>
          </div>
          <div className="flex gap-2">
            <Btn sm variant="ghost" onClick={onShare}>현황 공유</Btn>
            {hasSupabase && g.joinCode && <Btn sm onClick={() => setQrOpen(true)}>바인 QR</Btn>}
            <Btn sm onClick={() => setEditOpen(true)}>게임 수정</Btn>
            <Btn sm variant="danger" onClick={() => setConfirmEnd(true)}>종료</Btn>
            <a href={appUrl(`/display/${g.id}`)} target="_blank" rel="noreferrer">
              <Btn sm variant="gold">타이머</Btn>
            </a>
          </div>
        </div>
      </div>
      <div className="mt-3 text-right">
        <Link to={`/game/${g.id}`} className="text-[16px] text-mut hover:text-mint">자세히 보기 ›</Link>
      </div>

      <JoinModal game={g} open={joinOpen} onClose={() => setJoinOpen(false)} />
      <BalancingModal game={g} open={balanceOpen} onClose={() => setBalanceOpen(false)} />
      {confirmEnd && <EndGameModal game={g} open={confirmEnd} onClose={() => setConfirmEnd(false)} />}
      {editOpen && <GameEditModal game={g} open={editOpen} onClose={() => setEditOpen(false)} />}
      {qrOpen && g.joinCode && <GameQrModal game={g} onClose={() => setQrOpen(false)} />}
    </Card>
  )
}

/** 셀프 바인 QR — 전광판에도 같은 QR이 표시된다. 테이블 비치용 인쇄 */
function GameQrModal({ game: g, onClose }: { game: Game; onClose: () => void }) {
  const url = absUrl(`/g/${g.joinCode}`)
  return (
    <Modal open onClose={onClose} title={`${g.name} — 셀프 바인 QR`}>
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="bg-white p-4 rounded-2xl">
          <QRCodeSVG value={url} size={220} />
        </div>
        <p className="text-[16px] text-mut text-center leading-relaxed">
          회원이 스캔하면 로그인 후 <b className="text-ink">포인트로 즉시 바인</b>됩니다 (좌석 자동 배정).
          <br />레지 마감 후에는 바인이 거부됩니다. 현금·카드 결제는 직원이 포인트를 넣어준 뒤 이용하게 하세요.
        </p>
        <code className="text-[14px] text-faint break-all text-center">{url}</code>
        <div className="flex gap-2">
          <Btn sm onClick={() => navigator.clipboard.writeText(url).catch(() => {})}>링크 복사</Btn>
          <Btn sm onClick={() => window.print()}>인쇄</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ── 밸런싱 모달 ───────────────────────────────────────────────────────────

function BalancingModal({ game: g, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const members = useStore((s) => s.members)
  const tables = useStore((s) => s.tables)
  const moveSeat = useStore((s) => s.moveSeat)

  const byTable = useMemo(() => {
    const map = new Map<number, { memberId: string; seat: number }[]>()
    for (const t of g.tables) map.set(t, [])
    for (const e of g.entries) {
      if (e.status === 'playing') map.get(e.table)?.push({ memberId: e.memberId, seat: e.seat })
    }
    return map
  }, [g])

  const suggestion = useMemo(() => {
    const arr = [...byTable.entries()].map(([t, list]) => ({ t, n: list.length }))
    if (arr.length < 2) return null
    arr.sort((a, b) => b.n - a.n)
    const max = arr[0]
    const min = arr[arr.length - 1]
    if (max.n - min.n <= 1) return null
    const mover = byTable.get(max.t)?.[0]
    if (!mover) return null
    const tinfo = tables.find((x) => x.no === min.t)
    const used = new Set(byTable.get(min.t)?.map((x) => x.seat))
    let seat = 1
    while (used.has(seat) && seat <= (tinfo?.seats ?? 9)) seat++
    return { memberId: mover.memberId, from: max.t, to: min.t, seat }
  }, [byTable, tables])

  const name = (id: string) => members.find((m) => m.id === id)?.nickname ?? '?'

  return (
    <Modal open={open} onClose={onClose} title="테이블 밸런싱">
      <div className="space-y-3">
        {[...byTable.entries()].map(([t, list]) => (
          <div key={t} className="flex items-center gap-3 text-sm">
            <span className="w-20 font-bold num">TABLE {t}</span>
            <div className="flex-1 h-2 bg-surface2 rounded-sm overflow-hidden">
              <div className="h-full bg-mint/70 rounded-sm" style={{ width: `${Math.min(100, list.length * 12)}%` }} />
            </div>
            <span className="text-mut num w-10 text-right">{list.length}명</span>
          </div>
        ))}
        {suggestion ? (
          <div className="mt-4 p-4 bg-surface2/70 border border-gold/30 rounded-xl text-sm">
            <div className="text-gold font-semibold mb-1">이동 추천</div>
            <p className="text-mut">
              <b className="text-ink">{name(suggestion.memberId)}</b> — TABLE {suggestion.from} → TABLE {suggestion.to} ({suggestion.seat}번 좌석)
            </p>
            <div className="mt-3 text-right">
              <Btn sm variant="primary" onClick={() => moveSeat(g.id, suggestion.memberId, suggestion.to, suggestion.seat)}>
                적용
              </Btn>
            </div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-mint">✓ 테이블 인원이 균형 상태입니다.</div>
        )}
      </div>
    </Modal>
  )
}

// ── 테이블 설정 ───────────────────────────────────────────────────────────

function TablesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tables = useStore((s) => s.tables)
  const saveTables = useStore((s) => s.saveTables)
  const [draft, setDraft] = useState<TableInfo[] | null>(null)
  const list = draft ?? tables

  const update = (i: number, patch: Partial<TableInfo>) => {
    const next = list.map((t, j) => (i === j ? { ...t, ...patch } : t))
    setDraft(next)
  }

  return (
    <Modal open={open} onClose={() => { setDraft(null); onClose() }} title="테이블 설정">
      <div className="space-y-2">
        {list.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-sm text-mut w-14">번호</span>
            <Input type="number" value={t.no} onChange={(e) => update(i, { no: +e.target.value })} className="w-24" />
            <span className="text-sm text-mut w-14 text-right">좌석</span>
            <Input type="number" value={t.seats} onChange={(e) => update(i, { seats: +e.target.value })} className="w-24" />
            <a href={appUrl(`/qr/${t.no}`)} target="_blank" rel="noreferrer">
              <Btn sm>QR 시트</Btn>
            </a>
            <Btn sm variant="ghost" onClick={() => setDraft(list.filter((_, j) => j !== i))}>삭제</Btn>
          </div>
        ))}
        <Btn sm onClick={() => setDraft([...list, { no: Math.max(0, ...list.map((t) => t.no)) + 1, seats: 9 }])}>
          + 테이블 추가
        </Btn>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={() => { setDraft(null); onClose() }}>취소</Btn>
        <Btn variant="primary" onClick={() => { saveTables(list); setDraft(null); onClose() }}>저장</Btn>
      </div>
    </Modal>
  )
}

// ── 게임 셋 관리 ──────────────────────────────────────────────────────────

function GameSetsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const gameSets = useStore((s) => s.gameSets)
  const duplicateGameSet = useStore((s) => s.duplicateGameSet)
  const removeGameSet = useStore((s) => s.removeGameSet)
  const [editing, setEditing] = useState<GameSet | null>(null)

  return (
    <>
      <Modal open={open && !editing} onClose={onClose} title="게임 셋 관리" wide>
        <div className="space-y-2">
          {gameSets.map((gs) => (
            <div key={gs.id} className="flex items-center gap-3 px-4 py-3 border border-line rounded-xl">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{gs.name}</div>
                <div className="text-[15px] text-mut num">
                  레벨 {gs.levels.length}개 · 레지 마감 {gs.levels[gs.regCloseLevelIndex]?.label ?? '—'} · 바인 {gs.buyinRules.find((r) => r.type === 'BUYIN')?.chips.toLocaleString()}칩
                </div>
              </div>
              <Btn sm onClick={() => setEditing(gs)}>수정</Btn>
              <Btn sm onClick={() => duplicateGameSet(gs.id)}>복제</Btn>
              <Btn sm variant="danger" onClick={() => removeGameSet(gs.id)} disabled={gameSets.length <= 1}>삭제</Btn>
            </div>
          ))}
        </div>
      </Modal>
      {editing && <GameSetEditor gameSet={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

// ── 게임 추가 ─────────────────────────────────────────────────────────────

function CreateGameModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const gameSets = useStore((s) => s.gameSets)
  const allTables = useStore((s) => s.tables)
  const games = useStore((s) => s.games)
  const createGame = useStore((s) => s.createGame)
  const [name, setName] = useState('')
  const [setId, setSetId] = useState('')
  const [tables, setTables] = useState<number[]>([])
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [time, setTime] = useState('20:00')
  const [day, setDay] = useState<'today' | 'tomorrow'>('today')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 진행·예약 중인 게임이 점유한 테이블은 선택 불가 (콘솔 실사 반영)
  const occupied = useMemo(
    () => new Set(games.filter((g) => g.status !== 'ended').flatMap((g) => g.tables)),
    [games],
  )
  const selectedSet = gameSets.find((gs) => gs.id === (setId || gameSets[0]?.id))

  const toggle = (no: number) =>
    setTables((prev) => (prev.includes(no) ? prev.filter((x) => x !== no) : [...prev, no]))

  const submit = async () => {
    if (!name.trim()) return setError('게임 이름을 입력해주세요.')
    let startAt: number | undefined
    if (when === 'later') {
      const [h, m] = time.split(':').map(Number)
      if (isNaN(h) || isNaN(m)) return setError('시작 시간을 입력해주세요.')
      const d = new Date()
      if (day === 'tomorrow') d.setDate(d.getDate() + 1)
      d.setHours(h, m, 0, 0)
      startAt = d.getTime()
      if (startAt <= Date.now()) return setError('시작 시간이 이미 지났습니다. 시간 또는 날짜를 확인해주세요.')
    }
    const err = await createGame(name.trim(), setId || gameSets[0]?.id, tables, {
      startAt,
      notice: notice.trim() || undefined,
    })
    if (err) return setError(err)
    setName(''); setTables([]); setNotice(''); setWhen('now'); setError(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="게임 추가">
      <div className="space-y-4">
        <Field label="게임 셋">
          <Select value={setId || gameSets[0]?.id} onChange={(e) => setSetId(e.target.value)}>
            {gameSets.map((gs) => (
              <option key={gs.id} value={gs.id}>{gs.name}</option>
            ))}
          </Select>
        </Field>
        {selectedSet && selectedSet.prizes.length > 0 && (
          <p className="text-[15px] text-mut -mt-2">
            프라이즈 <span className="text-gold">{selectedSet.prizes.length}등까지 제공</span> ·{' '}
            {selectedSet.prizes.map((p) => `${p.rank}위 ${fmtNum(p.amount)}P`).join(' · ')}
          </p>
        )}
        <Field label="게임 이름">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 데일리 게임" />
        </Field>
        <Field label="게임 시작 시간">
          <div className="space-y-2">
            <Segmented
              options={[
                { value: 'now', label: '지금 시작' },
                { value: 'later', label: '예약 시작' },
              ]}
              value={when}
              onChange={setWhen}
            />
            {when === 'later' && (
              <div className="flex items-center gap-2">
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />
                <Segmented
                  options={[
                    { value: 'today', label: '오늘' },
                    { value: 'tomorrow', label: '내일' },
                  ]}
                  value={day}
                  onChange={setDay}
                />
              </div>
            )}
          </div>
        </Field>
        <Field label="사용 테이블">
          <div className="flex flex-wrap gap-2">
            {allTables.map((t) => {
              const busy = occupied.has(t.no)
              return (
                <button
                  key={t.no}
                  disabled={busy}
                  onClick={() => toggle(t.no)}
                  className={`px-3 py-1.5 rounded-lg border text-[16px] font-semibold num transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    tables.includes(t.no) ? 'border-mint/60 bg-mint/10 text-mint' : 'border-line2 text-mut hover:text-ink'
                  }`}
                  title={busy ? '다른 게임에서 사용 중' : undefined}
                >
                  T{t.no} <span className="font-normal">({t.seats}석{busy ? ' · 사용 중' : ''})</span>
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="게임 공지 (선택 — 전광판 NOTICE에 표시)">
          <Input value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="예: 오늘 1위 트로피 증정" />
        </Field>
        {error && <div className="text-sm text-rose">{error}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" onClick={submit}>{when === 'now' ? '게임 시작' : '예약 등록'}</Btn>
        </div>
      </div>
    </Modal>
  )
}
