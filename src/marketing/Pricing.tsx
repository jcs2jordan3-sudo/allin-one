import { useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtNum } from '../lib/format'
import { PLAN_IDS, PLANS, type BillingInterval, type PlanId } from '../../supabase/functions/_shared/plans.ts'
import { CHAIN_TEMPLATE, TRIAL_TEMPLATE, useChat } from './chat'
import { ALL_FEATURES, TRIAL_DAYS } from './config'
import { ctaPrimary, ctaSecondary } from './Shell'

/** 연간 요금의 월 환산액(100원 단위)과 절약액 */
export const yearlyPerMonth = (plan: PlanId) => Math.round(PLANS[plan].yearly / 12 / 100) * 100
export const yearlySaving = (plan: PlanId) => PLANS[plan].monthly * 12 - PLANS[plan].yearly

export function CycleToggle({ value, onChange }: { value: BillingInterval; onChange: (v: BillingInterval) => void }) {
  return (
    <div className="inline-flex border border-line2 p-1 gap-1" role="radiogroup" aria-label="결제 주기">
      {(['month', 'year'] as const).map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={value === c}
          onClick={() => onChange(c)}
          className={`h-[40px] px-4 text-[16px] font-semibold whitespace-nowrap ${value === c ? 'bg-mint text-mintink' : 'text-mut hover:text-ink'}`}
        >
          {c === 'month' ? '월간 결제' : '연간 결제'}
          {c === 'year' && <span className={`ml-1.5 text-[14px] ${value === c ? 'text-mintink' : 'text-mint'}`}>2개월 무료</span>}
        </button>
      ))}
    </div>
  )
}

export default function Pricing() {
  const [cycle, setCycle] = useState<BillingInterval>('month')
  const openWith = useChat((s) => s.openWith)

  return (
    <div>
      <div className="flex justify-center mb-8">
        <CycleToggle value={cycle} onChange={setCycle} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_IDS.map((id) => {
          const p = PLANS[id]
          const featured = id === 'pro'
          return (
            <div key={id} className={`relative flex flex-col p-6 sm:p-7 border ${featured ? 'border-mint/60 bg-mint/[0.04]' : 'border-line2 bg-surface'}`}>
              {featured && (
                <span className="absolute -top-3 left-6 bg-mint text-mintink text-[13px] font-bold px-2.5 py-0.5">테이블 무제한</span>
              )}
              <div className="text-[22px] font-extrabold">{p.name}</div>
              <p className="text-[15px] text-mut mt-1">{p.tagline}</p>

              <div className="mt-6">
                {cycle === 'month' ? (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[40px] font-black num tracking-tight">{fmtNum(p.monthly)}</span>
                    <span className="text-[17px] text-mut">원 / 월</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[40px] font-black num tracking-tight">{fmtNum(p.yearly)}</span>
                      <span className="text-[17px] text-mut">원 / 년</span>
                    </div>
                    <div className="text-[15px] text-mint font-semibold mt-1">
                      월 {fmtNum(yearlyPerMonth(id))}원꼴 · {fmtNum(yearlySaving(id))}원 절약
                    </div>
                  </>
                )}
                <div className="text-[14px] text-faint mt-1">부가세 포함</div>
              </div>

              <ul className="mt-6 space-y-2.5 text-[16px] flex-1">
                <li className="flex gap-2"><span className="text-mint font-bold">✓</span><span>모든 기능 포함</span></li>
                {p.extras.map((x) => (
                  <li key={x} className="flex gap-2"><span className="text-mint font-bold">✓</span><span>{x}</span></li>
                ))}
              </ul>

              <div className="mt-7 space-y-2">
                <Link to={`/intro/checkout?plan=${id}&interval=${cycle}`} className={`${featured ? ctaPrimary : ctaSecondary} w-full`}>
                  구독 시작하기
                </Link>
                <button onClick={() => openWith(TRIAL_TEMPLATE)} className="w-full text-[15px] text-mut hover:text-ink py-2">
                  {TRIAL_DAYS}일 무료 체험 먼저 해보기
                </button>
              </div>
            </div>
          )
        })}

        <div className="flex flex-col p-6 sm:p-7 border border-line2 bg-surface">
          <div className="text-[22px] font-extrabold">여러 매장</div>
          <p className="text-[15px] text-mut mt-1">2개 매장 이상 · 체인·직영점</p>
          <div className="mt-6">
            <div className="text-[32px] font-black tracking-tight">상담 후 안내</div>
            <div className="text-[15px] text-mut mt-1">매장 수에 따라 매장당 요금을 낮춰 드려요</div>
          </div>
          <ul className="mt-6 space-y-2.5 text-[16px] flex-1">
            <li className="flex gap-2"><span className="text-mint font-bold">✓</span><span>매장마다 독립된 회원·포인트 장부</span></li>
            <li className="flex gap-2"><span className="text-mint font-bold">✓</span><span>매장별 대표·직원 계정</span></li>
            <li className="flex gap-2"><span className="text-mint font-bold">✓</span><span>도입 일정에 맞춘 순차 개설</span></li>
          </ul>
          <div className="mt-7">
            <button onClick={() => openWith(CHAIN_TEMPLATE)} className={`${ctaSecondary} w-full`}>상담 요청하기</button>
          </div>
        </div>
      </div>

      <div className="mt-8 border border-line p-5 sm:p-6">
        <div className="font-bold text-[17px] mb-3">모든 요금제에 포함된 기능</div>
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 text-[15px] text-mut">
          {ALL_FEATURES.map((f) => (
            <li key={f} className="flex gap-2"><span className="text-mint">•</span>{f}</li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-center text-[15px] text-mut">
        설치비 0원 · 약정·위약금 없음 · 해지하면 다음 결제일부터 청구 중단
      </p>
    </div>
  )
}
