import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useStore } from '../store'
import { absUrl } from '../lib/url'

/**
 * 테이블 좌석 QR 인쇄 시트 — 좌석에 부착해 셀프 체크인/참가 진입점으로 사용.
 * QR은 위치 식별자만 담고, 스캔 후 본인 인증을 거치므로 무기명 재화 토큰이 아님 (규제 대응 원칙).
 */
export default function QrSheet() {
  const { tableNo } = useParams()
  const storeName = useStore((s) => s.storeName)
  const table = useStore((s) => s.tables.find((t) => String(t.no) === tableNo))

  if (!table) {
    return <div className="min-h-screen bg-white text-black flex items-center justify-center">테이블을 찾을 수 없습니다.</div>
  }

  const seats = Array.from({ length: table.seats }, (_, i) => i + 1)

  return (
    // 인쇄물이므로 의도적으로 밝은 단일 테마
    <div className="min-h-screen bg-white text-neutral-900 p-10 print:p-4">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-end justify-between border-b-2 border-neutral-900 pb-4 mb-8">
          <div>
            <div className="text-sm font-semibold text-neutral-500">{storeName} · ALL-IN ONE</div>
            <h1 className="text-3xl font-black tracking-tight">TABLE {table.no} 좌석 QR</h1>
          </div>
          <button
            onClick={() => window.print()}
            className="print:hidden px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold"
          >
            인쇄하기
          </button>
        </header>
        <div className="grid grid-cols-3 gap-6 print:grid-cols-3">
          {seats.map((s) => (
            <div key={s} className="border-2 border-neutral-900 rounded-2xl p-4 flex flex-col items-center gap-2 break-inside-avoid">
              <QRCodeSVG value={absUrl(`/rank?table=${table.no}&seat=${s}`)} size={132} />
              <div className="font-black text-lg tracking-tight">T{table.no} · {s}번 좌석</div>
              <div className="text-[11px] text-neutral-500 text-center leading-snug">
                스캔 후 회원 인증하고<br />게임에 참가하세요
              </div>
            </div>
          ))}
        </div>
        <footer className="mt-8 text-[11px] text-neutral-400 print:mt-4">
          QR은 좌석 위치 식별용이며, 참가·재화 처리는 스캔 후 본인 인증을 거쳐 진행됩니다.
        </footer>
      </div>
    </div>
  )
}
