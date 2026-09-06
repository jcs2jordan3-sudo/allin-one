import type { Game, Member, NoticeSettings, RpLogEntry, WaitEntry } from '../types'
import { gameElapsedMs, isScheduled, levelAt } from './time'

// ── 카톡 공지 문구 생성 ─────────────────────────────────────────────────
// 매장 카톡방에 올리는 "오늘의 현황" 공지를 콘솔 데이터로 자동 완성한다.
// 서식은 사장님이 쓰던 형식을 그대로 따른다 (🔥 줄 → : 안내 → 👥 출석 → ===게임 진행 현황=== → 부별 결과).

export const DEFAULT_NOTICE: NoticeSettings = {
  title: '🎮🎪 {요일} {매장명} 🎪🎮',
  dealers: '',
  lines: '오늘의 핸드(5000P): \n전일 랭커 :{전일랭커}',
  notes: '전일 랭커 이벤트: 데일리 무료 OR 하이롤러 할인',
  attendanceTitle: '👥 출석 이벤트 전주 출근:',
  footer: '',
}
export const defaultNotice = (): NoticeSettings => ({ ...DEFAULT_NOTICE })

const DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const MEDALS = ['🥇', '🥈', '🥉']
const BIZ_START_HOUR = 6 // 영업일 경계: 06:00 (자정 넘어 끝나는 부도 같은 날로)

/** 영업일 범위 [from, to) — 06:00 ~ 다음날 06:00 */
export function bizDayRange(now: number): { from: number; to: number } {
  const d = new Date(now)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), BIZ_START_HOUR, 0, 0, 0)
  if (d.getTime() < start.getTime()) start.setDate(start.getDate() - 1)
  return { from: start.getTime(), to: start.getTime() + 24 * 3600_000 }
}

/** 전주(월 06:00 ~ 이번주 월 06:00) 범위 */
export function lastWeekRange(now: number): { from: number; to: number } {
  const { from } = bizDayRange(now)
  const d = new Date(from)
  const back = (d.getDay() + 6) % 7 // 월요일=0
  const thisMon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back, BIZ_START_HOUR)
  return { from: thisMon.getTime() - 7 * 24 * 3600_000, to: thisMon.getTime() }
}

export interface NoticeStats {
  yesterdayTop: string[] // 전일 RP 획득 상위 닉네임 (최대 3)
  attendance: string[] // 전주 출석 닉네임
}

/** 로컬 모드용: 콘솔 상태만으로 통계 계산 (클라우드는 notice_stats RPC) */
export function localNoticeStats(
  s: { rpLog: RpLogEntry[]; waitlist: WaitEntry[]; games: Game[]; members: Pick<Member, 'id' | 'nickname' | 'status'>[] },
  now: number,
): NoticeStats {
  const nick = new Map(s.members.map((m) => [m.id, m.nickname]))
  const y = bizDayRange(now - 24 * 3600_000)
  const gain = new Map<string, number>()
  for (const r of s.rpLog) if (r.ts >= y.from && r.ts < y.to) gain.set(r.memberId, (gain.get(r.memberId) ?? 0) + r.delta)
  const yesterdayTop = [...gain.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id]) => nick.get(id) ?? '회원')
  const w = lastWeekRange(now)
  const ids = new Set<string>()
  for (const e of s.waitlist) {
    if (e.memberId && e.arrivedAt >= w.from && e.arrivedAt < w.to && !['noshow', 'cancelled'].includes(e.status)) ids.add(e.memberId)
  }
  for (const g of s.games) {
    if (g.cancelled || g.startedAt < w.from || g.startedAt >= w.to) continue
    for (const e of g.entries) ids.add(e.memberId)
  }
  const attendance = [...ids].map((id) => nick.get(id)).filter((n): n is string => !!n).sort((a, b) => a.localeCompare(b, 'ko'))
  return { yesterdayTop, attendance }
}

export interface NoticeInput {
  now: number
  storeName: string
  games: Game[] // 전체 — 오늘 영업일 것만 골라 쓴다
  members: Pick<Member, 'id' | 'nickname'>[]
  dealerNames: string[] // 딜러 직원 이름 (설정의 딜러 칸이 비었을 때)
  stats: NoticeStats
  settings: NoticeSettings
  /** 진행 중 게임의 실시간 전광판 링크 (게임 id → URL) — storeLiveUrl이 없을 때만 게임별로 넣는다 */
  liveUrls?: Record<string, string>
  /** 매장 전체 실시간 현황 링크(/live) — 게임이 바뀌어도 같은 주소라 게임별 링크 대신 한 번만 넣는다 */
  storeLiveUrl?: string
}

const levelText = (label: string, type: string) => {
  const n = label.match(/\d+/)?.[0]
  return type === 'break' ? `브레이크${n ? ' ' + n : ''}` : `레벨 ${n ?? label}`
}

export function buildNotice(i: NoticeInput): string {
  const nick = new Map(i.members.map((m) => [m.id, m.nickname]))
  const name = (id: string) => nick.get(id) ?? '회원'
  const d = new Date(i.now)
  const medals = (names: string[]) => names.map((n, k) => `${MEDALS[k] ?? ''}${n}`).join('')
  const fill = (s: string) => s
    .replace(/\{매장명\}/g, i.storeName)
    .replace(/\{요일\}/g, DAYS[d.getDay()])
    .replace(/\{날짜\}/g, `${d.getMonth() + 1}/${d.getDate()}`)
    .replace(/\{전일랭커\}/g, i.stats.yesterdayTop.length ? medals(i.stats.yesterdayTop) : '🥇🥈🥉')
  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

  const out: string[] = []
  out.push(fill(i.settings.title))
  const dealers = i.settings.dealers.trim() || i.dealerNames.join(' ')
  out.push(`🔥 딜러: ${dealers || '-'}`)
  for (const l of lines(i.settings.lines)) out.push(`🔥 ${fill(l)}`)
  for (const l of lines(i.settings.notes)) out.push(`: ${fill(l)}`)
  if (i.settings.attendanceTitle.trim()) {
    out.push(fill(i.settings.attendanceTitle.trim()))
    out.push(i.stats.attendance.length ? i.stats.attendance.join(',') : '(기록 없음)')
  }

  out.push('===게임 진행 현황===')
  const { from, to } = bizDayRange(i.now)
  const todays = i.games
    .filter((g) => !g.cancelled && g.startedAt >= from && g.startedAt < to)
    .sort((a, b) => a.startedAt - b.startedAt)
  if (todays.length === 0) out.push('💘 아직 시작한 게임이 없습니다')
  todays.forEach((g, idx) => {
    if (g.status !== 'ended') out.push('') // 진행·예약 중인 부는 한 줄 띄워 눈에 띄게 (원본 서식과 동일)
    out.push(`💘 ${idx + 1}부 : ${g.name}`)
    if (g.status === 'ended') {
      const top = [...g.entries].filter((e) => e.rank).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).slice(0, 3)
      out.push(`🎮 ${top.length ? medals(top.map((e) => name(e.memberId))) : '결과 없음'}`)
    } else if (isScheduled(g, i.now)) {
      const s = new Date(g.startedAt)
      out.push(`🎮 ${s.getHours()}:${String(s.getMinutes()).padStart(2, '0')} 시작 예정`)
    } else {
      const pos = levelAt(g.snapshot.levels, gameElapsedMs(g, i.now))
      const playing = g.entries.filter((e) => e.status === 'playing').length
      out.push(`🎮 ${levelText(pos.level.label, pos.level.type)}, ${playing}명 진행 중${g.status === 'paused' ? ' (일시정지)' : ''} ❕`)
      const url = i.storeLiveUrl ? undefined : i.liveUrls?.[g.id]
      if (url) out.push(`📡 실시간 현황: ${url}`)
    }
  })
  if (i.storeLiveUrl) out.push(`📡 실시간 현황: ${i.storeLiveUrl}`)
  out.push('=====================')
  for (const l of lines(i.settings.footer)) out.push(fill(l))
  return out.join('\n')
}
