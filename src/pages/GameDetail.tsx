import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { selTotalChips, useStore } from '../store'
import type { BuyinType, Game } from '../types'
import { BUYIN_TYPE_LABEL, CURRENCY_LABEL, CURRENCY_UNIT } from '../types'
import { fmtClock, gameElapsedMs, isRegClosed, levelAt, useNow } from '../lib/time'
import { fmtNum } from '../lib/format'
import { Badge, Btn, Card, Empty, Modal, Pager, SectionTitle } from '../components/ui'
import Avatar from '../components/Avatar'
import JoinModal from '../components/JoinModal'
import EndGameModal from '../components/EndGameModal'
import GameEditModal from '../components/GameEditModal'
import { Field, Select } from '../components/ui'
import { appUrl } from '../lib/url'

const SUBTABS = ['플레이어 리스트', '바인 리스트', '얼리버드', '참가 조건', '게임 스트럭쳐'] as const
type SubTab = (typeof SUBTABS)[number]

export default function GameDetail() {
  const { id } = useParams()
  const game = useStore((s) => s.games.find((g) => g.id === id))
  const cancelGame = useStore((s) => s.cancelGame)
  const closeReg = useStore((s) => s.closeReg)
  const adjustToLevel = useStore((s) => s.adjustToLevel)
  const now = useNow()
  const [tab, setTab] = useState<SubTab>('플레이어 리스트')
  const [joinOpen, setJoinOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [confirmRegClose, setConfirmRegClose] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  if (!game) {
    return (
      <div className="text-center py-16 text-mut">
        게임을 찾을 수 없습니다. <Link to="/" className="text-mint">매장 현황으로</Link>
      </div>
    )
  }

  const elapsed = gameElapsedMs(game, now)
  const pos = levelAt(game.snapshot.levels, elapsed)
  const closed = isRegClosed(game, now)
  const playing = game.entries.filter((e) => e.status === 'playing').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-extrabold tracking-tight">게임 상세 정보</h1>
        <div className="flex gap-2 flex-wrap">
          {game.status !== 'ended' && (
            <>
              <Btn sm variant="primary" onClick={() => setJoinOpen(true)}>참가 등록</Btn>
              <a href={appUrl(`/display/${game.id}`)} target="_blank" rel="noreferrer"><Btn sm variant="gold">전광판 열기</Btn></a>
              {!closed && <Btn sm onClick={() => setConfirmRegClose(true)}>레지 마감</Btn>}
              <Btn sm onClick={() => setEditOpen(true)}>게임 수정</Btn>
              <Btn sm variant="danger" onClick={() => setEndOpen(true)}>게임 종료</Btn>
            </>
          )}
          {!game.cancelled && (
            <Btn sm variant="danger" onClick={() => setConfirmCancel(true)}>게임 취소</Btn>
          )}
          <Link to="/"><Btn sm variant="ghost">‹ 매장 현황</Btn></Link>
        </div>
      </div>

      {/* 현재 게임 정보 */}
      <Card className="p-5">
        <SectionTitle>현재 게임 정보</SectionTitle>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-[15px] font-semibold text-mut mb-0.5">게임 (게임셋)</dt>
            <dd className="font-semibold flex items-center gap-2 flex-wrap">
              {game.name} <span className="text-mut font-normal">{game.gameSetName}</span>
              {game.cancelled ? (
                <Badge tone="rose">취소됨</Badge>
              ) : game.status === 'ended' ? (
                <Badge tone="mut">종료</Badge>
              ) : closed ? (
                <Badge tone="rose">레지 마감</Badge>
              ) : (
                <Badge tone="mint">참여 가능</Badge>
              )}
              {game.status === 'paused' && <Badge tone="gold">일시정지 중</Badge>}
            </dd>
          </div>
          <div>
            <dt className="text-[15px] font-semibold text-mut mb-0.5">블라인드 레벨</dt>
            <dd className="font-semibold num flex items-center gap-1.5 flex-wrap">
              {game.status !== 'ended' && (
                <button
                  onClick={() => adjustToLevel(game.id, Math.max(0, pos.idx - 1))}
                  disabled={pos.idx === 0}
                  className="w-6 h-6 rounded-md border border-line2 text-mut hover:text-ink disabled:opacity-30 text-[14px]"
                  aria-label="이전 레벨로"
                  title="이전 레벨로 (수동 조정)"
                >
                  ◀
                </button>
              )}
              <Badge tone="gold">{pos.level.label}</Badge>{' '}
              {pos.level.type === 'break' ? '휴식' : `${fmtNum(pos.level.sb)}/${fmtNum(pos.level.bb)} (${fmtNum(pos.level.ante)})`}
              {game.status !== 'ended' && (
                <button
                  onClick={() => adjustToLevel(game.id, Math.min(game.snapshot.levels.length - 1, pos.idx + 1))}
                  disabled={pos.idx >= game.snapshot.levels.length - 1}
                  className="w-6 h-6 rounded-md border border-line2 text-mut hover:text-ink disabled:opacity-30 text-[14px]"
                  aria-label="다음 레벨로"
                  title="다음 레벨로 (수동 조정)"
                >
                  ▶
                </button>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[15px] font-semibold text-mut mb-0.5">진행 테이블</dt>
            <dd className="font-semibold num">TABLE {game.tables.join(' · ')}</dd>
          </div>
          <div>
            <dt className="text-[15px] font-semibold text-mut mb-0.5">참여 인원</dt>
            <dd className="font-semibold num">{playing}/{game.entries.length}</dd>
          </div>
          <div>
            <dt className="text-[15px] font-semibold text-mut mb-0.5">진행 시간</dt>
            <dd className="font-semibold num">{fmtClock(elapsed)}</dd>
          </div>
        </dl>
      </Card>

      {/* 서브탭 */}
      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {SUBTABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-mint text-ink' : 'border-transparent text-mut hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === '플레이어 리스트' && <PlayerList game={game} />}
      {tab === '바인 리스트' && <BuyinList game={game} />}
      {tab === '얼리버드' && <EarlyBird game={game} />}
      {tab === '참가 조건' && <BuyinRules game={game} />}
      {tab === '게임 스트럭쳐' && <Structure game={game} />}

      <JoinModal game={game} open={joinOpen} onClose={() => setJoinOpen(false)} />
      <EndGameModal game={game} open={endOpen} onClose={() => setEndOpen(false)} />
      {editOpen && <GameEditModal game={game} open={editOpen} onClose={() => setEditOpen(false)} />}
      <Modal open={confirmRegClose} onClose={() => setConfirmRegClose(false)} title="레지스트레이션 마감">
        <p className="text-sm text-mut leading-relaxed">
          지금부터 신규 바인·리바인·리엔트리를 차단할까요? 되돌릴 수 없습니다.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={() => setConfirmRegClose(false)}>취소</Btn>
          <Btn variant="danger" onClick={() => { closeReg(game.id); setConfirmRegClose(false) }}>레지 마감</Btn>
        </div>
      </Modal>
      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="게임 취소 (무효화)">
        <p className="text-sm text-mut leading-relaxed">
          <b className="text-ink">{game.name}</b> 게임을 취소할까요? 되돌릴 수 없습니다.
        </p>
        <ul className="text-[16px] text-mut mt-3 space-y-1 list-disc pl-5">
          <li>모든 참가비({game.buyins.length}건)가 회원에게 환불됩니다</li>
          {game.status === 'ended' && <li>지급된 프라이즈·RP가 회수됩니다</li>}
          <li>게임 기록은 '취소됨' 상태로 보존됩니다</li>
        </ul>
        {cancelError && <div className="text-sm text-rose mt-3">{cancelError}</div>}
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={() => { setConfirmCancel(false); setCancelError(null) }}>닫기</Btn>
          <Btn
            variant="danger"
            onClick={async () => {
              const err = await cancelGame(game.id)
              if (err) return setCancelError(err)
              setConfirmCancel(false)
            }}
          >
            취소 실행
          </Btn>
        </div>
      </Modal>
    </div>
  )
}

// ── 플레이어 리스트 ───────────────────────────────────────────────────────

function PlayerList({ game }: { game: Game }) {
  const members = useStore((s) => s.members)
  const eliminate = useStore((s) => s.eliminate)
  const [page, setPage] = useState(1)
  const [moveTarget, setMoveTarget] = useState<string | null>(null)
  const PAGE = 8

  const sorted = useMemo(
    () =>
      [...game.entries].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'playing' ? -1 : 1
        return a.table - b.table || a.seat - b.seat
      }),
    [game.entries],
  )
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE))
  const rows = sorted.slice((page - 1) * PAGE, page * PAGE)

  if (sorted.length === 0) return <Empty>참가자가 없습니다.</Empty>
  return (
    <div>
      <div className="space-y-2">
        {rows.map((e) => {
          const m = members.find((x) => x.id === e.memberId)
          if (!m) return null
          return (
            <Card key={e.memberId} className={`px-4 py-3 flex items-center gap-3 ${e.status === 'eliminated' ? 'opacity-60' : ''}`}>
              <span className="text-[15px] text-mut num w-24 shrink-0">TABLE {e.table} - {e.seat}</span>
              <Avatar emoji={m.emoji} color={m.color} size={30} />
              <span className="font-semibold">{m.nickname}</span>
              <span className="ml-auto flex items-center gap-2">
                {e.status === 'playing' ? (
                  <>
                    <Badge tone="mint">참여 중</Badge>
                    {game.status !== 'ended' && (
                      <>
                        <Btn sm onClick={() => setMoveTarget(e.memberId)}>좌석 이동</Btn>
                        <Btn sm variant="danger" onClick={() => eliminate(game.id, e.memberId)}>탈락</Btn>
                      </>
                    )}
                  </>
                ) : (
                  <Badge tone="mut">{e.rank ? `${e.rank}위` : '탈락'}</Badge>
                )}
              </span>
            </Card>
          )
        })}
      </div>
      <Pager page={page} pages={pages} onPage={setPage} />
      {moveTarget && <SeatMoveModal game={game} memberId={moveTarget} onClose={() => setMoveTarget(null)} />}
    </div>
  )
}

// ── 좌석 이동 모달 ────────────────────────────────────────────────────────

function SeatMoveModal({ game, memberId, onClose }: { game: Game; memberId: string; onClose: () => void }) {
  const members = useStore((s) => s.members)
  const tables = useStore((s) => s.tables)
  const moveSeat = useStore((s) => s.moveSeat)
  const entry = game.entries.find((e) => e.memberId === memberId)
  const [table, setTable] = useState(entry?.table ?? game.tables[0])
  const [seat, setSeat] = useState(entry?.seat ?? 1)

  const m = members.find((x) => x.id === memberId)
  const seatCount = tables.find((t) => t.no === table)?.seats ?? 9
  const occupied = new Set(
    game.entries
      .filter((e) => e.status === 'playing' && e.table === table && e.memberId !== memberId)
      .map((e) => e.seat),
  )

  const submit = () => {
    moveSeat(game.id, memberId, table, seat)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="좌석 이동">
      <p className="text-sm text-mut mb-4">
        <b className="text-ink">{m?.nickname}</b> — 현재 TABLE {entry?.table} · {entry?.seat}번
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="테이블">
          <Select value={table} onChange={(e) => { setTable(+e.target.value); setSeat(1) }}>
            {game.tables.map((t) => (
              <option key={t} value={t}>TABLE {t}</option>
            ))}
          </Select>
        </Field>
        <Field label="좌석">
          <Select value={seat} onChange={(e) => setSeat(+e.target.value)}>
            {Array.from({ length: seatCount }, (_, i) => i + 1).map((s) => (
              <option key={s} value={s} disabled={occupied.has(s)}>
                {s}번{occupied.has(s) ? ' (사용 중)' : ''}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={onClose}>취소</Btn>
        <Btn variant="primary" onClick={submit} disabled={occupied.has(seat)}>이동</Btn>
      </div>
    </Modal>
  )
}

// ── 바인 리스트 ───────────────────────────────────────────────────────────

function BuyinList({ game }: { game: Game }) {
  const members = useStore((s) => s.members)
  const [page, setPage] = useState(1)
  const PAGE = 10

  const total = selTotalChips(game)
  const counts = {
    BUYIN: game.buyins.filter((b) => b.type === 'BUYIN').length,
    RE_BUYIN: game.buyins.filter((b) => b.type === 'RE_BUYIN').length,
    RE_ENTRY: game.buyins.filter((b) => b.type === 'RE_ENTRY').length,
  }
  const playing = game.entries.filter((e) => e.status === 'playing').length
  const avg = playing > 0 ? Math.round(total / playing) : 0

  const sorted = [...game.buyins].sort((a, b) => b.ts - a.ts)
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE))
  const rows = sorted.slice((page - 1) * PAGE, page * PAGE)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatBox label="전체 칩" value={fmtNum(total)} />
        <StatBox label="평균 스택" value={fmtNum(avg)} />
        <StatBox label="바인 / 리바인 / 리엔트리" value={`${counts.BUYIN}회 / ${counts.RE_BUYIN}회 / ${counts.RE_ENTRY}회`} />
        <StatBox label="총 바인" value={`${game.buyins.length}회`} />
        <StatBox label="칩 보정 / 애드온" value={`${game.correctionCount ?? 0}회 / ${game.addonCount ?? 0}회`} />
      </div>
      {rows.length === 0 ? (
        <Empty>바인 기록이 없습니다.</Empty>
      ) : (
        <div className="space-y-1.5">
          {rows.map((b) => {
            const m = members.find((x) => x.id === b.memberId)
            return (
              <Card key={b.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <Badge tone={b.type === 'BUYIN' ? 'mint' : b.type === 'RE_BUYIN' ? 'sky' : 'viol'}>
                  {BUYIN_TYPE_LABEL[b.type as BuyinType]}{b.type !== 'BUYIN' ? ` ${b.round}` : ''}
                </Badge>
                <span className="font-semibold">{m?.nickname ?? '?'}</span>
                <span className="text-mut text-[16px] num">
                  {b.cost}{CURRENCY_UNIT[b.currency]} → {fmtNum(b.chips)}칩
                  {b.earlyBirdChips ? <span className="text-gold"> +EB {fmtNum(b.earlyBirdChips)}</span> : null}
                </span>
                <span className="ml-auto text-[15px] text-faint num">{new Date(b.ts).toLocaleString('ko-KR')}</span>
              </Card>
            )
          })}
        </div>
      )}
      <Pager page={page} pages={pages} onPage={setPage} />
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface2/60 border border-line rounded-xl px-4 py-3">
      <div className="text-[14px] text-faint font-semibold">{label}</div>
      <div className="mt-0.5 font-bold num">{value}</div>
    </div>
  )
}

// ── 얼리버드 ──────────────────────────────────────────────────────────────

function EarlyBird({ game }: { game: Game }) {
  const rules = game.snapshot.earlyBird
  if (rules.length === 0) return <Empty>얼리버드가 설정되지 않은 게임입니다.</Empty>
  const lastLevel = game.snapshot.levels[Math.max(...rules.map((r) => r.levelIndex))]
  return (
    <Card className="p-5">
      <p className="text-sm text-mut mb-4">
        지급 기준 · <Badge tone="gold">{lastLevel?.label}</Badge> <span className="ml-1">까지만 제공</span>
      </p>
      <table className="w-full text-sm max-w-md">
        <thead>
          <tr className="text-left text-[15px] text-mut border-b border-line">
            <th className="py-2 pr-4 font-semibold">참가 레벨</th>
            <th className="py-2 font-semibold text-right">얼리버드 칩</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={i} className="border-b border-line/50 last:border-0">
              <td className="py-2.5 pr-4">{game.snapshot.levels[r.levelIndex]?.label}</td>
              <td className="py-2.5 text-right num text-gold font-semibold">{fmtNum(r.chips)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

// ── 참가 조건 ─────────────────────────────────────────────────────────────

function BuyinRules({ game }: { game: Game }) {
  const groups: BuyinType[] = ['BUYIN', 'RE_BUYIN', 'RE_ENTRY']
  return (
    <div className="space-y-5">
      {groups.map((t) => {
        const rules = game.snapshot.buyinRules.filter((r) => r.type === t)
        if (rules.length === 0) return null
        return (
          <Card key={t} className="p-5">
            <h3 className="font-bold mb-3">{BUYIN_TYPE_LABEL[t]}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-left text-[15px] text-mut border-b border-line">
                    <th className="py-2 pr-4 font-semibold w-16">회차</th>
                    <th className="py-2 pr-4 font-semibold">자원</th>
                    <th className="py-2 pr-4 font-semibold text-right">비용</th>
                    <th className="py-2 font-semibold text-right">지급 칩</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.flatMap((r) =>
                    (Object.entries(r.cost) as [keyof typeof CURRENCY_LABEL, number][]).map(([c, cost], ci) => (
                      <tr key={`${r.round}-${c}`} className="border-b border-line/40 last:border-0">
                        <td className="py-2 pr-4 num text-mut">{ci === 0 ? r.round : ''}</td>
                        <td className="py-2 pr-4">{CURRENCY_LABEL[c]}</td>
                        <td className="py-2 pr-4 text-right num">{cost}{CURRENCY_UNIT[c]}</td>
                        <td className="py-2 text-right num text-gold font-semibold">{fmtNum(r.chips)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── 게임 스트럭쳐 ─────────────────────────────────────────────────────────

function Structure({ game }: { game: Game }) {
  const now = useNow()
  const adjustToLevel = useStore((s) => s.adjustToLevel)
  const pos = levelAt(game.snapshot.levels, gameElapsedMs(game, now))
  const regLevel = game.snapshot.levels[game.snapshot.regCloseLevelIndex]
  return (
    <Card className="p-5">
      <p className="text-sm text-mut mb-4">
        레지 마감 레벨 · <Badge tone="rose">{regLevel?.label ?? '—'}</Badge>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-left text-[15px] text-mut border-b border-line">
              <th className="py-2 pr-4 font-semibold">Level</th>
              <th className="py-2 pr-4 font-semibold text-right">시간(분)</th>
              <th className="py-2 pr-4 font-semibold text-right">SB</th>
              <th className="py-2 pr-4 font-semibold text-right">BB</th>
              <th className="py-2 pr-4 font-semibold text-right">ANTE</th>
              <th className="py-2 font-semibold w-16"></th>
            </tr>
          </thead>
          <tbody>
            {game.snapshot.levels.map((l, i) => (
              <tr
                key={i}
                className={`border-b border-line/40 last:border-0 ${l.type === 'break' ? 'bg-gold/5' : ''} ${
                  i === pos.idx && game.status !== 'ended' ? 'bg-mint/8' : ''
                }`}
              >
                <td className={`py-2.5 pr-4 font-semibold ${l.type === 'break' ? 'text-gold' : ''}`}>
                  {l.label}
                  {i === pos.idx && game.status !== 'ended' && <span className="ml-2 text-[14px] text-mint">● 진행 중</span>}
                </td>
                <td className="py-2.5 pr-4 text-right num">{l.durationMin === 0 ? '∞' : l.durationMin}</td>
                {l.type === 'break' ? (
                  <td colSpan={3} className="py-2.5 text-center text-gold/90">
                    칩 제거 {l.colorUp ? `· ${fmtNum(l.colorUp)} 단위` : ''}
                  </td>
                ) : (
                  <>
                    <td className="py-2.5 pr-4 text-right num">{fmtNum(l.sb)}</td>
                    <td className="py-2.5 pr-4 text-right num">{fmtNum(l.bb)}</td>
                    <td className="py-2.5 pr-4 text-right num">{fmtNum(l.ante)}</td>
                  </>
                )}
                <td className="py-2.5 text-right">
                  {game.status !== 'ended' && i !== pos.idx && (
                    <Btn sm variant="ghost" onClick={() => adjustToLevel(game.id, i)}>이동</Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
