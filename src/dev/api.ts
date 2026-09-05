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
