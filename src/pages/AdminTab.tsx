import { useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useSession, useStore } from '../store'
import type { AuditEntry, Manager, Member, StaffRole } from '../types'
import { STAFF_ROLE_LABEL } from '../types'
import { hasSupabase } from '../lib/supabase'
import { fmtDateTime, fmtNum } from '../lib/format'
import { Badge, Btn, Card, Empty, Field, Input, Modal, Pager, SectionTitle, Select } from '../components/ui'
import Avatar from '../components/Avatar'
import { SignupQrModal } from '../components/SignupQr'
import PasswordChange from '../components/PasswordChange'
import { useAuth } from '../auth'
import { withCompetitionRanks } from './RankingTab'

type SortKey = 'joined' | 'nickname' | 'P' | 'S' | 'V'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'joined', label: '최근 가입 순' },
  { key: 'nickname', label: '닉네임 순' },
  { key: 'P', label: '포인트 순' },
  { key: 'S', label: '시드 순' },
  { key: 'V', label: '음료권 순' },
]

const EMOJIS = ['😎', '🦈', '🎭', '🐯', '🐳', '🔥', '🃏', '🎩', '👑', '🍀', '⚡', '🌙']
const COLORS = ['#E9BB56', '#57B6F2', '#A98BF5', '#F2A65A', '#4FD1C5', '#F26D76', '#7BC96F', '#D48FD4']

export default function AdminTab() {
  const st = useStore()
  const [managerModal, setManagerModal] = useState<Manager | 'new' | null>(null)
  const [confirmDelMgr, setConfirmDelMgr] = useState<Manager | null>(null)
  const [memberModal, setMemberModal] = useState<Member | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('joined')

  const members = useMemo(() => {
    let list = st.members.filter((m) => m.status === 'active')
    if (q) list = list.filter((m) => m.nickname.includes(q) || m.no.includes(q))
    const sorted = [...list]
    switch (sort) {
      case 'joined': sorted.sort((a, b) => b.joinedAt - a.joinedAt); break
      case 'nickname': sorted.sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko')); break
      case 'P': sorted.sort((a, b) => b.balances.P - a.balances.P); break
      case 'S': sorted.sort((a, b) => b.balances.S - a.balances.S); break
      case 'V': sorted.sort((a, b) => b.balances.V - a.balances.V); break
    }
    return sorted
  }, [st.members, q, sort])

  return (
    <div className="space-y-8">
      {/* 직원(매니저) 계정 */}
      <section>
        <SectionTitle right={<Btn sm variant="gold" onClick={() => setManagerModal('new')}>{hasSupabase ? '직원 초대' : '생성하기'}</Btn>}>
          {hasSupabase ? '직원 계정' : '매니저 계정'}
        </SectionTitle>
        {hasSupabase && (
          <p className="text-[13px] text-mut mb-3 leading-relaxed">
            이메일과 역할을 등록하면 초대 상태가 됩니다. 해당 이메일로 콘솔에서 가입하면 자동으로 연결됩니다.
            역할: 대표(직원 관리·데이터 초기화 포함 전체) · 매니저·딜러(게임 운영·재화 전송·환수·회원 관리). 모든 처리는 작업 이력에 남습니다.
          </p>
        )}
        {st.managers.length === 0 ? (
          <Empty>등록된 직원이 없습니다.</Empty>
        ) : (
          <div className="space-y-2">
            {st.managers.map((m) => (
              <Card key={m.id} className="px-5 py-3.5 flex items-center gap-3 flex-wrap">
                <span className="font-bold">{m.name}</span>
                <span className="text-[14px] text-mut">({m.loginId})</span>
                {m.role && <Badge tone={m.role === 'owner' ? 'gold' : m.role === 'manager' ? 'mint' : 'sky'}>{STAFF_ROLE_LABEL[m.role]}</Badge>}
                {hasSupabase && (m.linked ? <Badge tone="mut">로그인 연결됨</Badge> : <Badge tone="rose">초대 대기</Badge>)}
                <div className="ml-auto flex gap-2">
                  <Btn sm onClick={() => setManagerModal(m)}>변경</Btn>
                  <Btn sm variant="danger" onClick={() => setConfirmDelMgr(m)} disabled={m.role === 'owner' && st.managers.filter((x) => x.role === 'owner').length <= 1}>삭제</Btn>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 일반 회원 */}
      <section>
        <SectionTitle
          right={
            <div className="flex items-center gap-2">
              <div className="w-56 max-w-full">
                <Input placeholder="닉네임 혹은 번호를 입력해보세요" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Btn sm onClick={() => setQrOpen(true)}>가입 QR</Btn>
              <Btn sm variant="primary" onClick={() => setAddOpen(true)}>+ 회원 등록</Btn>
            </div>
          }
        >
          일반 회원 <span className="text-mint">{members.length}명</span>
        </SectionTitle>

        <div className="flex flex-wrap gap-2 mb-4">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`px-3.5 py-1.5 rounded-full border text-[14px] font-semibold transition-colors ${
                sort === s.key ? 'border-gold/60 bg-gold/10 text-gold' : 'border-line2 text-mut hover:text-ink'
              }`}
            >
              {s.label}{sort === s.key && s.key === 'joined' ? ' ↓' : ''}
            </button>
          ))}
        </div>

        {members.length === 0 ? (
          <Empty>조건에 맞는 회원이 없습니다.</Empty>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-[13px] text-mut border-b border-line">
                  <th className="px-4 py-3 font-semibold">닉네임</th>
                  <th className="px-4 py-3 font-semibold text-right">포인트</th>
                  <th className="px-4 py-3 font-semibold text-right">시드</th>
                  <th className="px-4 py-3 font-semibold text-right">음료권</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => setMemberModal(m)}
                    className="border-b border-line/60 last:border-0 hover:bg-surface2/50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar emoji={m.emoji} color={m.color} size={30} />
                        <span className="font-semibold">{m.nickname}</span>
                        <span className="text-[13px] text-mut num">({m.no})</span>
                        {hasSupabase && m.linked && <span title="앱 계정 연결됨" className="text-[11px] text-mint border border-mint/30 rounded-full px-1.5">앱</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right num text-gold">{fmtNum(m.balances.P)}</td>
                    <td className="px-4 py-3 text-right num text-sky">{fmtNum(m.balances.S)}</td>
                    <td className="px-4 py-3 text-right num text-viol">{m.balances.V}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* 매장 설정 */}
      <StoreSection />

      {/* 내 계정 — 클라우드 모드: 비밀번호 변경 */}
      {hasSupabase && <AccountSection />}

      {/* 잠금 설정 — 로컬 모드 전용 (클라우드 모드는 계정 로그인이 대신함) */}
      {!hasSupabase && <LockSection />}

      {/* 데이터 관리 */}
      <DataSection />

      {/* 작업 이력 (감사 로그) */}
      <AuditSection />

      {managerModal && <ManagerModal manager={managerModal === 'new' ? null : managerModal} onClose={() => setManagerModal(null)} />}
      {confirmDelMgr && (
        <Modal open onClose={() => setConfirmDelMgr(null)} title="직원 삭제">
          <p className="text-sm text-mut leading-relaxed">
            <b className="text-ink">{confirmDelMgr.name}</b> ({confirmDelMgr.loginId}) 계정을 삭제할까요?
            <br />해당 계정은 즉시 콘솔에 접근할 수 없게 됩니다.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Btn variant="ghost" onClick={() => setConfirmDelMgr(null)}>취소</Btn>
            <Btn variant="danger" onClick={() => { st.removeManager(confirmDelMgr.id); setConfirmDelMgr(null) }}>삭제</Btn>
          </div>
        </Modal>
      )}
      {memberModal && <MemberDetailModal member={memberModal} onClose={() => setMemberModal(null)} />}
      {addOpen && <AddMemberModal onClose={() => setAddOpen(false)} />}
      <SignupQrModal open={qrOpen} onClose={() => setQrOpen(false)} />
    </div>
  )
}

// ── 작업 이력 (감사 로그) ────────────────────────────────────────────────

const AUDIT_ACTION: Record<string, string> = {
  'members.insert': '회원 등록', 'members.update': '회원 정보 수정', 'members.delete': '회원 삭제', 'members.leave': '회원 탈퇴',
  'staff.insert': '직원 초대', 'staff.update': '직원 변경', 'staff.delete': '직원 삭제',
  'stores.update': '매장 설정 변경', 'store.reset': '데이터 초기화',
  'game_sets.insert': '게임 셋 추가', 'game_sets.update': '게임 셋 수정', 'game_sets.delete': '게임 셋 삭제',
  'games.insert': '게임 생성', 'games.update': '게임 변경', 'games.delete': '게임 삭제',
  'pass_types.insert': '이용권 유형 추가', 'pass_types.update': '이용권 유형 수정', 'pass_types.delete': '이용권 유형 삭제',
  'passes.insert': '이용권 발급', 'passes.update': '이용권 변경',
  'seasons.insert': '시즌 시작', 'seasons.update': '시즌 변경', 'seasons.delete': '시즌 삭제',
  'events.insert': '공지 등록', 'events.update': '공지 수정', 'events.delete': '공지 삭제',
  'waitlist.insert': '대기 등록', 'waitlist.update': '대기 상태 변경',
}
const AUDIT_COL: Record<string, string> = {
  nickname: '닉네임', phone: '전화번호', real_name: '실명', memo: '메모', emoji: '아바타', color: '컬러', rp: 'RP', status: '상태',
  name: '이름', email: '이메일', role: '역할', user_id: '계정 연결', tables: '테이블', biz_reset_at: '영업일 기준',
  reg_closed_manual: '레지 마감', notice: '공지', snapshot: '설정', cancelled: '취소', ended_at: '종료 시각',
  valid_days: '유효기간', archived: '보관', expires_at: '만료일', used_at: '사용 시각', results: '결과',
  title: '제목', body: '내용', table_no: '테이블', seat: '좌석', called_at: '호출', seated_at: '착석',
}
const AUDIT_FILTERS: { key: string; label: string }[] = [
  { key: '', label: '전체' }, { key: 'members', label: '회원' }, { key: 'staff', label: '직원' },
  { key: 'games', label: '게임' }, { key: 'game_sets', label: '게임 셋' }, { key: 'pass', label: '이용권' },
  { key: 'stores', label: '매장' }, { key: 'waitlist', label: '대기' },
]

function auditDetail(a: AuditEntry): string {
  const d = a.detail
  if (!d) return ''
  const f = (x: unknown) => (x == null || x === '' ? '—' : typeof x === 'object' ? '(변경)' : String(x))
  if (a.action.endsWith('.update')) {
    return Object.entries(d)
      .map(([k, v]) => {
        const [o, n] = Array.isArray(v) ? (v as unknown[]) : [undefined, v]
        return `${AUDIT_COL[k] ?? k}: ${f(o)} → ${f(n)}`
      })
      .join(' · ')
  }
  const pick = ['nickname', 'name', 'email', 'role', 'title', 'no', 'mode', 'guest_name', 'status']
  return pick.filter((k) => d[k] != null && d[k] !== '').map((k) => `${AUDIT_COL[k] ?? k}: ${String(d[k])}`).join(' · ')
}

function AuditSection() {
  const auditLog = useStore((s) => s.auditLog)
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const PAGE = 12
  const rows = useMemo(() => auditLog.filter((a) => !filter || a.action.startsWith(filter)), [auditLog, filter])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE)

  return (
    <section>
      <SectionTitle>작업 이력 <span className="text-[13px] text-mut font-normal ml-1">재화 이동은 포인트 내역에 기록</span></SectionTitle>
      <div className="flex flex-wrap gap-2 mb-3">
        {AUDIT_FILTERS.map((fl) => (
          <button
            key={fl.key}
            onClick={() => { setFilter(fl.key); setPage(1) }}
            className={`px-3 py-1 rounded-full border text-[13px] font-semibold transition-colors ${
              filter === fl.key ? 'border-mint/60 bg-mint/10 text-mint' : 'border-line2 text-mut hover:text-ink'
            }`}
          >
            {fl.label}
          </button>
        ))}
      </div>
      {pageRows.length === 0 ? (
        <Empty>{hasSupabase ? '기록된 작업이 없습니다.' : '작업 이력은 클라우드 모드에서 서버가 자동으로 기록합니다.'}</Empty>
      ) : (
        <Card className="divide-y divide-line/60">
          {pageRows.map((a) => (
            <div key={a.id} className="px-4 py-2.5 text-[14px] flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="text-faint num text-[13px] w-32 shrink-0">{fmtDateTime(a.ts)}</span>
              <span className="font-semibold w-20 shrink-0 truncate">{a.actor}</span>
              <Badge tone={a.action === 'store.reset' || a.action.endsWith('.delete') || a.action.endsWith('.leave') ? 'rose' : 'mut'}>
                {AUDIT_ACTION[a.action] ?? a.action}
              </Badge>
              <span className="text-mut min-w-0 truncate flex-1">{auditDetail(a)}</span>
            </div>
          ))}
        </Card>
      )}
      <Pager page={page} pages={pages} onPage={setPage} />
    </section>
  )
}

// ── 매장 설정 ─────────────────────────────────────────────────────────────

function StoreSection() {
  const storeName = useStore((s) => s.storeName)
  const saveStoreName = useStore((s) => s.saveStoreName)
  const [name, setName] = useState(storeName)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const save = async () => {
    const err = await saveStoreName(name)
    setMsg(err ? { ok: false, text: err } : { ok: true, text: '매장 이름이 저장되었습니다. 전광판·가입 페이지에도 반영됩니다.' })
  }

  return (
    <section>
      <SectionTitle>매장 설정</SectionTitle>
      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 max-w-full">
            <Field label="매장 이름">
              <Input value={name} onChange={(e) => { setName(e.target.value); setMsg(null) }} placeholder="예: 강남 1호점" />
            </Field>
          </div>
          <Btn variant="primary" onClick={save} disabled={!name.trim() || name.trim() === storeName}>저장</Btn>
        </div>
        {msg && <div className={`text-[14px] mt-3 ${msg.ok ? 'text-mint' : 'text-rose'}`}>{msg.text}</div>}
      </Card>
    </section>
  )
}

// ── 내 계정 (클라우드 모드) ────────────────────────────────────────────────

function AccountSection() {
  const role = useAuth((s) => s.role)
  const email = role.kind === 'staff' ? role.email : ''
  return (
    <section>
      <SectionTitle>내 계정</SectionTitle>
      <Card className="p-5">
        <p className="text-[14px] text-mut mb-4">
          로그인 이메일 <span className="text-ink font-semibold">{email}</span>
          {role.kind === 'staff' && <> · 역할 <Badge tone={role.role === 'owner' ? 'gold' : 'mint'}>{STAFF_ROLE_LABEL[role.role]}</Badge></>}
        </p>
        <PasswordChange />
      </Card>
    </section>
  )
}

// ── 잠금 설정 ─────────────────────────────────────────────────────────────

function LockSection() {
  const lockPin = useStore((s) => s.lockPin)
  const setLockPin = useStore((s) => s.setLockPin)
  const lock = useSession((s) => s.lock)
  const unlock = useSession((s) => s.unlock)
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const save = () => {
    if (!/^\d{4,8}$/.test(pin)) return setMsg('PIN은 숫자 4~8자리로 입력해주세요.')
    setLockPin(pin)
    unlock() // 설정한 본인의 현재 세션은 인증된 것으로 처리 (설정 즉시 잠김 방지)
    setPin('')
    setMsg('PIN이 설정되었습니다. 상단 "잠금" 버튼을 누르면 잠깁니다.')
  }

  return (
    <section>
      <SectionTitle>잠금 설정</SectionTitle>
      <Card className="p-5">
        <p className="text-[14px] text-mut leading-relaxed mb-4">
          매장 공용 PC 보호용 간편 잠금입니다. PIN을 설정하면 로그아웃 시 잠금 화면이 표시됩니다.
          {lockPin ? ' 현재 상태: ' : ' 현재 상태: 잠금 없음'}
          {lockPin && <Badge tone="mint">PIN 설정됨</Badge>}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Field label={lockPin ? '새 PIN (변경)' : 'PIN (숫자 4~8자리)'}>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
              />
            </Field>
          </div>
          <Btn variant="primary" onClick={save}>{lockPin ? 'PIN 변경' : 'PIN 설정'}</Btn>
          {lockPin && (
            <>
              <Btn onClick={() => { lock() }}>지금 잠그기</Btn>
              <Btn variant="danger" onClick={() => { setLockPin(null); setMsg('잠금이 해제(삭제)되었습니다.') }}>잠금 해제</Btn>
            </>
          )}
        </div>
        {msg && <div className="text-[14px] text-mint mt-3">{msg}</div>}
      </Card>
    </section>
  )
}

// ── 데이터 관리 ───────────────────────────────────────────────────────────

function DataSection() {
  const resetData = useStore((s) => s.resetData)
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState<'empty' | 'demo' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const backup = () => {
    const state = useStore.getState()
    const json = JSON.stringify({ app: 'allinone', version: 2, exportedAt: new Date().toISOString(), state }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const d = new Date()
    a.download = `allinone-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMsg('백업 파일이 다운로드되었습니다.')
  }

  const restore = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text())
      const state = parsed?.state ?? parsed
      if (!Array.isArray(state?.members) || !state?.wallet) {
        setMsg('올바른 백업 파일이 아닙니다.')
        return
      }
      useStore.setState(state)
      setMsg('복원이 완료되었습니다.')
    } catch {
      setMsg('백업 파일을 읽지 못했습니다.')
    }
  }

  const runReset = async (mode: 'empty' | 'demo') => {
    const err = await resetData(mode)
    setConfirm(null)
    setMsg(err ?? '초기화가 완료되었습니다.')
  }

  return (
    <section>
      <SectionTitle>데이터 관리</SectionTitle>
      <Card className="p-5">
        <div className="flex flex-wrap gap-2">
          <Btn onClick={backup}>백업 다운로드</Btn>
          {!hasSupabase && <Btn onClick={() => fileRef.current?.click()}>백업 복원</Btn>}
          <Btn variant="danger" onClick={() => setConfirm('empty')}>빈 상태로 시작</Btn>
          <Btn variant="danger" onClick={() => setConfirm('demo')}>데모 데이터로 초기화</Btn>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) restore(f)
              e.target.value = ''
            }}
          />
        </div>
        <p className="text-[13px] text-mut mt-3 leading-relaxed">
          {hasSupabase
            ? '데이터는 Supabase에 저장되며 모든 기기가 같은 데이터를 봅니다. 초기화는 대표(owner) 계정만 실행할 수 있고, 앱으로 가입한 회원 정보도 함께 삭제됩니다.'
            : '데이터는 이 브라우저에 저장됩니다. 실사용 전 주기적으로 백업을 내려받아 두세요.'}
          {' '}"빈 상태로 시작"은 게임 셋·이용권 유형·테이블·직원 구조만 남기고 회원·게임·원장을 모두 비웁니다.
        </p>
        {msg && <div className="text-[14px] text-mint mt-2">{msg}</div>}
      </Card>

      {confirm && (
        <Modal open onClose={() => setConfirm(null)} title={confirm === 'empty' ? '빈 상태로 시작' : '데모 데이터로 초기화'}>
          <p className="text-sm text-mut leading-relaxed">
            {confirm === 'empty'
              ? '회원·게임·원장·이용권 데이터가 모두 삭제되고 실영업 시작 상태가 됩니다.'
              : '현재 데이터가 모두 삭제되고 데모 시드 데이터로 되돌아갑니다.'}
            <br />되돌릴 수 없습니다. 계속하기 전에 백업을 권장합니다.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Btn variant="ghost" onClick={() => setConfirm(null)}>취소</Btn>
            <Btn variant="danger" onClick={() => runReset(confirm)}>실행</Btn>
          </div>
        </Modal>
      )}
    </section>
  )
}

function ManagerModal({ manager, onClose }: { manager: Manager | null; onClose: () => void }) {
  const addManager = useStore((s) => s.addManager)
  const updateManager = useStore((s) => s.updateManager)
  const [loginId, setLoginId] = useState(manager?.loginId ?? '')
  const [name, setName] = useState(manager?.name ?? '')
  const [role, setRole] = useState<StaffRole>(manager?.role ?? 'manager')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!loginId.trim() || !name.trim()) return setError(hasSupabase ? '이메일과 이름을 모두 입력해주세요.' : '아이디와 이름을 모두 입력해주세요.')
    if (hasSupabase && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId.trim())) return setError('올바른 이메일 주소를 입력해주세요.')
    setBusy(true)
    const err = manager
      ? await updateManager(manager.id, { loginId: loginId.trim(), name: name.trim(), role })
      : await addManager(loginId.trim(), name.trim(), role)
    setBusy(false)
    if (err) return setError(err)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={manager ? '직원 변경' : hasSupabase ? '직원 초대' : '매니저 생성'}>
      <div className="space-y-4">
        <Field label={hasSupabase ? '로그인 이메일' : '로그인 아이디'}>
          <Input
            type={hasSupabase ? 'email' : 'text'}
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder={hasSupabase ? 'staff@example.com' : '예: manager2'}
            disabled={!!manager?.linked}
          />
        </Field>
        <Field label="이름">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 매니저2" />
        </Field>
        <Field label="역할">
          <Select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            <option value="owner">대표 — 전체 권한 (직원 관리·초기화)</option>
            <option value="manager">매니저 — 게임 운영 + 재화 전송·환수 + 회원 관리</option>
            <option value="dealer">딜러 — 매니저와 동일 권한 (호칭 구분용)</option>
          </Select>
        </Field>
        {hasSupabase && !manager && (
          <p className="text-[13px] text-mut leading-relaxed">
            저장하면 초대 상태가 됩니다. 이 이메일로 콘솔 로그인 화면의 "초대받은 직원이에요 → 가입"에서 가입하면 바로 연결됩니다.
          </p>
        )}
        {error && <div className="text-sm text-rose">{error}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" onClick={submit} disabled={busy}>{busy ? '저장 중…' : '저장'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

function AddMemberModal({ onClose }: { onClose: () => void }) {
  const addMember = useStore((s) => s.addMember)
  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  const [color, setColor] = useState(COLORS[0])
  const [error, setError] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!nickname.trim()) return setError('닉네임을 입력해주세요.')
    setBusy(true)
    const err = await addMember(nickname.trim(), emoji, color, phone.trim() || undefined)
    setBusy(false)
    if (err) return setError(err)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="회원 등록">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="닉네임">
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="닉네임" />
          </Field>
          <Field label="전화번호 (선택)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" />
          </Field>
        </div>
        <Field label="아바타">
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`w-9 h-9 rounded-xl border text-lg ${emoji === e ? 'border-mint/70 bg-mint/10' : 'border-line2'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="컬러">
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`컬러 ${c}`}
                className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        {error && <div className="text-sm text-rose">{error}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" onClick={submit} disabled={busy}>{busy ? '등록 중…' : '등록'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ── 회원 상세 (우측 드로어, 탭 3개: 회원 정보 / 포인트 내역 / 메모) ────────

const DETAIL_TABS = ['회원 정보', '포인트 내역', '메모'] as const
type DetailTab = (typeof DETAIL_TABS)[number]

function MemberDetailModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const st = useStore()
  const live = st.members.find((m) => m.id === member.id) ?? member
  const [tab, setTab] = useState<DetailTab>('회원 정보')

  return (
    <Modal open onClose={onClose} title="회원 상세" side>
      <div className="flex gap-1 border-b border-line mb-5 -mt-1">
        {DETAIL_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-mint text-ink' : 'border-transparent text-mut hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === '회원 정보' && <MemberInfoTab live={live} onClose={onClose} />}
      {tab === '포인트 내역' && <MemberLedgerTab live={live} />}
      {tab === '메모' && <MemberMemoTab live={live} />}
    </Modal>
  )
}

function MemberInfoTab({ live, onClose }: { live: Member; onClose: () => void }) {
  const st = useStore()
  const [editOpen, setEditOpen] = useState(false)
  const [rpMode, setRpMode] = useState<'give' | 'take' | null>(null)
  const [transferMode, setTransferMode] = useState<'send' | 'reclaim' | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const gameCount = st.games.filter((g) => g.entries.some((e) => e.memberId === live.id)).length
  const wins = st.games.filter((g) => g.entries.some((e) => e.memberId === live.id && e.rank === 1)).length
  const nowTs = Date.now()
  const myPasses = st.passes.filter((p) => p.memberId === live.id)
  const passUnused = myPasses.filter((p) => p.status === 'unused' && nowTs <= p.expiresAt).length
  const passExpired = myPasses.filter((p) => p.status === 'unused' && nowTs > p.expiresAt).length

  const season = st.seasons.find((s) => s.status === 'open' || s.status === 'closed')
  const ranked = withCompetitionRanks(
    [...st.members].filter((m) => m.status === 'active').sort((a, b) => b.rp - a.rp),
  )
  const myRank = ranked.find((r) => r.item.id === live.id)?.rank
  const myRpLog = (st.rpLog ?? []).filter((l) => l.memberId === live.id).slice(0, 3)

  return (
    <div className="space-y-6">
      {/* 프로필 */}
      <div className="flex items-start gap-4">
        <Avatar emoji={live.emoji} color={live.color} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg truncate">{live.nickname}</span>
            <button
              onClick={() => setEditOpen(true)}
              className="text-mut hover:text-mint text-sm px-1"
              aria-label="프로필 수정"
              title="프로필 수정"
            >
              ✎
            </button>
          </div>
          <div className="text-[14px] text-mut num">{fmtDateTime(live.joinedAt)} 가입</div>
        </div>
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex gap-6"><dt className="text-mut w-16 shrink-0">이름</dt><dd className="font-semibold">{live.realName || '—'}</dd></div>
        <div className="flex gap-6"><dt className="text-mut w-16 shrink-0">회원번호</dt><dd className="font-semibold num">{live.no}</dd></div>
        <div className="flex gap-6"><dt className="text-mut w-16 shrink-0">전화번호</dt><dd className="font-semibold num">{live.phone || '—'}</dd></div>
      </dl>

      {/* 랭킹 */}
      <section className="border-t border-line pt-4">
        <h4 className="text-[14px] font-bold mb-2.5 flex items-center gap-1.5">🏅 랭킹</h4>
        <div className="flex items-baseline gap-2 flex-wrap text-sm">
          <span className="text-mut">{season?.name ?? '시즌'}</span>
          <span className="font-bold text-lg num">{myRank ? `${myRank}위` : '—'}</span>
          <span className="text-mut">·</span>
          <span className="font-bold num text-mint">RP {fmtNum(live.rp)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Btn sm onClick={() => setRpMode('give')}>RP 전송하기</Btn>
          <Btn sm onClick={() => setRpMode('take')}>RP 환수하기</Btn>
        </div>
        {myRpLog.length > 0 && (
          <div className="mt-3 space-y-1">
            {myRpLog.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-[13px] px-2.5 py-1.5 bg-surface2/50 rounded-lg">
                <span className={`font-semibold num ${l.delta > 0 ? 'text-mint' : 'text-rose'}`}>
                  {l.delta > 0 ? '+' : ''}{fmtNum(l.delta)}RP
                </span>
                <span className="text-mut truncate">{l.reason}</span>
                <span className="ml-auto text-faint num shrink-0">{fmtDateTime(l.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 보유 포인트 */}
      <section className="border-t border-line pt-4">
        <h4 className="text-[14px] font-bold mb-2.5 flex items-center gap-1.5">🪙 보유 포인트</h4>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-mut">포인트</dt><dd className="font-bold num text-gold">{fmtNum(live.balances.P)}P</dd></div>
          <div className="flex justify-between"><dt className="text-mut">시드</dt><dd className="font-bold num text-sky">{fmtNum(live.balances.S)}S</dd></div>
          <div className="flex justify-between"><dt className="text-mut">음료권</dt><dd className="font-bold num text-viol">{live.balances.V}장</dd></div>
          <div className="flex justify-between">
            <dt className="text-mut">이용권</dt>
            <dd className="num">미사용 {passUnused}장{passExpired > 0 && <span className="text-rose"> · 만료 {passExpired}장</span>}</dd>
          </div>
        </dl>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Btn sm variant="primary" onClick={() => setTransferMode('send')}>전송하기</Btn>
          <Btn sm onClick={() => setTransferMode('reclaim')}>환수하기</Btn>
        </div>
      </section>

      {/* 전적 · QR */}
      <section className="border-t border-line pt-4 flex items-start justify-between gap-4">
        <dl className="space-y-2 text-sm flex-1">
          <div className="flex justify-between"><dt className="text-mut">게임 참가</dt><dd className="num">{gameCount}회</dd></div>
          <div className="flex justify-between"><dt className="text-mut">우승</dt><dd className="num text-gold">{wins}회</dd></div>
        </dl>
        <div className="text-center">
          <div className="bg-white p-2 rounded-xl w-fit">
            <QRCodeSVG value={`member:${live.no}`} size={84} />
          </div>
          <div className="text-[12px] text-mut mt-1">개인 QR</div>
        </div>
      </section>

      <div className="border-t border-line pt-4 flex justify-end">
        {confirmLeave ? (
          <div className="flex items-center gap-2 text-[14px] flex-wrap justify-end">
            <span className="text-rose">잔액 전액 환수 · 전화번호·실명 삭제 · 닉네임 익명화 (되돌릴 수 없음)</span>
            <Btn sm variant="ghost" onClick={() => setConfirmLeave(false)}>취소</Btn>
            <Btn sm variant="danger" onClick={() => { st.leaveMember(live.id); onClose() }}>탈퇴 처리</Btn>
          </div>
        ) : (
          <Btn sm variant="danger" onClick={() => setConfirmLeave(true)}>회원 탈퇴</Btn>
        )}
      </div>

      {editOpen && <ProfileEditModal live={live} onClose={() => setEditOpen(false)} />}
      {rpMode && <RpModal live={live} mode={rpMode} onClose={() => setRpMode(null)} />}
      {transferMode && <MemberTransferModal live={live} mode={transferMode} onClose={() => setTransferMode(null)} />}
    </div>
  )
}

function MemberLedgerTab({ live }: { live: Member }) {
  const ledger = useStore((s) => s.ledger)
  const [page, setPage] = useState(1)
  const PAGE = 8
  const rows = ledger.filter((l) => l.from === live.id || l.to === live.id)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE)

  if (rows.length === 0) return <div className="text-sm text-mut py-8 text-center">거래 이력이 없습니다.</div>
  return (
    <div>
      <div className="space-y-1.5">
        {pageRows.map((l) => (
          <div key={l.id} className="px-3 py-2 bg-surface2/50 rounded-lg text-[14px]">
            <div className="flex items-center gap-2">
              <span className={`font-semibold num ${l.to === live.id ? 'text-mint' : 'text-rose'}`}>
                {l.to === live.id ? '+' : '−'}{fmtNum(l.amount)}
              </span>
              <Badge tone={l.currency === 'P' ? 'gold' : l.currency === 'S' ? 'sky' : 'viol'}>
                {l.currency === 'P' ? '포인트' : l.currency === 'S' ? '시드' : '음료권'}
              </Badge>
              <span className="ml-auto text-faint num">{fmtDateTime(l.ts)}</span>
            </div>
            {l.reason && <div className="text-mut mt-0.5 truncate">{l.reason}</div>}
          </div>
        ))}
      </div>
      <Pager page={page} pages={pages} onPage={setPage} />
    </div>
  )
}

function MemberMemoTab({ live }: { live: Member }) {
  const updateMember = useStore((s) => s.updateMember)
  const [memo, setMemo] = useState(live.memo ?? '')
  const [saved, setSaved] = useState(false)

  return (
    <div className="space-y-3">
      <textarea
        value={memo}
        onChange={(e) => { setMemo(e.target.value); setSaved(false) }}
        rows={8}
        placeholder="예: VIP, 목요일 단골, 리버킹과 동반 방문"
        className="w-full bg-surface2 border border-line2 rounded-xl px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-mint/60 outline-none resize-y"
      />
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-[14px] text-mint">저장되었습니다</span>}
        <Btn sm variant="primary" onClick={() => { updateMember(live.id, { memo }); setSaved(true) }}>저장</Btn>
      </div>
    </div>
  )
}

function ProfileEditModal({ live, onClose }: { live: Member; onClose: () => void }) {
  const updateMember = useStore((s) => s.updateMember)
  const [nickname, setNickname] = useState(live.nickname)
  const [realName, setRealName] = useState(live.realName ?? '')
  const [phone, setPhone] = useState(live.phone ?? '')
  const [emoji, setEmoji] = useState(live.emoji)
  const [color, setColor] = useState(live.color)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!nickname.trim()) return setError('닉네임을 입력해주세요.')
    const err = await updateMember(live.id, {
      nickname: nickname.trim(),
      realName: realName.trim() || undefined,
      phone: phone.trim() || undefined,
      emoji,
      color,
    })
    if (err) return setError(err)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="프로필 수정">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="닉네임">
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </Field>
          <Field label="이름 (실명, 선택)">
            <Input value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="—" />
          </Field>
        </div>
        <Field label="전화번호 (선택)">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" />
        </Field>
        <Field label="아바타">
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`w-9 h-9 rounded-xl border text-lg ${emoji === e ? 'border-mint/70 bg-mint/10' : 'border-line2'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="컬러">
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`컬러 ${c}`}
                className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        {error && <div className="text-sm text-rose">{error}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" onClick={submit}>저장</Btn>
        </div>
      </div>
    </Modal>
  )
}

function RpModal({ live, mode, onClose }: { live: Member; mode: 'give' | 'take'; onClose: () => void }) {
  const adjustRp = useStore((s) => s.adjustRp)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const n = parseInt(amount, 10) || 0
    const err = await adjustRp(live.id, mode === 'give' ? n : -n, reason)
    if (err) return setError(err)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={mode === 'give' ? 'RP 전송하기' : 'RP 환수하기'}>
      <p className="text-[14px] text-mut leading-relaxed mb-4">
        <b className="text-ink">{live.nickname}</b>님의 현재 RP는 <b className="text-mint num">{fmtNum(live.rp)}</b>입니다.
        수동 조정은 사유가 필수이며 조정 이력에 기록됩니다.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="수량 (RP)">
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label="사유 (필수)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === 'give' ? '예: 이벤트 보너스' : '예: 오지급 정정'} />
        </Field>
      </div>
      {error && <div className="text-sm text-rose mt-3">{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={onClose}>취소</Btn>
        <Btn variant="primary" onClick={submit}>{mode === 'give' ? '전송' : '환수'}</Btn>
      </div>
    </Modal>
  )
}

function MemberTransferModal({ live, mode, onClose }: { live: Member; mode: 'send' | 'reclaim'; onClose: () => void }) {
  const transferToMember = useStore((s) => s.transferToMember)
  const reclaimFromMember = useStore((s) => s.reclaimFromMember)
  const [currency, setCurrency] = useState<'P' | 'S' | 'V'>('P')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const labels = { P: '포인트', S: '시드', V: '음료권' } as const

  const submit = async () => {
    const n = parseInt(amount, 10) || 0
    if (mode === 'reclaim' && !reason.trim()) return setError('환수 사유를 입력해주세요.')
    const err =
      mode === 'send'
        ? await transferToMember(live.id, currency, n, reason.trim() || '지점 전송')
        : await reclaimFromMember(live.id, currency, n, reason.trim())
    if (err) return setError(err)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`${live.nickname} — ${mode === 'send' ? '전송하기' : '환수하기'}`}>
      <div className="space-y-4">
        <Field label="재화">
          <div className="grid grid-cols-3 gap-2">
            {(['P', 'S', 'V'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                  currency === c ? 'border-mint/60 bg-mint/10 text-mint' : 'border-line2 text-mut hover:text-ink'
                }`}
              >
                {labels[c]}
                <span className="block text-[12px] font-normal num">보유 {fmtNum(live.balances[c])}</span>
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="수량">
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
          <Field label={mode === 'reclaim' ? '사유 (필수)' : '사유 (선택)'}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === 'reclaim' ? '예: 오지급 정정' : '예: 이벤트 지급'} />
          </Field>
        </div>
        {error && <div className="text-sm text-rose">{error}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" onClick={submit}>{mode === 'send' ? '전송' : '환수'}</Btn>
        </div>
      </div>
    </Modal>
  )
}
