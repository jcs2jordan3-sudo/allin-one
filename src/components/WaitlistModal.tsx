import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { WaitEntry } from '../types'
import { WAIT_STATUS_LABEL } from '../types'
import { fmtDateTime } from '../lib/format'
import { useNow } from '../lib/time'
import { Badge, Btn, Empty, Field, Input, Modal, Segmented, Select } from './ui'
import Avatar from './Avatar'

const ACTIVE = ['waiting', 'called'] as const

function ago(ms: number, now: number) {
  const m = Math.max(0, Math.round((now - ms) / 60_000))
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 ${m % 60}분 전`
}

/** 대기자 명단 · 좌석 체크인 현황 (F-26) */
export default function WaitlistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const waitlist = useStore((s) => s.waitlist)
  const members = useStore((s) => s.members)
  const tables = useStore((s) => s.tables)
  const updateWait = useStore((s) => s.updateWait)
  const now = useNow(30_000)
  const [tab, setTab] = useState<'wait' | 'seated' | 'done'>('wait')
  const [addOpen, setAddOpen] = useState(false)
  const [seatFor, setSeatFor] = useState<WaitEntry | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nameOf = (w: WaitEntry) => {
    if (w.memberId) {
      const m = members.find((x) => x.id === w.memberId)
      return m ? { label: m.nickname, sub: m.no, emoji: m.emoji, color: m.color } : { label: '알 수 없음', sub: '', emoji: '👤', color: '#64707f' }
    }
    return { label: w.guestName ?? '손님', sub: '비회원', emoji: '🚶', color: '#94a1b0' }
  }

  const waiting = useMemo(() => waitlist.filter((w) => (ACTIVE as readonly string[]).includes(w.status)).sort((a, b) => a.arrivedAt - b.arrivedAt), [waitlist])
  const seated = useMemo(() => waitlist.filter((w) => w.status === 'seated').sort((a, b) => (a.table ?? 0) - (b.table ?? 0) || (a.seat ?? 0) - (b.seat ?? 0)), [waitlist])
  const done = useMemo(() => waitlist.filter((w) => ['noshow', 'cancelled', 'left'].includes(w.status)).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0)), [waitlist])

  const act = async (id: string, status: WaitEntry['status'], table?: number, seat?: number) => {
    setError(null)
    const err = await updateWait(id, status, table, seat)
    if (err) setError(err)
  }

  const list = tab === 'wait' ? waiting : tab === 'seated' ? seated : done

  return (
    <Modal open={open} onClose={onClose} title="대기자 명단 · 좌석 체크인" wide>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Segmented
          options={[
            { value: 'wait', label: `대기 ${waiting.length}` },
            { value: 'seated', label: `착석 ${seated.length}` },
            { value: 'done', label: `종료 ${done.length}` },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Btn sm variant="primary" onClick={() => setAddOpen(true)}>+ 대기 추가</Btn>
      </div>
      <p className="text-[15px] text-mut mb-3">
        손님이 매장 QR·좌석 QR을 스캔하면 자동으로 올라옵니다. 셀프 바인 시 체크인한 좌석이 비어 있으면 그 자리에 배정됩니다.
      </p>
      {error && <div className="text-sm text-rose mb-3">{error}</div>}
      {list.length === 0 ? (
        <Empty>{tab === 'wait' ? '대기 중인 손님이 없습니다.' : tab === 'seated' ? '착석 중인 손님이 없습니다.' : '최근 종료된 항목이 없습니다.'}</Empty>
      ) : (
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {list.map((w, i) => {
            const n = nameOf(w)
            return (
              <div key={w.id} className="flex items-center gap-3 px-4 py-3 border border-line rounded-xl flex-wrap">
                {tab === 'wait' && <span className="w-6 text-center font-bold num text-mut">{i + 1}</span>}
                <Avatar emoji={n.emoji} color={n.color} size={30} />
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    {n.label} <span className="text-[15px] text-mut font-normal num">{n.sub}</span>
                    <Badge tone={w.source === 'qr' ? 'mint' : 'mut'}>{w.source === 'qr' ? 'QR' : '직원'}</Badge>
                    {w.status === 'called' && <Badge tone="gold">호출됨</Badge>}
                    {tab === 'done' && <Badge tone={w.status === 'noshow' ? 'rose' : 'mut'}>{WAIT_STATUS_LABEL[w.status]}</Badge>}
                  </div>
                  <div className="text-[15px] text-mut num">
                    {tab === 'seated' && w.table ? `TABLE ${w.table} · ${w.seat}번 좌석 · ` : ''}
                    {tab === 'done' ? fmtDateTime(w.endedAt ?? w.arrivedAt) : `도착 ${ago(w.arrivedAt, now)}`}
                    {w.note && <span className="ml-2 text-faint">· {w.note}</span>}
                  </div>
                </div>
                <div className="ml-auto flex gap-1.5 flex-wrap">
                  {tab === 'wait' && (
                    <>
                      {w.status === 'waiting' && <Btn sm onClick={() => act(w.id, 'called')}>호출</Btn>}
                      <Btn sm variant="primary" onClick={() => setSeatFor(w)}>착석</Btn>
                      <Btn sm variant="danger" onClick={() => act(w.id, 'noshow')}>노쇼</Btn>
                      <Btn sm variant="ghost" onClick={() => act(w.id, 'cancelled')}>취소</Btn>
                    </>
                  )}
                  {tab === 'seated' && (
                    <>
                      <Btn sm onClick={() => setSeatFor(w)}>자리 변경</Btn>
                      <Btn sm variant="danger" onClick={() => act(w.id, 'left')}>퇴장</Btn>
                    </>
                  )}
                  {tab === 'done' && <Btn sm variant="ghost" onClick={() => act(w.id, 'waiting')}>대기로 복구</Btn>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {addOpen && <AddWaitModal onClose={() => setAddOpen(false)} />}
      {seatFor && (
        <SeatPickModal
          entry={seatFor}
          tables={tables}
          onClose={() => setSeatFor(null)}
          onPick={async (t, s) => { await act(seatFor.id, 'seated', t, s); setSeatFor(null) }}
        />
      )}
    </Modal>
  )
}

function AddWaitModal({ onClose }: { onClose: () => void }) {
  const members = useStore((s) => s.members)
  const addWait = useStore((s) => s.addWait)
  const [mode, setMode] = useState<'member' | 'guest'>('member')
  const [q, setQ] = useState('')
  const [memberId, setMemberId] = useState<string | null>(null)
  const [guest, setGuest] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const list = members.filter((m) => m.status === 'active').filter((m) => !q || m.nickname.includes(q) || m.no.includes(q)).slice(0, 30)

  const submit = async () => {
    setBusy(true)
    const err = await addWait(mode === 'member' ? memberId ?? undefined : undefined, mode === 'guest' ? guest : undefined, note)
    setBusy(false)
    if (err) return setError(err)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="대기 추가">
      <div className="space-y-4">
        <Segmented options={[{ value: 'member', label: '회원' }, { value: 'guest', label: '비회원' }]} value={mode} onChange={setMode} />
        {mode === 'member' ? (
          <>
            <Field label="회원 검색"><Input placeholder="닉네임 혹은 번호" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
            <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
              {list.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMemberId(m.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left ${memberId === m.id ? 'border-mint/60 bg-mint/8' : 'border-line hover:border-line2'}`}
                >
                  <Avatar emoji={m.emoji} color={m.color} size={26} />
                  <span className="text-sm font-semibold">{m.nickname}</span>
                  <span className="text-[15px] text-mut num">({m.no})</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <Field label="이름"><Input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="예: 김OO 2명" /></Field>
        )}
        <Field label="메모 (선택)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 친구 1명 더 옴" /></Field>
        {error && <div className="text-sm text-rose">{error}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" onClick={submit} disabled={busy || (mode === 'member' ? !memberId : !guest.trim())}>{busy ? '추가 중…' : '추가'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

function SeatPickModal({
  entry, tables, onClose, onPick,
}: {
  entry: WaitEntry
  tables: { no: number; seats: number }[]
  onClose: () => void
  onPick: (table: number, seat: number) => Promise<void>
}) {
  const [table, setTable] = useState(entry.table ?? tables[0]?.no ?? 1)
  const [seat, setSeat] = useState(entry.seat ?? 1)
  const seats = tables.find((t) => t.no === table)?.seats ?? 9
  return (
    <Modal open onClose={onClose} title="착석 위치">
      <div className="grid grid-cols-2 gap-3">
        <Field label="테이블">
          <Select value={table} onChange={(e) => { setTable(+e.target.value); setSeat(1) }}>
            {tables.map((t) => <option key={t.no} value={t.no}>TABLE {t.no} ({t.seats}석)</option>)}
          </Select>
        </Field>
        <Field label="좌석">
          <Select value={seat} onChange={(e) => setSeat(+e.target.value)}>
            {Array.from({ length: seats }, (_, i) => i + 1).map((s) => <option key={s} value={s}>{s}번</option>)}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={onClose}>취소</Btn>
        <Btn variant="primary" onClick={() => onPick(table, seat)}>착석 처리</Btn>
      </div>
    </Modal>
  )
}
