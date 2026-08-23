import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { fmtDateTime, fmtNum } from '../lib/format'
import { Badge, Btn, Card, Empty, Field, Input, Modal, SectionTitle } from '../components/ui'
import Avatar from '../components/Avatar'

const MEDALS = ['🥇', '🥈', '🥉']

/** 동점자 동순위 + 차순위 건너뛰기 (예: 3위 2명 → 다음은 5위) */
export function withCompetitionRanks<T extends { rp: number }>(sorted: T[]): { item: T; rank: number }[] {
  let lastRp: number | null = null
  let lastRank = 0
  return sorted.map((item, i) => {
    const rank = item.rp === lastRp ? lastRank : i + 1
    lastRp = item.rp
    lastRank = rank
    return { item, rank }
  })
}

export default function RankingTab() {
  const st = useStore()
  const [settleOpen, setSettleOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const open = st.seasons.find((s) => s.status === 'open')
  const closed = st.seasons.find((s) => s.status === 'closed')
  const history = st.seasons.filter((s) => s.status === 'settled')

  const ranked = useMemo(
    () =>
      withCompetitionRanks(
        [...st.members].filter((m) => m.status === 'active').sort((a, b) => b.rp - a.rp),
      ),
    [st.members],
  )

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle
          right={
            <>
              {open && <Btn sm onClick={() => setConfirmClose(true)}>시즌 마감</Btn>}
              {closed && <Btn sm variant="gold" onClick={() => setSettleOpen(true)}>전송 및 환수</Btn>}
              {!open && !closed && <Btn sm variant="primary" onClick={() => setNewOpen(true)}>새 시즌 시작</Btn>}
            </>
          }
        >
          랭킹 현황 {open && <span className="text-mut font-normal text-sm ml-1">{open.name}</span>}
          {closed && <Badge tone="rose">마감됨 — 정산 대기</Badge>}
        </SectionTitle>

        {ranked.length === 0 ? (
          <Empty>랭킹 데이터가 없습니다.</Empty>
        ) : (
          <div className="space-y-2.5">
            {ranked.map(({ item: m, rank }) => {
              const top3 = rank <= 3
              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-4 px-5 py-3.5 rounded-2xl border transition-colors ${
                    top3
                      ? 'border-gold/40 bg-gradient-to-r from-gold/10 via-surface to-surface'
                      : 'border-line bg-surface'
                  }`}
                >
                  <span className={`w-8 text-center shrink-0 ${top3 ? 'text-xl' : 'text-sm font-bold text-mut num'}`}>
                    {top3 ? MEDALS[rank - 1] : rank}
                  </span>
                  <Avatar emoji={m.emoji} color={m.color} size={38} />
                  <span className="font-bold truncate">{m.nickname}</span>
                  <span className={`ml-auto font-bold num ${top3 ? 'text-gold text-lg' : 'text-ink'}`}>
                    {fmtNum(m.rp)}<span className="text-[12px] font-semibold text-mut ml-0.5">RP</span>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <SectionTitle>지난 시즌</SectionTitle>
          <div className="space-y-3">
            {history.map((s) => (
              <Card key={s.id} className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold">{s.name}</span>
                  <span className="text-[12px] text-mut num">{s.closedAt ? fmtDateTime(s.closedAt) : ''} 마감</span>
                </div>
                <div className="space-y-1.5">
                  {s.results?.slice(0, 5).map((r) => (
                    <div key={r.memberId} className="flex items-center gap-3 text-sm">
                      <span className="w-6 text-center">{r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</span>
                      <Avatar emoji={r.emoji} color={r.color} size={24} />
                      <span>{r.nickname}</span>
                      <span className="ml-auto num text-mut">{fmtNum(r.rp)}RP</span>
                      {r.paid ? <span className="num text-gold text-[13px]">+{fmtNum(r.paid)}P</span> : null}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <SettleModal open={settleOpen} onClose={() => setSettleOpen(false)} />
      <NewSeasonModal open={newOpen} onClose={() => setNewOpen(false)} />
      <Modal open={confirmClose} onClose={() => setConfirmClose(false)} title="시즌 마감">
        <p className="text-sm text-mut leading-relaxed">
          <b className="text-ink">{open?.name}</b> 시즌을 마감할까요?
          <br />현재 RP 순위가 스냅샷으로 고정되고, 이후 "전송 및 환수"로 보상을 지급합니다.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={() => setConfirmClose(false)}>취소</Btn>
          <Btn variant="primary" onClick={() => { st.closeSeason(); setConfirmClose(false) }}>마감하기</Btn>
        </div>
      </Modal>
    </div>
  )
}

function SettleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settleSeason = useStore((s) => s.settleSeason)
  const season = useStore((s) => s.seasons.find((x) => x.status === 'closed'))
  const [r1, setR1] = useState('100000')
  const [r2, setR2] = useState('50000')
  const [r3, setR3] = useState('30000')

  if (!season) return null
  return (
    <Modal open={open} onClose={onClose} title="시즌 정산 — 전송 및 환수">
      <p className="text-sm text-mut leading-relaxed mb-4">
        순위별 보상 포인트를 지급하고 전체 회원의 RP를 회수(초기화)합니다.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="1위 보상(P)"><Input type="number" value={r1} onChange={(e) => setR1(e.target.value)} /></Field>
        <Field label="2위 보상(P)"><Input type="number" value={r2} onChange={(e) => setR2(e.target.value)} /></Field>
        <Field label="3위 보상(P)"><Input type="number" value={r3} onChange={(e) => setR3(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={onClose}>취소</Btn>
        <Btn variant="gold" onClick={() => { settleSeason([+r1, +r2, +r3]); onClose() }}>정산 실행</Btn>
      </div>
    </Modal>
  )
}

function NewSeasonModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const startSeason = useStore((s) => s.startSeason)
  const count = useStore((s) => s.seasons.length)
  const [name, setName] = useState(`시즌 ${count + 1}`)
  return (
    <Modal open={open} onClose={onClose} title="새 시즌 시작">
      <Field label="시즌 이름">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={onClose}>취소</Btn>
        <Btn variant="primary" onClick={() => { startSeason(name.trim() || `시즌 ${count + 1}`); onClose() }}>시작</Btn>
      </div>
    </Modal>
  )
}
