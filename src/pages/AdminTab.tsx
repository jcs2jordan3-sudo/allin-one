import { useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useSession, useStore } from '../store'
import type { Manager, Member } from '../types'
import { fmtDateTime, fmtNum } from '../lib/format'
import { Badge, Btn, Card, Empty, Field, Input, Modal, SectionTitle } from '../components/ui'
import Avatar from '../components/Avatar'

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
      {/* 매니저 계정 */}
      <section>
        <SectionTitle right={<Btn sm variant="gold" onClick={() => setManagerModal('new')}>생성하기</Btn>}>매니저 계정</SectionTitle>
        {st.managers.length === 0 ? (
          <Empty>등록된 매니저가 없습니다.</Empty>
        ) : (
          <div className="space-y-2">
            {st.managers.map((m) => (
              <Card key={m.id} className="px-5 py-3.5 flex items-center gap-3">
                <span className="font-bold">{m.name}</span>
                <span className="text-[13px] text-mut">({m.loginId})</span>
                <div className="ml-auto flex gap-2">
                  <Btn sm onClick={() => setManagerModal(m)}>변경</Btn>
                  <Btn sm variant="danger" onClick={() => setConfirmDelMgr(m)}>삭제</Btn>
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
              className={`px-3.5 py-1.5 rounded-full border text-[13px] font-semibold transition-colors ${
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
                <tr className="text-left text-[12px] text-mut border-b border-line">
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
                        <span className="text-[12px] text-mut num">({m.no})</span>
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

      {/* 잠금 설정 */}
      <LockSection />

      {/* 데이터 관리 */}
      <DataSection />

      {managerModal && <ManagerModal manager={managerModal === 'new' ? null : managerModal} onClose={() => setManagerModal(null)} />}
      {confirmDelMgr && (
        <Modal open onClose={() => setConfirmDelMgr(null)} title="매니저 삭제">
          <p className="text-sm text-mut leading-relaxed">
            매니저 <b className="text-ink">{confirmDelMgr.name}</b> ({confirmDelMgr.loginId}) 계정을 삭제할까요?
            <br />해당 계정은 즉시 로그인할 수 없게 됩니다.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Btn variant="ghost" onClick={() => setConfirmDelMgr(null)}>취소</Btn>
            <Btn variant="danger" onClick={() => { st.removeManager(confirmDelMgr.id); setConfirmDelMgr(null) }}>삭제</Btn>
          </div>
        </Modal>
      )}
      {memberModal && <MemberDetailModal member={memberModal} onClose={() => setMemberModal(null)} />}
      {addOpen && <AddMemberModal onClose={() => setAddOpen(false)} />}
    </div>
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
        <p className="text-[13px] text-mut leading-relaxed mb-4">
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
        {msg && <div className="text-[13px] text-mint mt-3">{msg}</div>}
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

  return (
    <section>
      <SectionTitle>데이터 관리</SectionTitle>
      <Card className="p-5">
        <div className="flex flex-wrap gap-2">
          <Btn onClick={backup}>백업 다운로드</Btn>
          <Btn onClick={() => fileRef.current?.click()}>백업 복원</Btn>
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
        <p className="text-[12px] text-mut mt-3 leading-relaxed">
          데이터는 이 브라우저에 저장됩니다. 실사용 전 주기적으로 백업을 내려받아 두세요.
          "빈 상태로 시작"은 게임 셋·이용권 유형·테이블·매니저 구조만 남기고 회원·게임·원장을 모두 비웁니다.
        </p>
        {msg && <div className="text-[13px] text-mint mt-2">{msg}</div>}
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
            <Btn variant="danger" onClick={() => { resetData(confirm); setConfirm(null); setMsg('초기화가 완료되었습니다.') }}>실행</Btn>
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
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (!loginId.trim() || !name.trim()) return setError('아이디와 이름을 모두 입력해주세요.')
    if (manager) updateManager(manager.id, { loginId: loginId.trim(), name: name.trim() })
    else addManager(loginId.trim(), name.trim())
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={manager ? '매니저 변경' : '매니저 생성'}>
      <div className="space-y-4">
        <Field label="로그인 아이디">
          <Input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="예: manager2" />
        </Field>
        <Field label="이름">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 매니저2" />
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

function AddMemberModal({ onClose }: { onClose: () => void }) {
  const addMember = useStore((s) => s.addMember)
  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  const [color, setColor] = useState(COLORS[0])
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (!nickname.trim()) return setError('닉네임을 입력해주세요.')
    addMember(nickname.trim(), emoji, color, phone.trim() || undefined)
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
          <Btn variant="primary" onClick={submit}>등록</Btn>
        </div>
      </div>
    </Modal>
  )
}

function MemberDetailModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const st = useStore()
  const live = st.members.find((m) => m.id === member.id) ?? member
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [memo, setMemo] = useState(live.memo ?? '')

  const history = st.ledger.filter((l) => l.from === live.id || l.to === live.id).slice(0, 8)
  const gameCount = st.games.filter((g) => g.entries.some((e) => e.memberId === live.id)).length
  const wins = st.games.filter((g) => g.entries.some((e) => e.memberId === live.id && e.rank === 1)).length
  const nowTs = Date.now()
  const myPasses = st.passes.filter((p) => p.memberId === live.id)
  const passUnused = myPasses.filter((p) => p.status === 'unused' && nowTs <= p.expiresAt).length
  const passExpired = myPasses.filter((p) => p.status === 'unused' && nowTs > p.expiresAt).length

  return (
    <Modal open onClose={onClose} title="회원 상세" wide>
      <div className="grid sm:grid-cols-[240px_1fr] gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar emoji={live.emoji} color={live.color} size={52} />
            <div>
              <div className="font-bold text-lg">{live.nickname}</div>
              <div className="text-[13px] text-mut num">회원번호 {live.no}</div>
            </div>
          </div>
          <div className="bg-white p-3 rounded-2xl w-fit">
            <QRCodeSVG value={`member:${live.no}`} size={110} />
          </div>
          <div className="text-[12px] text-mut">개인 QR — 스캔으로 지급·참가 처리</div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-mut">가입일</span><span className="num">{fmtDateTime(live.joinedAt)}</span></div>
            <div className="flex justify-between"><span className="text-mut">게임 참가</span><span className="num">{gameCount}회</span></div>
            <div className="flex justify-between"><span className="text-mut">우승</span><span className="num text-gold">{wins}회</span></div>
            <div className="flex justify-between"><span className="text-mut">시즌 RP</span><span className="num text-mint">{fmtNum(live.rp)}RP</span></div>
            <div className="flex justify-between">
              <span className="text-mut">이용권</span>
              <span className="num">
                미사용 {passUnused}장{passExpired > 0 && <span className="text-rose"> · 만료 {passExpired}장</span>}
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface2/70 border border-line rounded-xl px-3 py-2.5">
              <div className="text-[11px] text-faint">포인트</div>
              <div className="font-bold num text-gold">{fmtNum(live.balances.P)}</div>
            </div>
            <div className="bg-surface2/70 border border-line rounded-xl px-3 py-2.5">
              <div className="text-[11px] text-faint">시드</div>
              <div className="font-bold num text-sky">{fmtNum(live.balances.S)}</div>
            </div>
            <div className="bg-surface2/70 border border-line rounded-xl px-3 py-2.5">
              <div className="text-[11px] text-faint">음료권</div>
              <div className="font-bold num text-viol">{live.balances.V}장</div>
            </div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-mut mb-1.5">최근 거래</div>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {history.length === 0 && <div className="text-sm text-mut py-2">거래 이력이 없습니다.</div>}
              {history.map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-[13px] px-3 py-1.5 bg-surface2/50 rounded-lg">
                  <span className={`font-semibold num ${l.to === live.id ? 'text-mint' : 'text-rose'}`}>
                    {l.to === live.id ? '+' : '−'}{fmtNum(l.amount)}
                  </span>
                  <Badge tone={l.currency === 'P' ? 'gold' : l.currency === 'S' ? 'sky' : 'viol'}>
                    {l.currency === 'P' ? '포인트' : l.currency === 'S' ? '시드' : '음료권'}
                  </Badge>
                  <span className="text-mut truncate">{l.reason ?? ''}</span>
                  <span className="ml-auto text-faint num shrink-0">{fmtDateTime(l.ts)}</span>
                </div>
              ))}
            </div>
          </div>
          <Field label="관리 메모">
            <div className="flex gap-2">
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: VIP, 목요일 단골" />
              <Btn sm onClick={() => st.updateMember(live.id, { memo })}>저장</Btn>
            </div>
          </Field>
          <div className="pt-2 border-t border-line flex justify-end">
            {confirmLeave ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-rose">잔액이 전액 지점으로 환수됩니다. 진행할까요?</span>
                <Btn sm variant="ghost" onClick={() => setConfirmLeave(false)}>취소</Btn>
                <Btn sm variant="danger" onClick={() => { st.leaveMember(live.id); onClose() }}>탈퇴 처리</Btn>
              </div>
            ) : (
              <Btn sm variant="danger" onClick={() => setConfirmLeave(true)}>회원 탈퇴</Btn>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
