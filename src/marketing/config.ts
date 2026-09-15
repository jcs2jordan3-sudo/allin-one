// 마케팅 사이트(/intro) 설정 — 결제 키·사업자 정보.
// 실결제로 전환할 때: 토스페이먼츠 계약 후 .env.local 에 VITE_TOSS_CLIENT_KEY(라이브 클라이언트 키)를 넣고,
// Edge Function 비밀값 TOSS_SECRET_KEY 를 라이브 시크릿 키로 바꾼다.

/** 토스페이먼츠 클라이언트 키(공개 값). 비어 있으면 토스 문서용 테스트 키 → 카드를 등록해도 실제 청구 없음 */
export const TOSS_CLIENT_KEY: string = import.meta.env.VITE_TOSS_CLIENT_KEY || 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq'
export const TOSS_TEST_MODE = TOSS_CLIENT_KEY.startsWith('test_')

/**
 * 사업자 정보 — 전자상거래법에 따라 사이트 하단에 표시해야 하는 항목.
 * 토스페이먼츠 가맹 심사·정식 결제 오픈 전에 반드시 채울 것. 비어 있으면 "오픈 전 게시" 안내가 나간다.
 */
export const BUSINESS = {
  companyName: '', // 상호
  ceo: '', // 대표자
  bizNumber: '', // 사업자등록번호
  ecommerceNumber: '', // 통신판매업 신고번호
  address: '', // 사업장 주소
  phone: '', // 고객센터 전화
  email: '', // 고객센터 이메일
  privacyOfficer: '', // 개인정보 보호책임자
}
export const BUSINESS_READY = Boolean(BUSINESS.companyName && BUSINESS.bizNumber)

export const TRIAL_DAYS = 14

/** 모든 요금제에 공통으로 들어가는 기능 (가격표·기능 소개에 같이 쓰임) */
export const ALL_FEATURES = [
  '토너먼트 타이머·TV 전광판',
  '매장 전체 현황판',
  '좌석 배치도·테이블 밸런싱',
  'QR 회원 가입·셀프 바인',
  '포인트·시드·음료권 원장',
  '이용권 발급·사용 관리',
  '시즌 RP 랭킹·공개 랭킹',
  '대기자 명단·좌석 QR 체크인',
  '카톡 공지 자동 작성',
  '직원 권한 3단계·작업 이력',
  '폰·태블릿 앱 (홈 화면 설치)',
  '데이터 백업 다운로드',
]
