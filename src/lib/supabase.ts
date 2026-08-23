import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// .env.local에 키가 없으면 null — 앱은 로컬 모드(localStorage 전용)로 동작
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
export const hasSupabase = supabase !== null

/** 이 브라우저 세션의 식별자 — 자기 쓰기 이벤트를 무시하기 위한 값 */
export const CLIENT_ID = crypto.randomUUID()
