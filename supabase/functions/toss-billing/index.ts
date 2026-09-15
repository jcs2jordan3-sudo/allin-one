// 토스페이먼츠 자동결제(구독) — 마케팅 사이트 결제와 매일 갱신 결제
//   POST { action: 'start', authKey, customerKey, plan, interval, email, name, phone, storeName }
//        카드 등록(빌링 인증) 후 호출 → 빌링키 발급 → 첫 결제 → 구독·결제 기록 → 매장 자동 개설
//   POST { action: 'renew' }  (헤더 x-cron-secret = CRON_SECRET, 또는 플랫폼 관리자 로그인 토큰)
//        결제일이 지난 구독을 청구. 주문번호가 구독·결제일·실패 횟수로 정해져 같은 날 두 번 돌아도 이중 청구 없음
// 비밀값: TOSS_SECRET_KEY, CRON_SECRET  (npx supabase secrets set …)
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { isInterval, isPlanId, nextPeriodEnd, planAmount, planOrderName, type BillingInterval, type PlanId } from '../_shared/plans.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MAX_RETRY = 7 // 갱신 결제 실패 시 매일 재시도하는 최대 횟수 (이후 past_due 로 남겨 관리자가 처리)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const TOSS_SECRET = Deno.env.get('TOSS_SECRET_KEY') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

async function toss(path: string, body: unknown) {
  const r = await fetch('https://api.tosspayments.com' + path, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(TOSS_SECRET + ':'), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data: Json = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data }
}
const tossMessage = (data: Json, fallback: string) => (typeof data?.message === 'string' && data.message) || fallback

const service = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

async function findSubscription(db: SupabaseClient, customerKey: string): Promise<Json | null> {
  const { data } = await db.from('subscriptions').select('*').eq('customer_key', customerKey).maybeSingle()
  return data ?? null
}

async function summary(db: SupabaseClient, sub: Json, provisionError: string | null = null) {
  const { data: pay } = await db.from('payments').select('status, amount, approved_at, receipt_url')
    .eq('subscription_id', sub.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return {
    ok: true,
    plan: sub.plan, interval: sub.billing_interval, amount: sub.amount, email: sub.email, storeName: sub.store_name,
    cardCompany: sub.card_company, cardNumber: sub.card_number, nextBillingAt: sub.current_period_end,
    storeReady: sub.store_id != null, provisionError,
    receiptUrl: pay?.receipt_url ?? null, approvedAt: pay?.approved_at ?? null,
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const CUSTOMER_KEY_RE = /^[A-Za-z0-9\-_=.@]{2,50}$/

async function start(body: Json) {
  const authKey = typeof body.authKey === 'string' ? body.authKey : ''
  const customerKey = typeof body.customerKey === 'string' ? body.customerKey : ''
  const plan = body.plan
  const interval = body.interval
  const email = String(body.email ?? '').trim().toLowerCase()
  const name = String(body.name ?? '').trim().slice(0, 40)
  const storeName = String(body.storeName ?? '').trim().slice(0, 40)
  const phone = String(body.phone ?? '').replace(/[^0-9]/g, '').slice(0, 11)
  if (!authKey || authKey.length > 300) return json(400, { error: '카드 등록 정보가 올바르지 않습니다. 처음부터 다시 진행해주세요.' })
  if (!CUSTOMER_KEY_RE.test(customerKey)) return json(400, { error: '결제 고객 정보가 올바르지 않습니다.' })
  if (!isPlanId(plan) || !isInterval(interval)) return json(400, { error: '요금제 정보가 올바르지 않습니다.' })
  if (!EMAIL_RE.test(email) || !name || !storeName) return json(400, { error: '매장 이름·대표자 이름·이메일을 확인해주세요.' })

  const db = service()
  const existing = await findSubscription(db, customerKey)
  if (existing) return json(200, await summary(db, existing)) // 새로고침·중복 호출

  // 1) 빌링키 발급
  const issued = await toss('/v1/billing/authorizations/issue', { authKey, customerKey })
  if (!issued.ok || !issued.data.billingKey) {
    const raced = await findSubscription(db, customerKey)
    if (raced) return json(200, await summary(db, raced))
    return json(400, { error: tossMessage(issued.data, '카드 등록에 실패했습니다.'), code: issued.data.code })
  }
  const billingKey = String(issued.data.billingKey)

  // 2) 첫 결제 (금액은 서버 요금표 기준 — 브라우저가 보낸 금액은 쓰지 않음)
  const amount = planAmount(plan as PlanId, interval as BillingInterval)
  const orderId = `aio_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
  const paid = await toss(`/v1/billing/${encodeURIComponent(billingKey)}`, {
    customerKey, amount, orderId, orderName: planOrderName(plan as PlanId, interval as BillingInterval),
    customerEmail: email, customerName: name,
  })
  if (!paid.ok || paid.data.status !== 'DONE') {
    return json(402, { error: tossMessage(paid.data, '결제가 승인되지 않았습니다. 다른 카드로 다시 시도해주세요.'), code: paid.data.code })
  }

  // 3) 기록 — 실패하면 방금 결제를 취소해 "돈은 나갔는데 구독이 없는" 상태를 막는다
  const { data: sub, error: subErr } = await db.from('subscriptions').insert({
    customer_key: customerKey, email, customer_name: name, phone: phone || null, store_name: storeName,
    plan, billing_interval: interval, amount, billing_key: billingKey,
    card_company: issued.data.cardCompany ?? null, card_number: issued.data.card?.number ?? paid.data.card?.number ?? null,
    status: 'active', current_period_end: nextPeriodEnd(new Date(), interval as BillingInterval).toISOString(),
  }).select().single()
  if (subErr || !sub) {
    console.error('subscription insert failed', subErr)
    await toss(`/v1/payments/${encodeURIComponent(String(paid.data.paymentKey))}/cancel`, { cancelReason: '구독 기록 실패로 자동 취소' })
    const raced = await findSubscription(db, customerKey)
    if (raced) return json(200, await summary(db, raced))
    return json(500, { error: '결제 기록 중 문제가 생겨 결제를 자동 취소했습니다. 잠시 후 다시 시도해주세요.' })
  }
  const { error: payErr } = await db.from('payments').insert({
    subscription_id: sub.id, order_id: orderId, payment_key: paid.data.paymentKey, amount, status: 'DONE',
    approved_at: paid.data.approvedAt ?? new Date().toISOString(), receipt_url: paid.data.receipt?.url ?? null,
  })
  if (payErr) console.error('payment insert failed', payErr)

  // 4) 매장 자동 개설 (실패해도 결제는 유효 — 개발자 콘솔에서 연결)
  const prov = await db.rpc('_provision_subscription_store', { p_subscription: sub.id })
  const provisionError = prov.error ? prov.error.message : null
  if (prov.error) console.error('provision failed', prov.error)
  const fresh = (await findSubscription(db, customerKey)) ?? sub
  return json(200, await summary(db, fresh, provisionError))
}

async function isPlatformAdmin(db: SupabaseClient, req: Request): Promise<boolean> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  const { data } = await db.auth.getUser(token)
  const uid = data?.user?.id
  if (!uid) return false
  const { data: row } = await db.from('platform_admins').select('user_id').eq('user_id', uid).maybeSingle()
  return !!row
}

async function renew(req: Request) {
  const db = service()
  const byCron = CRON_SECRET !== '' && req.headers.get('x-cron-secret') === CRON_SECRET
  if (!byCron && !(await isPlatformAdmin(db, req))) return json(403, { error: '권한이 없습니다.' })

  const now = new Date()
  const { data: due, error } = await db.from('subscriptions').select('*')
    .in('status', ['active', 'past_due']).lte('current_period_end', now.toISOString())
    .not('billing_key', 'is', null).lt('failed_count', MAX_RETRY).order('current_period_end').limit(50)
  if (error) return json(500, { error: error.message })

  const result = { due: due?.length ?? 0, done: 0, failed: 0, skipped: 0 }
  for (const sub of due ?? []) {
    const periodTag = String(sub.current_period_end).slice(0, 10).replace(/-/g, '')
    const orderId = `aio_${String(sub.id).replace(/-/g, '').slice(0, 16)}_${periodTag}_${sub.failed_count}`
    const paid = await toss(`/v1/billing/${encodeURIComponent(sub.billing_key)}`, {
      customerKey: sub.customer_key, amount: sub.amount, orderId,
      orderName: planOrderName(sub.plan, sub.billing_interval), customerEmail: sub.email, customerName: sub.customer_name ?? '대표',
    })
    if (paid.ok && paid.data.status === 'DONE') {
      let next = nextPeriodEnd(new Date(sub.current_period_end), sub.billing_interval)
      if (next <= now) next = nextPeriodEnd(now, sub.billing_interval) // 오래 밀린 구독은 오늘부터 새 주기
      await db.from('payments').insert({
        subscription_id: sub.id, order_id: orderId, payment_key: paid.data.paymentKey, amount: sub.amount, status: 'DONE',
        approved_at: paid.data.approvedAt ?? now.toISOString(), receipt_url: paid.data.receipt?.url ?? null,
      })
      await db.from('subscriptions').update({
        status: 'active', failed_count: 0, current_period_end: next.toISOString(), updated_at: now.toISOString(),
      }).eq('id', sub.id)
      result.done++
    } else if (paid.data.code === 'DUPLICATED_ORDER_ID') {
      result.skipped++ // 같은 주문을 다른 실행이 이미 처리
    } else {
      await db.from('payments').insert({
        subscription_id: sub.id, order_id: orderId, amount: sub.amount, status: 'FAILED',
        error: `${paid.data.code ?? paid.status} ${tossMessage(paid.data, '결제 실패')}`,
      })
      await db.from('subscriptions').update({
        status: 'past_due', failed_count: sub.failed_count + 1, updated_at: now.toISOString(),
      }).eq('id', sub.id)
      result.failed++
    }
  }
  return json(200, result)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  if (!TOSS_SECRET) return json(500, { error: '결제 설정이 완료되지 않았습니다.' })
  let body: Json
  try {
    body = await req.json()
  } catch {
    return json(400, { error: '요청 형식이 올바르지 않습니다.' })
  }
  try {
    if (body.action === 'start') return await start(body)
    if (body.action === 'renew') return await renew(req)
    return json(400, { error: '알 수 없는 요청입니다.' })
  } catch (e) {
    console.error(e)
    return json(500, { error: '결제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' })
  }
})
