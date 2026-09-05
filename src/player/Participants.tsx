import type { Entry } from '../types'
import Avatar from '../components/Avatar'
import { Badge } from '../components/ui'
import type { RosterMember } from './api'

/** 참가자 표시용 — 회원 명단(members_public)에서 닉네임·아바타를 찾는다. 명단에 없으면(탈퇴 등) 익명 처리 */
export type RosterMap = Map<string, RosterMember>
export const toRosterMap = (list: RosterMember[]): RosterMap => new Map(list.map((m) => [m.id, m]))
const UNKNOWN: Omit<RosterMember, 'id'> = { no: '', nickname: '회원', emoji: '👤', color: '#64707f', rp: 0 }
export const lookup = (roster: RosterMap, id: string) => roster.get(id) ?? { id, ...UNKNOWN }

/** 게임 목록용 한 줄 미리보기: 참여 중 아바타 몇 개 + 이름, 내 자리 표시 */
export function ParticipantPreview({ entries, roster, myId, max = 5 }: { entries: Entry[]; roster: RosterMap; myId?: string; max?: number }) {
  const playing = entries.filter((e) => e.status === 'playing')
  if (playing.length === 0) return <div className="text-[14px] text-faint">아직 참가자가 없어요</div>
  const shown = playing.slice(0, max).map((e) => lookup(roster, e.memberId))
  const rest = playing.length - shown.length
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex -space-x-1.5 shrink-0">
        {shown.map((m) => (
          <span key={m.id} className={`rounded-full ring-2 ${m.id === myId ? 'ring-mint' : 'ring-bg'}`}>
            <Avatar emoji={m.emoji} color={m.color} size={24} />
          </span>
        ))}
      </div>
      <div className="text-[14px] text-mut truncate">
        {shown.map((m) => (m.id === myId ? '나' : m.nickname)).join(', ')}
        {rest > 0 && <span className="text-faint"> 외 {rest}명</span>}
      </div>
    </div>
  )
}

/** 게임 상세용 전체 목록: 테이블별 → 좌석순. 탈락자는 순위와 함께 아래에 */
export function ParticipantList({ entries, roster, myId }: { entries: Entry[]; roster: RosterMap; myId?: string }) {
  const playing = entries.filter((e) => e.status === 'playing')
  const out = entries.filter((e) => e.status !== 'playing').sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
  const tables = [...new Set(playing.map((e) => e.table))].sort((a, b) => a - b)
  if (entries.length === 0) return <div className="text-sm text-mut text-center py-3">아직 참가자가 없어요. 첫 번째로 바인해 보세요!</div>
  return (
    <div className="space-y-3">
      {tables.map((t) => (
        <div key={t}>
          <div className="text-[13px] font-bold tracking-widest text-faint mb-1.5">TABLE {t}</div>
          <div className="grid grid-cols-1 gap-1">
            {playing.filter((e) => e.table === t).sort((a, b) => a.seat - b.seat).map((e) => {
              const m = lookup(roster, e.memberId)
              const mine = m.id === myId
              return (
                <div key={e.memberId} className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${mine ? 'border-mint/50 bg-mint/8' : 'border-line bg-surface2/40'}`}>
                  <span className="text-[13px] text-faint num w-6 shrink-0">{e.seat}번</span>
                  <Avatar emoji={m.emoji} color={m.color} size={28} />
                  <span className={`font-semibold truncate ${mine ? 'text-mint' : ''}`}>{m.nickname}{mine && ' (나)'}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {out.length > 0 && (
        <div>
          <div className="text-[13px] font-bold tracking-widest text-faint mb-1.5">탈락</div>
          <div className="flex flex-wrap gap-1.5">
            {out.map((e) => {
              const m = lookup(roster, e.memberId)
              return (
                <span key={e.memberId} className="inline-flex items-center gap-1.5 text-[14px] text-mut bg-surface2/40 border border-line rounded-full pl-1 pr-2.5 py-0.5">
                  <Avatar emoji={m.emoji} color={m.color} size={20} />
                  {m.nickname}
                  {e.rank && <Badge tone="mut">{e.rank}위</Badge>}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
