import { supabase } from '../lib/supabase'
import { errMsg } from '../store/map'
import type { BillingInterval, PlanId } from '../../supabase/functions/_shared/plans.ts'

// ── 문의 채팅 (방문자) ───────────────────────────────────────────────────
// 로그인 없이 브라우저에 저장한 랜덤 키로 자기 대화만 읽고 쓴다 (서버 RPC가 키로 스레드를 찾음).

export interface ChatMessage {
  id: string
  sender: 'visitor' | 'admin'
  body: string
  at: string
}
export interface ChatThread {
  name: string | null
  contact: string | null
  messages: ChatMessage[]
}

let memoryKey: string | null = null
export function visitorKey(): string {
  try {
    let k = localStorage.getItem('aio-visitor')
    if (!k) {
      k = crypto.randomUUID()
      localStorage.setItem('aio-visitor', k)
    }
    return k
  } catch {
    memoryKey ??= crypto.randomUUID()
    return memoryKey
  }
}

const toThread = (data: unknown): ChatThread => {
  const r = (data ?? {}) as Record<string, unknown>
  const list = Array.isArray(r.messages) ? (r.messages as Array<Record<string, unknown>>) : []
  return {
    name: (r.name as string) ?? null,
    contact: (r.contact as string) ?? null,
    messages: list.map((m) => ({ id: String(m.id), sender: m.sender === 'admin' ? 'admin' : 'visitor', body: String(m.body ?? ''), at: String(m.at ?? '') })),
  }
}

export async function fetchThread(): Promise<ChatThread | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('inquiry_fetch', { p_visitor: visitorKey() })
  return error ? null : toThread(data)
}

export async function sendChat(body: string, name?: string, contact?: string): Promise<{ thread: ChatThread | null; error: string | null }> {
  if (!supabase) return { thread: null, error: '채팅 문의는 온라인 서비스에서만 사용할 수 있습니다.' }
  const { data, error } = await supabase.rpc('inquiry_send', {
    p_visitor: visitorKey(), p_body: body, p_name: name?.trim() || null, p_contact: contact?.trim() || null,
  })
  return error ? { thread: null, error: errMsg(error) } : { thread: toThread(data), error: null }
}

// ── 구독 결제 ────────────────────────────────────────────────────────────

export interface CheckoutDraft {
  plan: PlanId
  interval: BillingInterval
  storeName: string
  name: string
  email: string
  phone: string
}

export interface StartResult {
  ok: true
  plan: PlanId
  interval: BillingInterval
  amount: number
  email: string
  storeName: string
  cardCompany: string | null
  cardNumber: string | null
  nextBillingAt: string
  storeReady: boolean
  provisionError: string | null
  receiptUrl: string | null
  approvedAt: string | null
}

// 카드 등록 창에서 돌아올 때 입력값을 되찾기 위한 임시 저장 (같은 탭 sessionStorage 우선, 없으면 localStorage)
const draftKey = (customerKey: string) => `aio-checkout-${customerKey}`
const resultKey = (customerKey: string) => `aio-result-${customerKey}`

export function saveDraft(customerKey: string, draft: CheckoutDraft) {
  const v = JSON.stringify({ ...draft, savedAt: Date.now() })
  try { sessionStorage.setItem(draftKey(customerKey), v) } catch { /* 무시 */ }
  try { localStorage.setItem(draftKey(customerKey), v) } catch { /* 무시 */ }
}

export function loadDraft(customerKey: string): CheckoutDraft | null {
  for (const store of [() => sessionStorage, () => localStorage]) {
    try {
      const raw = store().getItem(draftKey(customerKey))
      if (raw) {
        const d = JSON.parse(raw) as CheckoutDraft & { savedAt?: number }
        if (!d.savedAt || Date.now() - d.savedAt < 6 * 3_600_000) return d
      }
    } catch { /* 무시 */ }
  }
  return null
}

export function saveResult(customerKey: string, r: StartResult) {
  try { sessionStorage.setItem(resultKey(customerKey), JSON.stringify(r)) } catch { /* 무시 */ }
  try { localStorage.removeItem(draftKey(customerKey)) } catch { /* 무시 */ }
}

export function loadResult(customerKey: string): StartResult | null {
  try {
    const raw = sessionStorage.getItem(resultKey(customerKey))
    return raw ? (JSON.parse(raw) as StartResult) : null
  } catch {
    return null
  }
}

/** Edge Function 호출: 빌링키 발급 + 첫 결제 + 매장 자동 개설. 같은 customerKey로 다시 불러도 이중 결제 없음 */
export async function startSubscription(p: CheckoutDraft & { authKey: string; customerKey: string }): Promise<{ data: StartResult | null; error: string | null }> {
  if (!supabase) return { data: null, error: '결제는 온라인 서비스에서만 사용할 수 있습니다.' }
  const { data, error } = await supabase.functions.invoke('toss-billing', { body: { action: 'start', ...p } })
  if (error) {
    let message = '결제 처리 중 문제가 생겼습니다. 잠시 후 다시 시도해주세요.'
    try {
      const ctx = (error as { context?: Response }).context
      const j = ctx ? await ctx.json() : null
      if (j?.error) message = String(j.error)
    } catch { /* 본문 없음 */ }
    return { data: null, error: message }
  }
  return { data: data as StartResult, error: null }
}

// ── 토스페이먼츠 SDK (결제창) ────────────────────────────────────────────

interface TossPaymentInstance {
  requestBillingAuth: (p: { method: 'CARD'; successUrl: string; failUrl: string; customerEmail?: string; customerName?: string }) => Promise<void>
}
type TossFactory = (clientKey: string) => { payment: (p: { customerKey: string }) => TossPaymentInstance }
declare global {
  interface Window { TossPayments?: TossFactory }
}

let sdkLoader: Promise<TossFactory> | null = null
export function loadTossPayments(): Promise<TossFactory> {
  if (window.TossPayments) return Promise.resolve(window.TossPayments)
  sdkLoader ??= new Promise<TossFactory>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://js.tosspayments.com/v2/standard'
    s.async = true
    s.onload = () => (window.TossPayments ? resolve(window.TossPayments) : reject(new Error('결제 모듈을 불러오지 못했습니다.')))
    s.onerror = () => {
      sdkLoader = null
      reject(new Error('결제 모듈을 불러오지 못했습니다. 네트워크를 확인해주세요.'))
    }
    document.head.appendChild(s)
  })
  return sdkLoader
}
