import { useEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ChatWidget from './ChatWidget'
import { TRIAL_TEMPLATE, useChat } from './chat'
import { BUSINESS, BUSINESS_READY } from './config'

/** 마케팅 페이지 공통 버튼 스타일 (링크에도 쓰기 위해 클래스로 둠) */
export const ctaPrimary =
  'inline-flex items-center justify-center gap-2 h-[52px] px-6 bg-mint text-mintink font-bold text-[17px] hover:brightness-110 whitespace-nowrap'
export const ctaSecondary =
  'inline-flex items-center justify-center gap-2 h-[52px] px-6 border border-line2 text-ink font-semibold text-[17px] hover:border-mint/60 hover:text-mint whitespace-nowrap'

/** 페이지 제목 설정 (벗어나면 원래 제목으로) */
export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title
    document.title = title
    return () => { document.title = prev }
  }, [title])
}

/** 소개 페이지의 섹션으로 이동 — 다른 마케팅 페이지에서 누르면 소개 페이지로 가서 스크롤 */
export function useGoSection() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return (id: string) => {
    if (pathname === '/intro') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else navigate('/intro', { state: { section: id } })
  }
}

const NAV = [
  { id: 'features', label: '기능' },
  { id: 'pricing', label: '요금제' },
  { id: 'faq', label: '자주 묻는 질문' },
]

export default function MarketingShell({ children }: { children: ReactNode }) {
  const openWith = useChat((s) => s.openWith)
  const go = useGoSection()

  return (
    <div className="min-h-screen bg-bg text-ink break-keep">
      {/* 헤더는 단색 — 폰에서 반투명·블러를 쓰면 색 띠가 생김 */}
      <header className="sticky top-0 z-40 bg-bg border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[64px] flex items-center justify-between gap-3">
          <Link to="/intro" className="flex items-center gap-2 shrink-0" onClick={() => window.scrollTo({ top: 0 })}>
            <span className="w-8 h-8 bg-mint/15 border border-mint/30 text-mint flex items-center justify-center font-black">♠</span>
            <span className="font-extrabold tracking-tight text-[18px]">ALL-IN <span className="text-mint">ONE</span></span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-[16px] text-mut">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => go(n.id)} className="hover:text-ink">{n.label}</button>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/" className="hidden sm:inline text-[16px] text-mut hover:text-ink px-2">로그인</Link>
            <button onClick={() => openWith(TRIAL_TEMPLATE)} className="h-[40px] px-4 bg-mint text-mintink font-bold text-[15px] whitespace-nowrap hover:brightness-110">
              무료 체험
            </button>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-line mt-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 md:grid-cols-[1.6fr_1fr_1fr] text-[15px] text-mut">
          <div className="space-y-3">
            <div className="font-extrabold tracking-tight text-[18px] text-ink">♠ ALL-IN <span className="text-mint">ONE</span></div>
            <p>홀덤펍 운영 관리 서비스</p>
            {BUSINESS_READY ? (
              <dl className="text-[14px] text-faint leading-relaxed">
                <div>상호 {BUSINESS.companyName} · 대표 {BUSINESS.ceo}</div>
                <div>사업자등록번호 {BUSINESS.bizNumber}{BUSINESS.ecommerceNumber && ` · 통신판매업 ${BUSINESS.ecommerceNumber}`}</div>
                {BUSINESS.address && <div>{BUSINESS.address}</div>}
                <div>{[BUSINESS.phone, BUSINESS.email].filter(Boolean).join(' · ')}</div>
              </dl>
            ) : (
              <p className="text-[14px] text-faint">사업자 정보는 정식 결제 오픈 전에 이곳에 게시됩니다.</p>
            )}
          </div>
          <div className="space-y-2">
            <div className="font-semibold text-ink">서비스</div>
            {NAV.map((n) => (
              <button key={n.id} onClick={() => go(n.id)} className="block hover:text-ink">{n.label}</button>
            ))}
            <Link to="/" className="block hover:text-ink">관리자 콘솔 로그인</Link>
          </div>
          <div className="space-y-2">
            <div className="font-semibold text-ink">고객 지원</div>
            <button onClick={() => openWith()} className="block hover:text-ink">채팅 문의</button>
            <Link to="/intro/terms#terms" className="block hover:text-ink">이용약관</Link>
            <Link to="/intro/terms#refund" className="block hover:text-ink">결제·환불 규정</Link>
            <Link to="/intro/terms#privacy" className="block hover:text-ink font-semibold">개인정보 처리방침</Link>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 sm:pb-10 text-[14px] text-faint">© {new Date().getFullYear()} ALL-IN ONE</div>
      </footer>

      <ChatWidget />
    </div>
  )
}
