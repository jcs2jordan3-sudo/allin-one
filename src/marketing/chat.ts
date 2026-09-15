import { create } from 'zustand'

// 채팅 위젯 열림 상태 — 페이지 어디서든 "무료 체험 신청" 같은 버튼이 위젯을 열고 문구를 채울 수 있게 공유
interface ChatUi {
  open: boolean
  draft: string
  openWith: (text?: string) => void
  close: () => void
  setDraft: (text: string) => void
}

export const useChat = create<ChatUi>((set) => ({
  open: false,
  draft: '',
  openWith: (text) => set((s) => ({ open: true, draft: text ?? s.draft })),
  close: () => set({ open: false }),
  setDraft: (draft) => set({ draft }),
}))

export const TRIAL_TEMPLATE = '[무료 체험 신청]\n매장 이름: \n운영 테이블 수: \n연락 가능한 시간: '
export const CHAIN_TEMPLATE = '[여러 매장 도입 문의]\n매장 수: \n지역: \n연락 가능한 시간: '
export const QUICK_TOPICS: { label: string; text: string }[] = [
  { label: '무료 체험 신청', text: TRIAL_TEMPLATE },
  { label: '요금제 문의', text: '[요금제 문의]\n운영 테이블 수: \n궁금한 점: ' },
  { label: '기존 데이터 이전', text: '[데이터 이전 문의]\n지금 쓰는 방식(엑셀·다른 프로그램 등): \n회원 수: ' },
  { label: '여러 매장 운영', text: CHAIN_TEMPLATE },
]
