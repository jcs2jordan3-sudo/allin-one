import { useCallback, useEffect, useState } from 'react'
import { fmtDateTime, fmtNum } from '../lib/format'
import { Badge, Btn, Card, Modal, Select } from '../components/ui'
import { PLANS, intervalLabel } from '../../supabase/functions/_shared/plans.ts'
import {
  adminCancelSubscription, adminLinkSubscription, adminRunRenewal, adminSubscriptions, type AdminStore, type AdminSubscription,
} from './api'

const STATUS: Record<AdminSubscription['status'], { label: string; tone: 'mint' | 'rose' | 'mut' }> = {
  active: { label: '이용 중', tone: 'mint' },
  past_due: { label: '결제 실패', tone: 'rose' },
  canceled: { label: '해지', tone: 'mut' },
}
const ts = (iso: string | null) => (iso ? fmtDateTime(new Date(iso).getTime()) : '—')

/** 개발자 콘솔 — 마케팅 사이트에서 결제한 구독 목록·매장 연결·해지·갱신 결제 실행 */
export default function BillingSection({ stores, onChanged }: { stores: AdminStore[]; onChanged: () => void }) {
  const [list, setList] = useState<AdminSubscription[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<AdminSubscription | null>(null)

  const load = useCallback(async () => {
    const r = await adminSubscriptions()
    setError(r.error)
    setList(r.list)
  }, [])
  useEffect(() => { void load() }, [load])

  const runRenewal = async () => {
    setRunning(true)
    setMsg(null)
    const r = await adminRunRenewal()
    setRunning(false)
    if (r.error || !r.result) return setError(r.error ?? '갱신 결제를 실행하지 못했습니다.')
    setMsg(`결제일 지난 구독 ${r.result.due}건 · 성공 ${r.result.done} · 실패 ${r.result.failed} · 건너뜀 ${r.result.skipped}`)
    void load()
  }

  const link = async (s: AdminSubscription, storeId: string) => {
    const err = await adminLinkSubscription(s.id, storeId || null)
    if (err) return setError(err)
    void load()
    onChanged()
  }

  const monthly = (list ?? []).filter((s) => s.status !== 'canceled')
    .reduce((sum, s) => sum + (s.interval === 'month' ? s.amount : Math.round(s.amount / 12)), 0)

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold">
            구독 결제 {list && <span className="text-mut font-semibold">{list.length}</span>}
          </h2>
          <p className="text-[15px] text-mut">사이트에서 결제하면 매장이 자동 개설됩니다. 갱신 결제는 매일 10시에 자동 실행됩니다.</p>
        </div>
        <div className="flex gap-2">
          <Btn sm onClick={() => void load()}>새로고침</Btn>
          <Btn sm onClick={() => void runRenewal()} disabled={running}>{running ? '실행 중…' : '갱신 결제 지금 실행'}</Btn>
        </div>
      </div>
      {list && list.length > 0 && (
        <div className="text-[15px] text-mut mb-3">이용 중 구독의 월 환산 매출 <b className="text-ink num">{fmtNum(monthly)}원</b> (부가세 포함)</div>
      )}
      {msg && <div className="text-sm text-mint mb-2">{msg}</div>}
      {error && <div className="text-sm text-rose mb-2">{error}</div>}
      {!list && !error && <div className="text-mut text-sm">불러오는 중…</div>}
      {list?.length === 0 && <div className="text-mut text-sm">아직 결제한 구독이 없습니다.</div>}

      <div className="space-y-2.5">
        {list?.map((s) => (
          <Card key={s.id} className="p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-bold">{s.storeName || '(매장 이름 없음)'}</span>
              <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
              <span className="text-[15px] text-mut">
                {PLANS[s.plan]?.name ?? s.plan} · {intervalLabel(s.interval)} · <span className="num text-ink">{fmtNum(s.amount)}원</span>
              </span>
            </div>
            <div className="text-[15px] text-mut flex flex-wrap gap-x-4 gap-y-1">
              <span>{s.customerName ?? '—'} · {s.email}{s.phone ? ` · ${s.phone}` : ''}</span>
              <span>{[s.cardCompany, s.cardNumber].filter(Boolean).join(' ') || '카드 정보 없음'}</span>
            </div>
            <div className="text-[14px] text-faint flex flex-wrap gap-x-4 gap-y-1">
              <span>가입 {ts(s.createdAt)}</span>
              <span>{s.status === 'canceled' ? `해지 ${ts(s.canceledAt)} · 이용 종료 ${ts(s.currentPeriodEnd)}` : `다음 결제 ${ts(s.currentPeriodEnd)}`}</span>
              {s.lastPayment && (
                <span className={s.lastPayment.status === 'FAILED' ? 'text-rose' : ''}>
                  최근 결제 {s.lastPayment.status === 'DONE' ? '성공' : `실패(${s.failedCount}회) ${s.lastPayment.error ?? ''}`} {ts(s.lastPayment.approvedAt ?? s.lastPayment.createdAt)}
                  {s.lastPayment.receiptUrl && (
                    <a href={s.lastPayment.receiptUrl} target="_blank" rel="noreferrer" className="ml-2 underline">영수증</a>
                  )}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[15px] text-mut">연결 매장</span>
              <div className="w-56 max-w-full">
                <Select value={s.storeId ?? ''} onChange={(e) => void link(s, e.target.value)}>
                  <option value="">연결 안 됨</option>
                  {stores.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                </Select>
              </div>
              {s.status !== 'canceled' && <Btn sm variant="danger" onClick={() => setCancelTarget(s)}>해지</Btn>}
            </div>
          </Card>
        ))}
      </div>

      {cancelTarget && (
        <Modal open onClose={() => setCancelTarget(null)} title="구독 해지">
          <p className="text-[16px] leading-relaxed">
            <b>{cancelTarget.storeName}</b> ({cancelTarget.email}) 구독을 해지합니다. 이미 결제한 기간({ts(cancelTarget.currentPeriodEnd)}까지)은 유지되고,
            다음 결제부터 청구되지 않습니다. 환불이 필요하면 토스페이먼츠 상점관리자에서 결제를 취소하세요.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Btn variant="ghost" onClick={() => setCancelTarget(null)}>닫기</Btn>
            <Btn variant="danger" onClick={async () => {
              const err = await adminCancelSubscription(cancelTarget.id)
              setCancelTarget(null)
              if (err) setError(err)
              void load()
            }}>해지하기</Btn>
          </div>
        </Modal>
      )}
    </section>
  )
}
