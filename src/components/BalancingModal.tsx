import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Entry, Game } from '../types'
import { fmtDateTime } from '../lib/format'
import { Badge, Btn, Modal } from '../components/ui'

/**
 * 테이블 밸런싱 — 관리자가 직접 옮긴다.
 * 좌석 배치도에서 플레이어를 탭해 선택하고, 빈 좌석을 탭하면 이동. 자동 추천은 하지 않는다(사용자 결정, 2026-09-14).
 * 테이블 해체: 그 테이블 사람들을 모두 옮기면(직접 또는 무작위) 게임의 테이블 목록에서 뺀다.
 */
export default function BalancingModal({
  game: g,
  open,
  onClose,
  initialMemberId,
}: {
  game: Game
  open: boolean
  onClose: () => void
  initialMemberId?: string | null // 플레이어 리스트 "좌석 이동"에서 열 때 그 사람을 선택한 상태로
}) {
  const members = useStore((s) => s.members)
  const tables = useStore((s) => s.tables)
  const moveSeat = useStore((s) => s.moveSeat)
  const removeGameTable = useStore((s) => s.removeGameTable)

  const [selected, setSelected] = useState<string | null>(null)
  const [breaking, setBreaking] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const readOnly = g.status === 'ended'

  // 테이블 → 좌석 → 참가자
  const byTable = useMemo(() => {
    const map = new Map<number, Map<number, Entry>>()
    for (const t of g.tables) map.set(t, new Map())
    for (const e of g.entries) {
      if (e.status === 'playing') map.get(e.table)?.set(e.seat, e)
    }
    return map
  }, [g])
  const seatsOf = (t: number) => tables.find((x) => x.no === t)?.seats ?? 9
  const countOf = (t: number) => byTable.get(t)?.size ?? 0
  const name = (id: string) => members.find((m) => m.id === id)?.nickname ?? '?'
  const selectedEntry = selected ? g.entries.find((e) => e.memberId === selected && e.status === 'playing') : undefined

  // 인원 차이 안내 (추천은 하지 않음)
  const hint = useMemo(() => {
    const arr = g.tables.map((t) => ({ t, n: byTable.get(t)?.size ?? 0 })).sort((a, b) => b.n - a.n)
    if (arr.length < 2) return null
    const max = arr[0]
    const min = arr[arr.length - 1]
    return max.n - min.n >= 2 ? `TABLE ${max.t}(${max.n}명)이 TABLE ${min.t}(${min.n}명)보다 ${max.n - min.n}명 많습니다.` : null
  }, [byTable, g.tables])

  // 열릴 때 초기 선택 적용, 닫히면 선택·해체 상태 초기화
  useEffect(() => {
    if (open) {
      setSelected(initialMemberId ?? null)
    } else {
      setSelected(null)
      setBreaking(null)
      setError(null)
    }
  }, [open, initialMemberId])
  // 선택한 사람이 탈락하거나 사라지면 선택 해제
  useEffect(() => {
    if (selected && !selectedEntry) setSelected(null)
  }, [selected, selectedEntry])
  // 해체 중인 테이블이 비면 목록에서 제거
  const breakingLeft = breaking == null ? -1 : (byTable.get(breaking)?.size ?? 0)
  const breakingInGame = breaking != null && g.tables.includes(breaking)
  useEffect(() => {
    if (breaking == null || !open) return
    if (!breakingInGame) {
      setBreaking(null)
      return
    }
    if (breakingLeft > 0) return
    let cancelled = false
    void removeGameTable(g.id, breaking).then((err) => {
      if (cancelled) return
      if (err) setError(err)
      setBreaking(null)
    })
    return () => {
      cancelled = true
    }
  }, [breaking, breakingLeft, breakingInGame, open, g.id, removeGameTable])

  const doMove = async (memberId: string, table: number, seat: number) => {
    const from = g.entries.find((e) => e.memberId === memberId)
    const reason = breaking != null && from?.table === breaking ? 'break' : 'manual'
    setBusy(true)
    setError(null)
    const err = await moveSeat(g.id, memberId, table, seat, reason)
    setBusy(false)
    if (err) setError(err)
    else setSelected(null)
  }

  const onSeatClick = (table: number, seat: number) => {
    if (readOnly || busy) return
    const occ = byTable.get(table)?.get(seat)
    if (occ) {
      setSelected(selected === occ.memberId ? null : occ.memberId)
      setError(null)
      return
    }
    if (selected) void doMove(selected, table, seat)
  }

  const startBreak = (t: number) => {
    setError(null)
    setBreaking(t)
    const first = [...(byTable.get(t)?.values() ?? [])].sort((a, b) => a.seat - b.seat)[0]
    setSelected(first ? first.memberId : null)
  }

  // 해체: 남은 사람을 다른 테이블 빈 좌석에 무작위 배정
  const randomAssign = async () => {
    if (breaking == null) return
    const movers = [...(byTable.get(breaking)?.values() ?? [])].sort((a, b) => a.seat - b.seat)
    const empty: { table: number; seat: number }[] = []
    for (const t of g.tables) {
      if (t === breaking) continue
      const taken = byTable.get(t) ?? new Map<number, Entry>()
      for (let s = 1; s <= seatsOf(t); s++) if (!taken.has(s)) empty.push({ table: t, seat: s })
    }
    if (empty.length < movers.length) {
      setError(`다른 테이블의 빈 좌석이 ${empty.length}개뿐입니다. (${movers.length}명 이동 필요)`)
      return
    }
    for (let i = empty.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = empty[i]
      empty[i] = empty[j]
      empty[j] = tmp
    }
    setBusy(true)
    setError(null)
    setSelected(null)
    for (let i = 0; i < movers.length; i++) {
      const err = await moveSeat(g.id, movers[i].memberId, empty[i].table, empty[i].seat, 'break')
      if (err) {
        setError(err)
        break
      }
    }
    setBusy(false)
  }

  const history = useMemo(() => [...(g.seatMoves ?? [])].reverse(), [g.seatMoves])

  return (
    <Modal open={open} onClose={onClose} title="테이블 밸런싱" wide>
      <div className="space-y-4">
        <p className="text-[16px] text-mut leading-relaxed">
          {readOnly ? (
            '종료된 게임입니다. 좌석 배치와 이동 이력만 볼 수 있습니다.'
          ) : selectedEntry ? (
            <>
              <b className="text-ink">{name(selectedEntry.memberId)}</b>(TABLE {selectedEntry.table} · {selectedEntry.seat}번) 선택 중 —
              옮길 <b className="text-ink">빈 좌석</b>을 누르세요.
            </>
          ) : (
            '플레이어를 누른 뒤 빈 좌석을 누르면 이동합니다. 핸드가 끝난 뒤 옮기세요.'
          )}
        </p>
        {hint && !readOnly && <div className="text-[16px] text-rose">⚖ {hint}</div>}
        {breaking != null && (
          <div className="p-3 bg-surface2/70 border border-rose/40 rounded-sm text-[16px] flex flex-wrap items-center gap-2">
            <span className="text-rose font-semibold">TABLE {breaking} 해체 중</span>
            <span className="text-mut">남은 {breakingLeft}명을 다른 테이블 빈 좌석으로 옮기면 테이블이 제거됩니다.</span>
            <span className="flex-1" />
            <Btn sm onClick={randomAssign} disabled={busy}>무작위 배정</Btn>
            <Btn
              sm
              variant="ghost"
              onClick={() => {
                setBreaking(null)
                setSelected(null)
              }}
              disabled={busy}
            >
              취소
            </Btn>
          </div>
        )}
        {error && <div className="text-[16px] text-rose">⚠ {error}</div>}

        <div className="space-y-4">
          {g.tables.map((t) => {
            const seats = seatsOf(t)
            const occ = byTable.get(t) ?? new Map<number, Entry>()
            const isBreaking = breaking === t
            return (
              <div key={t} className={`border rounded-sm p-3 ${isBreaking ? 'border-rose/50' : 'border-line'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-bold num">TABLE {t}</span>
                  <span className="text-mut num text-[16px]">
                    {occ.size}/{seats}명
                  </span>
                  <span className="flex-1" />
                  {!readOnly && g.tables.length > 1 && breaking == null && (
                    <Btn sm variant="ghost" onClick={() => startBreak(t)} disabled={busy}>
                      테이블 해체
                    </Btn>
                  )}
                  {isBreaking && <Badge tone="rose">해체 중</Badge>}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {Array.from({ length: seats }, (_, i) => i + 1).map((s) => {
                    const e = occ.get(s)
                    const isSel = !!e && e.memberId === selected
                    const target = !e && !!selected && !readOnly && !isBreaking
                    const mustMove = !!e && isBreaking
                    const cls = e
                      ? isSel
                        ? 'bg-mint/12 border-mint text-ink'
                        : mustMove
                          ? 'bg-surface2 border-rose/50 text-ink hover:border-rose'
                          : 'bg-surface2 border-line2 text-ink hover:border-mint/50'
                      : target
                        ? 'border-dashed border-mint/60 text-mint hover:bg-mint/10'
                        : 'border-dashed border-line2 text-faint'
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onSeatClick(t, s)}
                        disabled={readOnly || busy || (!e && !selected) || (isBreaking && !e)}
                        aria-pressed={isSel}
                        aria-label={e ? `TABLE ${t} ${s}번 ${name(e.memberId)}` : `TABLE ${t} ${s}번 빈 좌석`}
                        className={`relative min-h-14 px-2 py-1.5 border rounded-sm text-left transition-colors disabled:cursor-default ${cls}`}
                      >
                        <span className="absolute top-1 left-1.5 text-[13px] num text-faint">{s}</span>
                        <span className="block pt-3 text-[16px] font-semibold truncate">
                          {e ? name(e.memberId) : target ? '여기로' : '빈 자리'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="pt-3 border-t border-line">
          <button type="button" onClick={() => setHistoryOpen((v) => !v)} className="text-[16px] text-mut hover:text-ink">
            {historyOpen ? '▾' : '▸'} 이동 이력 {history.length}건
          </button>
          {historyOpen &&
            (history.length === 0 ? (
              <p className="mt-2 text-[15px] text-faint">아직 이동한 기록이 없습니다.</p>
            ) : (
              <ul className="mt-2 space-y-1 max-h-56 overflow-y-auto text-[15px]">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-mut">
                    <span className="num text-faint">{fmtDateTime(h.ts)}</span>
                    <span className="text-ink font-semibold">{name(h.memberId)}</span>
                    <span className="num">
                      T{h.fromTable}-{h.fromSeat} → T{h.toTable}-{h.toSeat}
                    </span>
                    {h.reason === 'break' && <Badge tone="rose">해체</Badge>}
                    <span className="text-faint">{h.operator}</span>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </div>
    </Modal>
  )
}
