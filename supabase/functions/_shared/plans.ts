// 요금제 — 마케팅 사이트(가격표·결제 금액 표시)와 Edge Function(실제 청구 금액)이 함께 쓰는 단일 기준.
// 금액은 부가세 포함 원화. 테이블 한도는 schema.sql 의 _plan_max_tables() 와 같게 유지할 것.
// 이 파일은 Deno(Edge Function)와 브라우저 양쪽에서 import 되므로 런타임 전용 API를 쓰지 않는다.

export type PlanId = 'standard' | 'pro'
export type BillingInterval = 'month' | 'year'

export interface Plan {
  id: PlanId
  name: string
  tagline: string
  monthly: number // 월간 결제 금액
  yearly: number // 연간 결제 금액 (월간 × 10 = 2개월 무료)
  maxTables: number | null // null = 무제한
  extras: string[] // 요금제별 차이 (기능은 두 요금제 공통)
}

export const PLANS: Record<PlanId, Plan> = {
  standard: {
    id: 'standard',
    name: '스탠다드',
    tagline: '테이블 4개까지, 소규모 펍에 맞춘 요금',
    monthly: 39000,
    yearly: 390000,
    maxTables: 4,
    extras: ['테이블 4개까지', '직원·회원 수 무제한'],
  },
  pro: {
    id: 'pro',
    name: '프로',
    tagline: '테이블 제한 없이, 대회가 많은 매장에',
    monthly: 69000,
    yearly: 690000,
    maxTables: null,
    extras: ['테이블 무제한', '직원·회원 수 무제한', '도입 초기 세팅 지원 (게임 셋·테이블·회원 등록)'],
  },
}

export const PLAN_IDS: PlanId[] = ['standard', 'pro']

export const isPlanId = (v: unknown): v is PlanId => v === 'standard' || v === 'pro'
export const isInterval = (v: unknown): v is BillingInterval => v === 'month' || v === 'year'

export const planAmount = (plan: PlanId, interval: BillingInterval): number =>
  interval === 'month' ? PLANS[plan].monthly : PLANS[plan].yearly

export const intervalLabel = (interval: BillingInterval): string => (interval === 'month' ? '월간' : '연간')

export const planOrderName = (plan: PlanId, interval: BillingInterval): string =>
  `ALL-IN ONE ${PLANS[plan].name} (${intervalLabel(interval)})`

/** 다음 결제일: 한 달 뒤(말일 보정) 또는 1년 뒤 */
export function nextPeriodEnd(from: Date, interval: BillingInterval): Date {
  const d = new Date(from.getTime())
  if (interval === 'year') {
    d.setUTCFullYear(d.getUTCFullYear() + 1)
    return d
  }
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + 1)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}
