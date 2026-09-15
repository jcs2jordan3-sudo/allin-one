import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fmtNum } from '../lib/format'
import { PLANS, intervalLabel } from '../../supabase/functions/_shared/plans.ts'
import MarketingShell, { ctaPrimary, ctaSecondary, usePageTitle } from './Shell'
import { loadDraft, loadResult, saveResult, startSubscription, type StartResult } from './api'
import { useChat } from './chat'
import { TOSS_TEST_MODE } from './config'

const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'

function Panel({ children }: { children: ReactNode }) {
  return <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16">{children}</div>
}

type View = { kind: 'loading' } | { kind: 'done'; r: StartResult } | { kind: 'error'; message: string }

/** 토스 카드 등록 성공 후 돌아오는 페이지 — 서버에서 빌링키 발급·첫 결제·매장 개설을 마친다 */
export function BillingSuccess() {
  usePageTitle('결제 확인 · ALL-IN ONE')
  const [params] = useSearchParams()
  const openWith = useChat((s) => s.openWith)
  const customerKey = params.get('customerKey') ?? ''
  const authKey = params.get('authKey') ?? ''
  const [view, setView] = useState<View>({ kind: 'loading' })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const cached = customerKey ? loadResult(customerKey) : null
      if (cached) return setView({ kind: 'done', r: cached })
      if (!customerKey || !authKey) return setView({ kind: 'error', message: '결제 정보가 전달되지 않았습니다. 요금제 페이지에서 다시 진행해주세요.' })
      const draft = loadDraft(customerKey)
      if (!draft) {
        return setView({ kind: 'error', message: '입력하신 매장 정보를 찾지 못했습니다. 결제를 시작한 브라우저에서 다시 진행하시거나 채팅으로 문의해주세요. 카드 등록만 된 상태라면 요금은 청구되지 않았습니다.' })
      }
      const res = await startSubscription({ ...draft, authKey, customerKey })
      if (res.error || !res.data) return setView({ kind: 'error', message: res.error ?? '결제를 완료하지 못했습니다.' })
      saveResult(customerKey, res.data)
      setView({ kind: 'done', r: res.data })
    })()
  }, [customerKey, authKey])

  return (
    <MarketingShell>
      <Panel>
        {view.kind === 'loading' && (
          <div className="text-center py-16">
            <div className="mx-auto w-12 h-12 border-4 border-line2 border-t-mint rounded-full animate-spin" aria-hidden />
            <h1 className="mt-6 text-[24px] font-extrabold">결제를 진행하고 있어요</h1>
            <p className="mt-2 text-[16px] text-mut">잠시만 기다려 주세요. 이 창을 닫지 마세요.</p>
          </div>
        )}

        {view.kind === 'error' && (
          <div>
            <h1 className="text-[28px] font-black">결제를 완료하지 못했어요</h1>
            <p className="mt-3 text-[17px] text-mut leading-relaxed">{view.message}</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/intro/checkout" className={ctaPrimary}>다시 시도하기</Link>
              <button onClick={() => openWith('[결제 오류 문의]\n' + view.message)} className={ctaSecondary}>채팅으로 문의</button>
            </div>
          </div>
        )}

        {view.kind === 'done' && (
          <div>
            <div className="w-14 h-14 bg-mint text-mintink text-[30px] font-black flex items-center justify-center" aria-hidden>✓</div>
            <h1 className="mt-5 text-[30px] sm:text-[36px] font-black tracking-tight">결제가 완료됐어요</h1>
            {TOSS_TEST_MODE && <p className="mt-2 text-[15px] text-mint">테스트 결제라 실제로 청구되지 않았습니다.</p>}

            <dl className="mt-6 border border-line2 divide-y divide-line text-[16px]">
              {[
                ['요금제', `${PLANS[view.r.plan].name} · ${intervalLabel(view.r.interval)}`],
                ['결제 금액', `${fmtNum(view.r.amount)}원 (부가세 포함)`],
                ['결제 카드', [view.r.cardCompany, view.r.cardNumber].filter(Boolean).join(' ') || '—'],
                ['다음 결제일', fmtDay(view.r.nextBillingAt)],
                ['대표 이메일', view.r.email],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-mut shrink-0">{k}</dt>
                  <dd className="text-right break-all">{v}</dd>
                </div>
              ))}
            </dl>
            {view.r.receiptUrl && (
              <a href={view.r.receiptUrl} target="_blank" rel="noreferrer" className="inline-block mt-3 text-[15px] text-mut underline hover:text-ink">
                카드 영수증 보기
              </a>
            )}

            {view.r.storeReady ? (
              <div className="mt-8 border border-mint/40 bg-mint/[0.05] p-5 sm:p-6">
                <h2 className="text-[20px] font-extrabold">"{view.r.storeName}" 매장이 준비됐어요</h2>
                <ol className="mt-4 space-y-2.5 text-[16px] leading-relaxed list-decimal pl-5">
                  <li>관리자 콘솔에서 <b>초대받은 직원이에요 → 가입</b>을 누릅니다.</li>
                  <li><b className="break-all">{view.r.email}</b> 로 가입하면 대표 권한이 바로 연결됩니다.</li>
                  <li>매장 현황에서 테이블 설정과 게임 셋을 정하면 운영을 시작할 수 있어요.</li>
                </ol>
                <Link to="/" className={`${ctaPrimary} mt-6 w-full sm:w-auto`}>관리자 콘솔 열기</Link>
              </div>
            ) : (
              <div className="mt-8 border border-line2 p-5 sm:p-6">
                <h2 className="text-[20px] font-extrabold">매장 개설을 마무리하고 있어요</h2>
                <p className="mt-2 text-[16px] text-mut leading-relaxed">
                  결제는 정상 처리됐고, 매장 연결을 확인한 뒤 남겨주신 연락처로 안내드릴게요. 급하시면 채팅으로 알려주세요.
                </p>
                <button onClick={() => openWith(`[매장 개설 확인 요청]\n대표 이메일: ${view.r.email}\n매장 이름: ${view.r.storeName}`)} className={`${ctaSecondary} mt-5`}>
                  채팅으로 문의
                </button>
              </div>
            )}
          </div>
        )}
      </Panel>
    </MarketingShell>
  )
}

/** 토스 카드 등록 실패·취소 후 돌아오는 페이지 */
export function BillingFail() {
  usePageTitle('결제 취소 · ALL-IN ONE')
  const [params] = useSearchParams()
  const openWith = useChat((s) => s.openWith)
  const code = params.get('code') ?? ''
  const message = params.get('message') ?? ''
  const canceled = code === 'PAY_PROCESS_CANCELED' || code === 'USER_CANCEL'

  return (
    <MarketingShell>
      <Panel>
        <h1 className="text-[28px] sm:text-[34px] font-black">{canceled ? '카드 등록을 취소했어요' : '카드 등록에 실패했어요'}</h1>
        <p className="mt-3 text-[17px] text-mut leading-relaxed">
          {canceled ? '요금은 청구되지 않았습니다. 준비되면 언제든 다시 진행해주세요.' : message || '잠시 후 다시 시도하거나 다른 카드로 진행해주세요.'}
        </p>
        {!canceled && code && <p className="mt-2 text-[14px] text-faint">오류 코드 {code}</p>}
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link to="/intro/checkout" className={ctaPrimary}>다시 시도하기</Link>
          <button onClick={() => openWith(`[카드 등록 문의]\n${code} ${message}`.trim())} className={ctaSecondary}>채팅으로 문의</button>
        </div>
      </Panel>
    </MarketingShell>
  )
}
