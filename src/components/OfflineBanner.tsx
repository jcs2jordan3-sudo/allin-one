import { useSyncStatus } from '../store'

/** 오프라인·동기화 오류 배너 — 타이머 표시는 계속되지만 서버 반영이 멈춘 상태를 알림 */
export default function OfflineBanner() {
  const status = useSyncStatus((s) => s.status)
  if (status !== 'offline' && status !== 'error') return null
  const offline = status === 'offline'
  return (
    <div
      role="status"
      className={`sticky top-0 z-50 text-center text-[13px] font-semibold px-4 py-2 border-b ${
        offline ? 'bg-rose/15 text-rose border-rose/30' : 'bg-gold/15 text-gold border-gold/30'
      }`}
    >
      {offline
        ? '오프라인 — 타이머는 계속 표시되지만 조작은 저장되지 않습니다. 연결되면 자동으로 다시 불러옵니다.'
        : '동기화 오류 — 서버 응답이 없습니다. 최근 조작이 반영되지 않았을 수 있으니 화면을 새로고침해 확인하세요.'}
    </div>
  )
}
