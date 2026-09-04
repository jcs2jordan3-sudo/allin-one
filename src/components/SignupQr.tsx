import { QRCodeSVG } from 'qrcode.react'
import { hasSupabase } from '../lib/supabase'
import { useStore } from '../store'
import { absUrl } from '../lib/url'
import { Btn, Modal } from './ui'

/** 매장 회원가입 URL — 클라우드 모드: /join?s=매장id, 로컬 모드: 공개 랭킹 */
export function useSignupUrl(): string {
  const storeId = useStore((s) => s.storeId)
  if (hasSupabase && storeId) return absUrl(`/join?s=${storeId}`)
  return absUrl('/rank')
}

export function SignupQrModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const url = useSignupUrl()
  const storeName = useStore((s) => s.storeName)
  return (
    <Modal open={open} onClose={onClose} title="매장 회원가입 QR">
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="bg-white p-4 rounded-2xl">
          <QRCodeSVG value={url} size={200} />
        </div>
        <div className="text-center">
          <div className="font-bold">{storeName}</div>
          <p className="text-[16px] text-mut mt-1 leading-relaxed">
            {hasSupabase
              ? <>손님이 스캔하면 회원가입 페이지로 연결됩니다.<br />가입 즉시 회원번호와 포인트 지갑이 생깁니다.</>
              : <>클라우드 모드를 켜면 이 QR이 회원가입 페이지로 연결됩니다.<br />지금은 공개 랭킹으로 연결됩니다.</>}
          </p>
          <code className="block mt-2 text-[14px] text-faint break-all">{url}</code>
        </div>
        <div className="flex gap-2">
          <Btn sm onClick={() => navigator.clipboard.writeText(url).catch(() => {})}>링크 복사</Btn>
          <Btn sm onClick={() => window.print()}>인쇄</Btn>
        </div>
      </div>
    </Modal>
  )
}
