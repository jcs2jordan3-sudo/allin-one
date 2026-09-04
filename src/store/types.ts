import type {
  BuyinType, Currency, EventPost, Game, GameSet, LedgerEntry, Manager, Member, Pass, PassLogEntry,
  PassType, PrizeRule, RpLogEntry, Season, StaffRole, TableInfo,
} from '../types'

/** 콘솔이 보는 상태 — 로컬 모드/클라우드 모드 모두 동일한 모양 */
export interface StoreState {
  storeId: string | null // 클라우드 모드에서만 값이 있음
  storeName: string
  operatorName: string
  lockPin: string | null // 로컬 모드 전용 간편 잠금
  passTypes: PassType[]
  passes: Pass[]
  passLog: PassLogEntry[]
  bizResetAt: number
  rpLog: RpLogEntry[]
  wallet: Record<Currency, number>
  members: Member[]
  managers: Manager[]
  gameSets: GameSet[]
  games: Game[]
  ledger: LedgerEntry[]
  events: EventPost[]
  seasons: Season[]
  tables: TableInfo[]
  waitingCount: number
}

/** 클라우드 모드에서 console_state jsonb 한 행에 저장되는 콘솔 전용 키 (단일 작성자) */
export const CONSOLE_KEYS = ['passTypes', 'passes', 'passLog', 'bizResetAt', 'rpLog', 'seasons', 'waitingCount'] as const
export type ConsoleKey = (typeof CONSOLE_KEYS)[number]
export type ConsoleState = Pick<StoreState, ConsoleKey>

/** 액션 결과: 오류 메시지(문자열) 또는 null(성공) */
export type Result = Promise<string | null>

export interface Actions {
  // 재화
  transferToMember: (memberId: string, c: Currency, amount: number, reason?: string, gameId?: string) => Result
  reclaimFromMember: (memberId: string, c: Currency, amount: number, reason: string) => Result
  issueToStore: (c: Currency, amount: number, reason: string) => Result
  // 회원
  addMember: (nickname: string, emoji: string, color: string, phone?: string) => Result
  updateMember: (id: string, patch: Partial<Member>) => Result
  leaveMember: (id: string) => Result
  adjustRp: (memberId: string, delta: number, reason: string) => Result
  // 직원(매니저)
  addManager: (loginId: string, name: string, role?: StaffRole) => Result
  updateManager: (id: string, patch: Partial<Manager>) => Result
  removeManager: (id: string) => Result
  // 게임 셋
  saveGameSet: (set: GameSet) => Result
  duplicateGameSet: (id: string) => Result
  removeGameSet: (id: string) => Result
  // 게임
  createGame: (name: string, gameSetId: string, tables: number[], opts?: { startAt?: number; notice?: string }) => Result
  cancelGame: (id: string) => Result
  pauseGame: (id: string) => Result
  resumeGame: (id: string) => Result
  closeReg: (id: string) => Result
  adjustToLevel: (id: string, levelIdx: number) => Result
  updateGame: (id: string, patch: { name?: string; notice?: string; prizes?: PrizeRule[] }) => Result
  adjustChips: (id: string, kind: 'correction' | 'addon', chips: number) => Result
  joinGame: (gameId: string, memberId: string, type: BuyinType, currency: Currency) => Result
  eliminate: (gameId: string, memberId: string) => Result
  moveSeat: (gameId: string, memberId: string, table: number, seat: number) => Result
  endGame: (gameId: string, ranking?: string[]) => Result
  // 관리
  resetData: (mode: 'empty' | 'demo') => Result
  setLockPin: (pin: string | null) => Result
  saveTables: (tables: TableInfo[]) => Result
  saveEvent: (post: Partial<EventPost> & { title: string; body: string }) => Result
  removeEvent: (id: string) => Result
  settleSeason: (rewards: number[]) => Result
  // 콘솔 전용 (이용권·시즌·대기자)
  savePassType: (t: PassType) => Result
  removePassType: (id: string) => Result
  issuePasses: (typeId: string, memberId: string, count: number) => Result
  usePass: (passId: string) => Result
  extendPass: (passId: string, days: number) => Result
  revokePass: (passId: string) => Result
  resetBizDay: () => Result
  setWaiting: (n: number) => Result
  closeSeason: () => Result
  startSeason: (name: string) => Result
}

export type Store = StoreState & Actions

export type SetState = (patch: Partial<StoreState>) => void
export type GetState = () => Store

export type ConsoleActionKey =
  | 'savePassType' | 'removePassType' | 'issuePasses' | 'usePass' | 'extendPass' | 'revokePass'
  | 'resetBizDay' | 'setWaiting' | 'closeSeason' | 'startSeason'
