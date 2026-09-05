import { useStore } from '../store'
import { hasSupabase } from './supabase'

/**
 * 공개 페이지 경로(/rank, /display/…, /qr/…)에 매장 식별자 ?s= 를 붙인다.
 * 클라우드 모드에서 매장이 여러 개면 공개 페이지가 "첫 매장"으로 잘못 열리지 않도록 하기 위함.
 * 콘솔 스코프가 잡힌 뒤에는 storeId가 바뀌지 않으므로 렌더 중 getState()로 읽어도 안전하다.
 */
export function withStore(path: string): string {
  const storeId = useStore.getState().storeId
  if (!hasSupabase || !storeId) return path
  return `${path}${path.includes('?') ? '&' : '?'}s=${storeId}`
}
