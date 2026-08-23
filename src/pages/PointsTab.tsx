import { useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useStore } from '../store'
import type { Currency, LedgerEntry } from '../types'
import { CURRENCY_LABEL, CURRENCY_UNIT } from '../types'
import { fmtDateTime, fmtNum, maskName } from '../lib/format'
import { Badge, Btn, Card, Empty, Field, Input, Modal, Pager, SectionTitle, Segmented } from '../components/ui'
import Avatar from '../components/Avatar'
import { absUrl } from '../lib/url'

const PAGE_SIZE = 10

export default function PointsTab() {
  const st = useStore()
  const [transfer, setTransfer] = useState<{ c: Currency; mode: 'send' | 'reclaim' } | null>(null)
  const [chargeC, setChargeC] = useState<Currency | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'player' | 'hq'>('all')
  const [includeLeft, setIncludeLeft] = useState(false)
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const totals = useMemo(() => {
    const list = st.members.filter((m) => includeLeft || m.status === 'active')
    return {
      P: list.reduce((a, m) => a + m.balances.P, 0),
      V: list.reduce((a, m) => a + m.balances.V, 0),
    }
  }, [st.members, includeLeft])

  const rows = useMemo(() => {
    return st.ledger.filter((l) => {
      if (filter === 'hq') return l.from === 'hq' || l.to === 'hq'
      if (filter === 'player') return l.from !== 'hq' && l.to !== 'hq'
      return true
    })
  }, [st.ledger, filter])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const currencyMeta: { c: Currency; tone: 'gold' | 'sky' | 'viol'; unit: string }[] = [
    { c: 'P', tone: 'gold', unit: 'P' },
    { c: 'S', tone: 'sky', unit: 'S' },
    { c: 'V', tone: 'viol', unit: '장' },
  ]

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle right={<Btn sm onClick={() => setQrOpen(true)}>QR 생성</Btn>}>{st.storeName} 포인트</SectionTitle>
        <div className="space-y-3">
          {currencyMeta.map(({ c, tone, unit }) => (
            <Card key={c} className="p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Badge tone={tone}>{CURRENCY_LABEL[c]}</Badge>
                <span className={`text-2xl font-bold num ${tone === 'gold' ? 'text-gold' : tone === 'sky' ? 'text-sky' : 'text-viol'}`}>
                  {fmtNum(st.wallet[c])}
                  <span className="text-base ml-0.5">{unit}</span>
                </span>
              </div>
              <div className="flex gap-2">
                <Btn sm variant="gold" onClick={() => setChargeC(c)}>충전</Btn>
                <Btn sm onClick={() => setTransfer({ c, mode: 'reclaim' })}>환수하기</Btn>
                <Btn sm variant="primary" onClick={() => setTransfer({ c, mode: 'send' })}>전송하기</Btn>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle
          right={
            <label className="flex items-center gap-2 text-[14px] text-mut cursor-pointer">
              <input
                type="checkbox"
                checked={includeLeft}
                onChange={(e) => setIncludeLeft(e.target.checked)}
                className="accent-[#2fd6a0]"
              />
              탈퇴 유저 포함
            </label>
          }
        >
          유저 포인트 총합
        </SectionTitle>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[13px] text-mut border-b border-line">
                <th className="px-4 py-3 font-semibold">지점</th>
                <th className="px-4 py-3 font-semibold text-right">포인트</th>
                <th className="px-4 py-3 font-semibold text-right">음료권</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-3 font-semibold">{st.storeName}</td>
                <td className="px-4 py-3 text-right num text-gold">{fmtNum(totals.P)}P</td>
                <td className="px-4 py-3 text-right num text-viol">{totals.V}장</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <SectionTitle
          right={
            <Segmented
              options={[
                { value: 'all', label: '전체' },
                { value: 'player', label: '플레이어' },
                { value: 'hq', label: '본사' },
              ]}
              value={filter}
              onChange={(v) => { setFilter(v); setPage(1) }}
            />
          }
        >
          포인트 거래내역 <span className="text-[13px] text-mut font-normal ml-1">증감은 지점 잔액 기준</span>
        </SectionTitle>
        {pageRows.length === 0 ? (
          <Empty>거래내역이 없습니다.</Empty>
        ) : (
          <div className="space-y-2">
            {pageRows.map((l) => (
              <LedgerRow key={l.id} entry={l} expanded={expanded === l.id} onToggle={() => setExpanded(expanded === l.id ? null : l.id)} />
            ))}
          </div>
        )}
        <Pager page={page} pages={pages} onPage={setPage} />
      </section>

      {transfer && <TransferModal c={transfer.c} mode={transfer.mode} onClose={() => setTransfer(null)} />}
      {chargeC && <ChargeModal c={chargeC} onClose={() => setChargeC(null)} />}
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title="매장 가입 QR">
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="bg-white p-4 rounded-2xl">
            <QRCodeSVG value={absUrl('/rank')} size={180} />
          </div>
          <p className="text-[14px] text-mut text-center">
            손님이 스캔하면 매장 페이지로 연결됩니다.<br />인쇄하여 카운터·테이블에 비치하세요.
          </p>
        </div>
      </Modal>
    </div>
  )
}

function LedgerRow({ entry: l, expanded, onToggle }: { entry: LedgerEntry; expanded: boolean; onToggle: () => void }) {
  const members = useStore((s) => s.members)
  const storeName = useStore((s) => s.storeName)
  const games = useStore((s) => s.games)

  const nameOf = (key: string) => {
    if (key === 'store') return storeName
    if (key === 'hq') return '본사'
    const m = members.find((x) => x.id === key)
    return m ? `${m.nickname}(${m.no} · ${maskName(m.nickname)})` : '알 수 없음'
  }
  // 부호는 항상 지점 잔액 기준: 지점으로 들어오면 +, 나가면 − (벤치마크의 부호 혼재 결함 개선)
  const storeGain = l.to === 'store'
  const game = l.gameId ? games.find((g) => g.id === l.gameId) : null

  return (
    <Card className="px-4 py-3">
      <button onClick={onToggle} className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 text-left">
        <span className={`font-bold num text-sm ${storeGain ? 'text-mint' : 'text-rose'}`}>
          {CURRENCY_LABEL[l.currency]} {storeGain ? '+' : '−'}{fmtNum(l.amount)}{CURRENCY_UNIT[l.currency]}
        </span>
        <span className="text-mut">|</span>
        <span className="text-sm">
          {nameOf(l.from)} <span className="text-mut">→</span> {nameOf(l.to)}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="text-[14px] text-mut num">잔여 {fmtNum(l.storeBalanceAfter)}{CURRENCY_UNIT[l.currency]}</span>
          <span className={`text-mut text-xs transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </span>
        <span className="w-full text-[13px] text-faint num">{fmtDateTime(l.ts)}</span>
      </button>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-line/60 grid sm:grid-cols-3 gap-2 text-[14px] text-mut">
          <div>사유 · <span className="text-ink">{l.reason ?? '—'}</span></div>
          <div>처리자 · <span className="text-ink">{l.operator ?? '시스템'}</span></div>
          <div>연관 게임 · <span className="text-ink">{game?.name ?? '—'}</span></div>
        </div>
      )}
    </Card>
  )
}

/** 지점 지갑 충전 — 본사 발행/현금 매입분을 원장에 기록 */
function ChargeModal({ c, onClose }: { c: Currency; onClose: () => void }) {
  const issueToStore = useStore((s) => s.issueToStore)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const n = parseInt(amount, 10)
    const err = issueToStore(c, n || 0, reason)
    if (err) return setError(err)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`${CURRENCY_LABEL[c]} 충전 (지점 지갑)`}>
      <p className="text-[14px] text-mut leading-relaxed mb-4">
        본사 발행분·현금 매입분을 지점 지갑에 추가합니다. 모든 충전은 거래내역(본사 → 지점)에 기록됩니다.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="수량">
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label="사유 (필수)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 8월 정기 발행" />
        </Field>
      </div>
      {error && <div className="text-sm text-rose mt-3">{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={onClose}>취소</Btn>
        <Btn variant="gold" onClick={submit}>충전</Btn>
      </div>
    </Modal>
  )
}

function TransferModal({ c, mode, onClose }: { c: Currency; mode: 'send' | 'reclaim'; onClose: () => void }) {
  const members = useStore((s) => s.members)
  const transferToMember = useStore((s) => s.transferToMember)
  const reclaimFromMember = useStore((s) => s.reclaimFromMember)
  const [q, setQ] = useState('')
  const [memberId, setMemberId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const list = members
    .filter((m) => m.status === 'active')
    .filter((m) => !q || m.nickname.includes(q) || m.no.includes(q))

  const submit = () => {
    if (!memberId) return setError('회원을 선택해주세요.')
    const n = parseInt(amount, 10)
    if (!n || n <= 0) return setError('수량을 입력해주세요.')
    if (mode === 'reclaim' && !reason.trim()) return setError('환수 사유를 입력해주세요.')
    const err =
      mode === 'send'
        ? transferToMember(memberId, c, n, reason.trim() || '지점 전송')
        : reclaimFromMember(memberId, c, n, reason.trim())
    if (err) return setError(err)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`${CURRENCY_LABEL[c]} ${mode === 'send' ? '전송하기' : '환수하기'}`}>
      <div className="space-y-4">
        <Field label="회원 검색">
          <Input placeholder="닉네임 혹은 번호" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
          {list.map((m) => (
            <button
              key={m.id}
              onClick={() => setMemberId(m.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors ${
                memberId === m.id ? 'border-mint/60 bg-mint/8' : 'border-line hover:border-line2'
              }`}
            >
              <Avatar emoji={m.emoji} color={m.color} size={26} />
              <span className="text-sm font-semibold">{m.nickname}</span>
              <span className="text-[13px] text-mut num">({m.no})</span>
              <span className="ml-auto text-[13px] text-mut num">보유 {fmtNum(m.balances[c])}{CURRENCY_UNIT[c]}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="수량">
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
          <Field label={mode === 'reclaim' ? '사유 (필수)' : '사유 (선택)'}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === 'reclaim' ? '예: 오지급 정정' : '예: 이벤트 지급'} />
          </Field>
        </div>
        {error && <div className="text-sm text-rose">{error}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" onClick={submit}>{mode === 'send' ? '전송' : '환수'}</Btn>
        </div>
      </div>
    </Modal>
  )
}
