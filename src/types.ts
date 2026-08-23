// 도메인 타입 정의 — 데이터 계층은 추후 Supabase 등으로 교체 가능하도록 순수 타입으로 유지

export type Currency = 'P' | 'S' | 'V' // 포인트 / 시드 / 음료권

export interface Member {
  id: string
  no: string // 4자리 회원번호
  nickname: string
  emoji: string
  color: string
  realName?: string // 실명 (선택) — 공개 화면에는 노출하지 않음
  phone?: string
  balances: Record<Currency, number>
  rp: number
  joinedAt: number
  status: 'active' | 'left'
  memo?: string
}

/** RP 수동 조정 이력 — 수동 조정은 사유 필수 (§6-8 원칙) */
export interface RpLogEntry {
  id: string
  ts: number
  memberId: string
  delta: number // +지급 / −환수
  reason: string
  operator: string
}

export interface Manager {
  id: string
  loginId: string
  name: string
}

export type LevelType = 'level' | 'break'

export interface BlindLevel {
  type: LevelType
  label: string // 'Level 1' | 'BREAK 1'
  durationMin: number // 0 = 무제한(마지막 레벨)
  sb: number
  bb: number
  ante: number
  colorUp?: number // break 전용: 칩 제거(컬러업) 단위
}

export type BuyinType = 'BUYIN' | 'RE_BUYIN' | 'RE_ENTRY'

export interface BuyinRule {
  type: BuyinType
  round: number // 회차 (BUYIN은 1 고정)
  cost: Partial<Record<Currency, number>> // 재화별 비용 (정의된 재화만 지불 수단으로 허용)
  chips: number
}

export interface EarlyBirdRule {
  levelIndex: number // levels 배열 인덱스
  chips: number
}

export interface PrizeRule {
  rank: number
  currency: Currency
  amount: number
}

export interface GameSet {
  id: string
  name: string
  levels: BlindLevel[]
  regCloseLevelIndex: number // 이 레벨 도달 시 신규 바인·리엔트리 차단
  buyinRules: BuyinRule[]
  earlyBird: EarlyBirdRule[]
  prizes: PrizeRule[]
  rpByRank: number[] // [1위 RP, 2위 RP, ...]
}

export interface Entry {
  memberId: string
  table: number
  seat: number
  status: 'playing' | 'eliminated'
  rank?: number
  outAt?: number
}

export interface BuyinEvent {
  id: string
  ts: number
  memberId: string
  type: BuyinType
  round: number
  currency: Currency
  cost: number
  chips: number
  earlyBirdChips?: number
}

export type GameStatus = 'running' | 'paused' | 'ended'

export interface Game {
  id: string
  name: string
  gameSetName: string
  snapshot: GameSet // 시작 시점 게임 셋 사본 — 이후 셋 수정과 무관
  status: GameStatus
  startedAt: number // 미래 시각이면 예약 게임 (도달 시 자동 진행)
  pausedAt?: number
  pausedTotal: number // 누적 일시정지 ms
  regClosedManual?: boolean
  entries: Entry[]
  buyins: BuyinEvent[]
  tables: number[]
  endedAt?: number
  notice?: string // 게임별 공지 — 전광판 NOTICE 탭에 노출
  cancelled?: boolean // 취소(무효화)된 게임 — 지급분 역거래 회수 완료
  chipCorrection?: number // 누적 칩 보정 (± 가능, 카운팅 오류 정정)
  correctionCount?: number
  addonChips?: number // 누적 애드온 칩
  addonCount?: number
}

export interface LedgerEntry {
  id: string
  ts: number
  currency: Currency
  amount: number // 항상 양수, 방향은 from/to로 표현
  from: string // 'store' | 'hq' | memberId
  to: string
  reason?: string
  operator?: string
  gameId?: string
  storeBalanceAfter: number
}

export interface EventPost {
  id: string
  title: string
  body: string
  createdAt: number
}

export interface SeasonResult {
  memberId: string
  nickname: string
  emoji: string
  color: string
  rp: number
  rank: number
  paid?: number // 지급된 포인트
}

export interface Season {
  id: string
  name: string
  startedAt: number
  status: 'open' | 'closed' | 'settled'
  closedAt?: number
  results?: SeasonResult[]
}

export interface TableInfo {
  no: number
  seats: number
}

// ── 이용권 (구매형 참가권 — 적립 재화와 분리) ─────────────────────────────

export interface PassType {
  id: string
  name: string // 예: 1,000P / 10,000P / 하이롤러
  validDays: number // 발급일로부터 유효기간(일)
  color: string
}

export type PassStatus = 'unused' | 'used' | 'revoked'

export interface Pass {
  id: string
  typeId: string
  memberId: string
  issuedAt: number
  expiresAt: number
  status: PassStatus // 만료는 저장하지 않고 unused + 기한 경과로 파생
  usedAt?: number
}

export type PassAction = '발급' | '사용' | '연장' | '회수' | '집계 초기화'

export interface PassLogEntry {
  id: string
  ts: number
  action: PassAction
  typeName?: string
  memberId?: string
  detail?: string
  operator: string
}

export const CURRENCY_LABEL: Record<Currency, string> = { P: '포인트', S: '시드', V: '음료권' }
export const CURRENCY_UNIT: Record<Currency, string> = { P: 'P', S: 'S', V: '장' }
export const BUYIN_TYPE_LABEL: Record<BuyinType, string> = {
  BUYIN: '바인',
  RE_BUYIN: '리바인',
  RE_ENTRY: '리엔트리',
}
