import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { hasSupabase } from '../lib/supabase'
import { absUrl } from '../lib/url'
import { fmtNum } from '../lib/format'
import { formatPhone, isKrMobile } from '../lib/phone'
import {
  PLAN_IDS, PLANS, intervalLabel, isInterval, isPlanId, nextPeriodEnd, planAmount, type BillingInterval, type PlanId,
} from '../../supabase/functions/_shared/plans.ts'
import MarketingShell, { usePageTitle } from './Shell'
import { CycleToggle, yearlyPerMonth } from './Pricing'
import { loadTossPayments, saveDraft } from './api'
import { useChat } from './chat'
import { TOSS_CLIENT_KEY, TOSS_TEST_MODE } from './config'

const inputCls = 'w-full bg-surface2 border border-line2 px-3.5 h-[48px] text-[16px] placeholder:text-faint focus:border-mint/60 outline-none'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function Label({ children, hint }: { children: string; hint?: string }) {
  return (
    <span className="block mb-1.5">
      <span className="text-[15px] font-semibold">{children}</span>
      {hint && <span className="block text-[14px] text-faint mt-0.5">{hint}</span>}
    </span>
  )
}

export default function Checkout() {
  usePageTitle('구독 시작하기 · ALL-IN ONE')
  const [params] = useSearchParams()
  const openWith = useChat((s) => s.openWith)
  const [plan, setPlan] = useState<PlanId>(() => (isPlanId(params.get('plan')) ? (params.get('plan') as PlanId) : 'standard'))
  const [cycle, setCycle] = useState<BillingInterval>(() => (isInterval(params.get('interval')) ? (params.get('interval') as BillingInterval) : 'month'))
  const [storeName, setStoreName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = planAmount(plan, cycle)
  const nextDate = nextPeriodEnd(new Date(), cycle).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  const submit = async () => {
    setError(null)
    if (!hasSupabase) return setError('결제는 온라인 서비스에서만 진행할 수 있습니다.')
    if (!storeName.trim()) return setError('매장 이름을 입력해주세요.')
    if (!name.trim()) return setError('대표자 이름을 입력해주세요.')
    if (!EMAIL_RE.test(email.trim())) return setError('이메일 형식을 확인해주세요.')
    if (!isKrMobile(phone)) return setError('휴대폰 번호를 확인해주세요. (010으로 시작하는 11자리)')
    if (!agree) return setError('약관과 자동결제에 동의해야 결제할 수 있습니다.')
    setBusy(true)
    try {
      const TossPayments = await loadTossPayments()
      const customerKey = `aio-${crypto.randomUUID()}`
      saveDraft(customerKey, { plan, interval: cycle, storeName: storeName.trim(), name: name.trim(), email: email.trim(), phone: formatPhone(phone) })
      const payment = TossPayments(TOSS_CLIENT_KEY).payment({ customerKey })
      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: absUrl(`/intro/billing/success?plan=${plan}&interval=${cycle}`),
        failUrl: absUrl('/intro/billing/fail'),
        customerEmail: email.trim(),
        customerName: name.trim(),
      })
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code !== 'USER_CANCEL') setError((e as { message?: string }).message || '카드 등록 창을 열지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const summary = (
    <div className="border border-line2 bg-surface p-5 sm:p-6">
      <div className="text-[15px] text-mut">주문 내용</div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <div className="text-[20px] font-extrabold">{PLANS[plan].name} · {intervalLabel(cycle)}</div>
      </div>
      <dl className="mt-4 space-y-2.5 text-[16px]">
        <div className="flex justify-between gap-3"><dt className="text-mut">오늘 결제</dt><dd className="font-extrabold num">{fmtNum(amount)}원</dd></div>
        {cycle === 'year' && (
          <div className="flex justify-between gap-3"><dt className="text-mut">월 환산</dt><dd className="num">{fmtNum(yearlyPerMonth(plan))}원</dd></div>
        )}
        <div className="flex justify-between gap-3"><dt className="text-mut">다음 결제일</dt><dd>{nextDate}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-mut">테이블</dt><dd>{PLANS[plan].maxTables ? `${PLANS[plan].maxTables}개까지` : '무제한'}</dd></div>
      </dl>
      <p className="mt-4 pt-4 border-t border-line text-[14px] text-faint leading-relaxed">
        부가세 포함 금액입니다. 등록한 카드로 {cycle === 'month' ? '매월' : '매년'} 같은 날 자동 결제되며, 해지하면 다음 결제일부터 청구되지 않습니다.
      </p>
    </div>
  )

  return (
    <MarketingShell>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <Link to="/intro" state={{ section: 'pricing' }} className="text-[15px] text-mut hover:text-ink">‹ 요금제로 돌아가기</Link>
        <h1 className="mt-3 text-[30px] sm:text-[38px] font-black tracking-tight">구독 시작하기</h1>
        <p className="mt-2 text-[17px] text-mut">카드를 등록하면 첫 결제와 함께 매장이 바로 개설됩니다.</p>

        {TOSS_TEST_MODE && (
          <div className="mt-5 border border-mint/40 bg-mint/[0.06] px-4 py-3 text-[15px]">
            <b className="text-mint">테스트 결제 모드</b> · 지금은 카드를 등록해도 실제로 청구되지 않습니다.
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="space-y-8">
            <section>
              <h2 className="text-[19px] font-extrabold mb-3">1. 요금제</h2>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="요금제">
                {PLAN_IDS.map((id) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={plan === id}
                    onClick={() => setPlan(id)}
                    className={`text-left border p-4 ${plan === id ? 'border-mint bg-mint/[0.06]' : 'border-line2 hover:border-mint/50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[18px] font-extrabold">{PLANS[id].name}</span>
                      <span className={`w-5 h-5 rounded-full border-2 ${plan === id ? 'border-mint bg-mint shadow-[inset_0_0_0_3px_#07090e]' : 'border-line2'}`} aria-hidden />
                    </div>
                    <div className="mt-1 text-[15px] text-mut">{PLANS[id].maxTables ? `테이블 ${PLANS[id].maxTables}개까지` : '테이블 무제한'}</div>
                    <div className="mt-2 text-[17px] font-bold num">
                      {fmtNum(planAmount(id, cycle))}원 <span className="text-[14px] text-mut font-normal">/ {cycle === 'month' ? '월' : '년'}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <CycleToggle value={cycle} onChange={setCycle} />
              </div>
            </section>

            <section>
              <h2 className="text-[19px] font-extrabold mb-3">2. 매장·대표 정보</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <Label>매장 이름</Label>
                  <input className={inputCls} value={storeName} onChange={(e) => setStoreName(e.target.value)} maxLength={40} placeholder="예: 강남 올인 홀덤펍" />
                </label>
                <label className="block">
                  <Label>대표자 이름</Label>
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" />
                </label>
                <label className="block">
                  <Label>휴대폰</Label>
                  <input className={inputCls} value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} inputMode="numeric" autoComplete="tel" placeholder="010-0000-0000" />
                </label>
                <label className="block sm:col-span-2">
                  <Label hint="관리자 콘솔에 이 이메일로 가입하면 대표 권한이 연결됩니다.">대표 이메일</Label>
                  <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="owner@example.com" />
                </label>
              </div>
            </section>

            <div className="lg:hidden">{summary}</div>

            <section>
              <h2 className="text-[19px] font-extrabold mb-3">3. 동의 및 결제</h2>
              <label className="flex gap-3 items-start cursor-pointer border border-line2 p-4">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 w-5 h-5 accent-[#2fd6a0] shrink-0" />
                <span className="text-[15px] leading-relaxed">
                  <b>[필수]</b> <Link to="/intro/terms#terms" target="_blank" className="underline">이용약관</Link>·
                  <Link to="/intro/terms#refund" target="_blank" className="underline">결제·환불 규정</Link>·
                  <Link to="/intro/terms#privacy" target="_blank" className="underline">개인정보 처리방침</Link>에 동의하며,
                  등록한 카드로 {cycle === 'month' ? '매월' : '매년'} {fmtNum(amount)}원이 자동 결제되는 것에 동의합니다.
                </span>
              </label>
              <button
                onClick={() => void submit()}
                disabled={busy}
                className="mt-4 w-full h-[56px] bg-mint text-mintink font-extrabold text-[18px] disabled:opacity-50 hover:brightness-110"
              >
                {busy ? '카드 등록 창 여는 중…' : `카드 등록하고 ${fmtNum(amount)}원 결제`}
              </button>
              {error && <p className="mt-3 text-[15px] text-rose">{error}</p>}
              <p className="mt-3 text-[14px] text-faint leading-relaxed">
                결제는 토스페이먼츠 결제창에서 진행되며 카드번호는 저희 서버에 저장되지 않습니다. 궁금한 점은{' '}
                <button onClick={() => openWith('[결제 문의]\n')} className="underline hover:text-ink">채팅으로 문의</button>해 주세요.
              </p>
            </section>
          </div>

          <aside className="hidden lg:block lg:sticky lg:top-[88px]">{summary}</aside>
        </div>
      </div>
    </MarketingShell>
  )
}
