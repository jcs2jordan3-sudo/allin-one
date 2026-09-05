import type {
  AuditEntry, BuyinType, Currency, DateRange, EventPost, Game, GameSet, LedgerEntry, Manager, Member, NoticeSettings, Pass,
  PassLogEntry, PassType, PrizeRule, RpLogEntry, Season, StaffRole, TableInfo, WaitEntry, WaitStatus,
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
  waitlist: WaitEntry[] // 활성(대기·호출·착석) + 최근 종료 항목
  auditLog: AuditEntry[]
  ledgerRange: DateRange // 거래내역 조회 기간 (서버 조회 상한 대응)
  historyRange: DateRange // 게임 기록 조회 기간
  notice: NoticeSettings // 카톡 공지 템플릿
}

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
  saveStoreName: (name: string) => Result
  saveTables: (tables: TableInfo[]) => Result
  saveNotice: (patch: Partial<NoticeSettings>) => Result
  saveEvent: (post: Partial<EventPost> & { title: string; body: string }) => Result
  removeEvent: (id: string) => Result
  // 이용권
  savePassType: (t: PassType) => Result
  removePassType: (id: string) => Result
  issuePasses: (typeId: string, memberId: string, count: number) => Result
  usePass: (passId: string) => Result
  extendPass: (passId: string, days: number) => Result
  revokePass: (passId: string) => Result
  resetBizDay: () => Result
  // 시즌
  closeSeason: () => Result
  settleSeason: (rewards: number[]) => Result
  startSeason: (name: string) => Result
  // 대기자 명단
  addWait: (memberId?: string, guestName?: string, note?: string) => Result
  updateWait: (id: string, status: WaitStatus, table?: number, seat?: number) => Result
  // 조회 기간
  setLedgerRange: (range: DateRange) => Result
  setHistoryRange: (range: DateRange) => Result
}

export type Store = StoreState & Actions

export type SetState = (patch: Partial<StoreState>) => void
export type GetState = () => Store

/** 로컬 모드에서 순수 상태 변환으로 구현되는 액션 (클라우드 모드는 RPC) */
export type LocalOnlyKey =
  | 'savePassType' | 'removePassType' | 'issuePasses' | 'usePass' | 'extendPass' | 'revokePass'
  | 'resetBizDay' | 'closeSeason' | 'startSeason' | 'addWait' | 'updateWait'
