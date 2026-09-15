import { supabase } from '../lib/supabase'
import { errMsg } from '../store/map'

// 개발자(플랫폼 관리자) 콘솔 API — platform_admins 에 등록된 계정만 서버가 허용
const sb = () => supabase!

export interface AdminStore {
  id: string
  name: string
  createdAt: string
  owner: { name: string; email: string; linked: boolean } | null
  staffCount: number
  memberCount: number
  selected: boolean // 개발자가 현재 대표 권한으로 보고 있는 매장
}

export async function fetchIsPlatformAdmin(): Promise<boolean> {
  const { data, error } = await sb().rpc('is_platform_admin')
  return !error && data === true
}

export async function adminListStores(): Promise<{ stores: AdminStore[]; error: string | null }> {
  const { data, error } = await sb().rpc('admin_list_stores')
  if (error) return { stores: [], error: errMsg(error) }
  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
  return {
    error: null,
    stores: rows.map((r) => {
      const o = r.owner as Record<string, unknown> | null
      return {
        id: String(r.id),
        name: String(r.name ?? ''),
        createdAt: String(r.createdAt ?? ''),
        owner: o ? { name: String(o.name ?? ''), email: String(o.email ?? ''), linked: o.linked === true } : null,
        staffCount: Number(r.staffCount ?? 0),
        memberCount: Number(r.memberCount ?? 0),
        selected: r.selected === true,
      }
    }),
  }
}

/** 개발자가 볼 매장 선택 — 이후 관리자 콘솔(/)이 그 매장의 대표 권한으로 열림. null이면 해제 */
export async function adminSelectStore(storeId: string | null): Promise<string | null> {
  const { error } = await sb().rpc('admin_select_store', { p_store: storeId })
  return error ? errMsg(error) : null
}

export async function adminCreateStore(p: { storeName: string; ownerEmail: string; ownerName: string }): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await sb().rpc('admin_create_store', {
    p_store_name: p.storeName.trim(), p_owner_email: p.ownerEmail.trim(), p_owner_name: p.ownerName.trim() || '대표',
  })
  if (error) return { id: null, error: errMsg(error) }
  return { id: String(data), error: null }
}

export async function adminSetStoreOwner(p: { storeId: string; ownerEmail: string; ownerName?: string }): Promise<string | null> {
  const { error } = await sb().rpc('admin_set_store_owner', {
    p_store: p.storeId, p_owner_email: p.ownerEmail.trim(), p_owner_name: p.ownerName?.trim() || null,
  })
  return error ? errMsg(error) : null
}

// ── 구독 결제 (마케팅 사이트에서 들어온 구독) ────────────────────────────

export interface AdminSubscription {
  id: string
  email: string
  customerName: string | null
  phone: string | null
  storeName: string | null
  plan: 'standard' | 'pro'
  interval: 'month' | 'year'
  amount: number
  status: 'active' | 'past_due' | 'canceled'
  cardCompany: string | null
  cardNumber: string | null
  failedCount: number
  currentPeriodEnd: string
  createdAt: string
  canceledAt: string | null
  storeId: string | null
  linkedStoreName: string | null
  lastPayment: { status: 'DONE' | 'FAILED'; amount: number; approvedAt: string | null; receiptUrl: string | null; error: string | null; createdAt: string } | null
}

export async function adminSubscriptions(): Promise<{ list: AdminSubscription[]; error: string | null }> {
  const { data, error } = await sb().rpc('admin_subscriptions')
  if (error) return { list: [], error: errMsg(error) }
  return { list: (Array.isArray(data) ? data : []) as AdminSubscription[], error: null }
}

export async function adminLinkSubscription(subscriptionId: string, storeId: string | null): Promise<string | null> {
  const { error } = await sb().rpc('admin_link_subscription', { p_subscription: subscriptionId, p_store: storeId })
  return error ? errMsg(error) : null
}

export async function adminCancelSubscription(subscriptionId: string): Promise<string | null> {
  const { error } = await sb().rpc('admin_cancel_subscription', { p_subscription: subscriptionId })
  return error ? errMsg(error) : null
}

/** 결제일이 지난 구독을 지금 청구 (평소에는 매일 10시 자동 실행) */
export async function adminRunRenewal(): Promise<{ result: { due: number; done: number; failed: number; skipped: number } | null; error: string | null }> {
  const { data, error } = await sb().functions.invoke('toss-billing', { body: { action: 'renew' } })
  if (error) {
    let message = errMsg(error)
    try {
      const ctx = (error as { context?: Response }).context
      const j = ctx ? await ctx.json() : null
      if (j?.error) message = String(j.error)
    } catch { /* 본문 없음 */ }
    return { result: null, error: message }
  }
  return { result: data, error: null }
}

// ── 문의 채팅 ────────────────────────────────────────────────────────────

export interface AdminInquiry {
  id: string
  name: string | null
  contact: string | null
  createdAt: string
  lastAt: string
  unread: boolean
  last: { sender: 'visitor' | 'admin'; body: string } | null
}
export interface AdminInquiryMessage {
  id: string
  sender: 'visitor' | 'admin'
  body: string
  at: string
}

export async function adminInquiries(): Promise<{ list: AdminInquiry[]; error: string | null }> {
  const { data, error } = await sb().rpc('admin_inquiries')
  if (error) return { list: [], error: errMsg(error) }
  return { list: (Array.isArray(data) ? data : []) as AdminInquiry[], error: null }
}

export async function adminInquiryMessages(inquiryId: string): Promise<{ list: AdminInquiryMessage[]; error: string | null }> {
  const { data, error } = await sb().rpc('admin_inquiry_messages', { p_inquiry: inquiryId })
  if (error) return { list: [], error: errMsg(error) }
  return { list: (Array.isArray(data) ? data : []) as AdminInquiryMessage[], error: null }
}

export async function adminInquiryReply(inquiryId: string, body: string): Promise<string | null> {
  const { error } = await sb().rpc('admin_inquiry_reply', { p_inquiry: inquiryId, p_body: body })
  return error ? errMsg(error) : null
}
