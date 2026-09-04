import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Pass, PassType } from '../types'
import { useNow } from '../lib/time'
import { fmtDateTime, fmtNum } from '../lib/format'
import { Badge, Btn, Card, Empty, Field, Input, Modal, Pager, SectionTitle, Segmented, Select } from '../components/ui'
import Avatar from '../components/Avatar'

const DAY = 86_400_000
const PAGE = 8

type ViewStatus = 'unused' | 'used' | 'expired' | 'revoked'

/** 저장 상태 + 기한 경과로 표시 상태 파생 (만료는 저장하지 않음) */
function statusOf(p: Pass, now: number): ViewStatus {
  if (p.status === 'unused' && now > p.expiresAt) return 'expired'
  return p.status
}

const STATUS_META: Record<ViewStatus, { label: string; tone: 'mint' | 'gold' | 'rose' | 'mut' }> = {
  unused: { label: '미사용', tone: 'mint' },
  used: { label: '사용됨', tone: 'mut' },
  expired: { label: '만료됨', tone: 'rose' },
  revoked: { label: '회수됨', tone: 'gold' },
}

export default function PassesTab() {
  const st = useStore()
  const now = useNow(60_000)
  const [issueOpen, setIssueOpen] = useState(false)
  const [typesOpen, setTypesOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [filter, setFilter] = useState<'all' | ViewStatus>('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [logPage, setLogPage] = useState(1)
  const [extendTarget, setExtendTarget] = useState<Pass | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<Pass | null>(null)
  const [useTarget, setUseTarget] = useState<Pass | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const monthStart = useMemo(() => {
    const d = new Date(now)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [now])

  // 집계: 발급 = 기간 내 발급 건수 · 사용 = 기간 내 사용 건수 · 미사용 = 기간 내 발급분 중 아직 미사용
  const agg = (from: number) =>
    st.passTypes.map((t) => ({
      t,
      issued: st.passes.filter((p) => p.typeId === t.id && p.issuedAt >= from).length,
      used: st.passes.filter((p) => p.typeId === t.id && p.usedAt !== undefined && p.usedAt >= from).length,
      unused: st.passes.filter((p) => p.typeId === t.id && p.issuedAt >= from && p.status === 'unused').length,
    }))

  const bizAgg = useMemo(() => agg(st.bizResetAt), [st.passes, st.passTypes, st.bizResetAt])
  const monthAgg = useMemo(() => agg(monthStart), [st.passes, st.passTypes, monthStart])

  const expiredCount = st.passes.filter((p) => statusOf(p, now) === 'expired').length

  const rows = useMemo(() => {
    return st.passes
      .filter((p) => filter === 'all' || statusOf(p, now) === filter)
      .filter((p) => {
        if (!q) return true
        const m = st.members.find((x) => x.id === p.memberId)
        return !!m && (m.nickname.includes(q) || m.no.includes(q))
      })
      .sort((a, b) => b.issuedAt - a.issuedAt)
  }, [st.passes, st.members, filter, q, now])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE)
  const logPages = Math.max(1, Math.ceil(st.passLog.length / PAGE))
  const logRows = st.passLog.slice((logPage - 1) * PAGE, logPage * PAGE)

  const memberOf = (id?: string) => st.members.find((m) => m.id === id)
  const typeOf = (id: string) => st.passTypes.find((t) => t.id === id)

  const run = async (fn: () => Promise<string | null>) => {
    const err = await fn()
    setActionError(err)
    if (!err) {
      setExtendTarget(null)
      setRevokeTarget(null)
      setUseTarget(null)
    }
  }

  return (
    <div className="space-y-8">
      {/* 집계 */}
      <section>
        <SectionTitle
          right={
            <>
              <Btn sm onClick={() => setTypesOpen(true)}>유형 관리</Btn>
              <Btn sm variant="primary" onClick={() => setIssueOpen(true)}>+ 발급하기</Btn>
            </>
          }
        >
          이용권 현황
        </SectionTitle>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h3 className="font-bold">
                영업일 집계 <span className="text-[13px] text-mut font-normal ml-1 num">마지막 초기화 {fmtDateTime(st.bizResetAt)}</span>
              </h3>
              <Btn sm variant="danger" onClick={() => setConfirmReset(true)}>초기화</Btn>
            </div>
            <AggGrid data={bizAgg} />
          </Card>
          <Card className="p-5">
            <h3 className="font-bold mb-4">
              당월 집계 <span className="text-[13px] text-mut font-normal ml-1">※ 1일 ~ 현재</span>
            </h3>
            <AggGrid data={monthAgg} />
          </Card>
        </div>
      </section>

      {/* 이용권 목록 (만료 이용권 관리 포함) */}
      <section>
        <SectionTitle
          right={
            <div className="w-56 max-w-full">
              <Input placeholder="닉네임 혹은 번호 검색" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
            </div>
          }
        >
          이용권 목록
          {expiredCount > 0 && <Badge tone="rose">만료 {expiredCount}건 처리 대기</Badge>}
        </SectionTitle>
        <div className="mb-4">
          <Segmented
            options={[
              { value: 'all', label: '전체' },
              { value: 'unused', label: '미사용' },
              { value: 'expired', label: '만료' },
              { value: 'used', label: '사용됨' },
              { value: 'revoked', label: '회수됨' },
            ]}
            value={filter}
            onChange={(v) => { setFilter(v); setPage(1) }}
          />
        </div>

        {pageRows.length === 0 ? (
          <Empty>조건에 맞는 이용권이 없습니다.</Empty>
        ) : (
          <div className="space-y-2">
            {pageRows.map((p) => {
              const t = typeOf(p.typeId)
              const m = memberOf(p.memberId)
              const vs = statusOf(p, now)
              const meta = STATUS_META[vs]
              const dday = Math.ceil((p.expiresAt - now) / DAY)
              return (
                <Card key={p.id} className={`px-4 py-3 flex flex-wrap items-center gap-3 ${vs === 'used' || vs === 'revoked' ? 'opacity-60' : ''}`}>
                  <span
                    className="px-2.5 py-1 rounded-lg text-[13px] font-bold shrink-0"
                    style={{ background: `color-mix(in srgb, ${t?.color ?? '#888'} 18%, transparent)`, color: t?.color }}
                  >
                    {t?.name ?? '삭제된 유형'}
                  </span>
                  {m && (
                    <span className="flex items-center gap-2">
                      <Avatar emoji={m.emoji} color={m.color} size={26} />
                      <span className="text-sm font-semibold">{m.nickname}</span>
                      <span className="text-[13px] text-mut num">({m.no})</span>
                    </span>
                  )}
                  <span className="text-[13px] text-mut num">발급 {fmtDateTime(p.issuedAt)}</span>
                  <span className={`text-[13px] num ${vs === 'expired' ? 'text-rose font-semibold' : 'text-mut'}`}>
                    {vs === 'used' && p.usedAt
                      ? `사용 ${fmtDateTime(p.usedAt)}`
                      : vs === 'expired'
                        ? `만료 ${fmtDateTime(p.expiresAt)}`
                        : vs === 'unused'
                          ? `만료까지 D-${Math.max(0, dday)}`
                          : ''}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {vs === 'unused' && (
                      <>
                        <Btn sm variant="primary" onClick={() => setUseTarget(p)}>사용 처리</Btn>
                        <Btn sm onClick={() => setExtendTarget(p)}>연장</Btn>
                        <Btn sm variant="danger" onClick={() => setRevokeTarget(p)}>회수</Btn>
                      </>
                    )}
                    {vs === 'expired' && <Btn sm variant="gold" onClick={() => setExtendTarget(p)}>연장 (재활성)</Btn>}
                  </span>
                </Card>
              )
            })}
          </div>
        )}
        <Pager page={page} pages={pages} onPage={setPage} />
      </section>

      {/* 작업내역 */}
      <section>
        <SectionTitle>작업내역</SectionTitle>
        {logRows.length === 0 ? (
          <Empty>작업내역이 없습니다.</Empty>
        ) : (
          <div className="space-y-1.5">
            {logRows.map((l) => {
              const m = memberOf(l.memberId)
              return (
                <Card key={l.id} className="px-4 py-2.5 flex flex-wrap items-center gap-3 text-sm">
                  <Badge
                    tone={l.action === '발급' ? 'mint' : l.action === '사용' ? 'sky' : l.action === '연장' ? 'gold' : l.action === '회수' ? 'rose' : 'mut'}
                  >
                    {l.action}
                  </Badge>
                  {l.typeName && <span className="font-semibold">{l.typeName}</span>}
                  {m && <span className="text-mut">{m.nickname} ({m.no})</span>}
                  {l.detail && <span className="text-mut text-[14px]">{l.detail}</span>}
                  <span className="ml-auto text-[13px] text-faint num">
                    {l.operator} · {fmtDateTime(l.ts)}
                  </span>
                </Card>
              )
            })}
          </div>
        )}
        <Pager page={logPage} pages={logPages} onPage={setLogPage} />
      </section>

      {/* 모달들 */}
      {issueOpen && <IssueModal onClose={() => setIssueOpen(false)} />}
      {typesOpen && <TypesModal onClose={() => setTypesOpen(false)} />}

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="영업일 집계 초기화">
        <p className="text-sm text-mut leading-relaxed">
          영업일 집계 기준 시각을 지금으로 재설정할까요?
          <br />이용권 데이터 자체는 삭제되지 않으며, 집계 구간만 새로 시작됩니다.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={() => setConfirmReset(false)}>취소</Btn>
          <Btn variant="danger" onClick={() => { st.resetBizDay(); setConfirmReset(false) }}>초기화</Btn>
        </div>
      </Modal>

      {useTarget && (
        <Modal open onClose={() => { setUseTarget(null); setActionError(null) }} title="이용권 사용 처리">
          <p className="text-sm text-mut leading-relaxed">
            <b className="text-ink">{memberOf(useTarget.memberId)?.nickname}</b>님의{' '}
            <b className="text-ink">{typeOf(useTarget.typeId)?.name}</b> 이용권을 사용 처리할까요?
          </p>
          {actionError && <div className="text-sm text-rose mt-3">{actionError}</div>}
          <div className="flex justify-end gap-2 mt-5">
            <Btn variant="ghost" onClick={() => { setUseTarget(null); setActionError(null) }}>취소</Btn>
            <Btn variant="primary" onClick={() => run(() => st.usePass(useTarget.id))}>사용 처리</Btn>
          </div>
        </Modal>
      )}

      {extendTarget && (
        <ExtendModal
          pass={extendTarget}
          typeName={typeOf(extendTarget.typeId)?.name ?? ''}
          memberName={memberOf(extendTarget.memberId)?.nickname ?? ''}
          error={actionError}
          onSubmit={(days) => run(() => st.extendPass(extendTarget.id, days))}
          onClose={() => { setExtendTarget(null); setActionError(null) }}
        />
      )}

      {revokeTarget && (
        <Modal open onClose={() => { setRevokeTarget(null); setActionError(null) }} title="이용권 회수">
          <p className="text-sm text-mut leading-relaxed">
            <b className="text-ink">{memberOf(revokeTarget.memberId)?.nickname}</b>님의{' '}
            <b className="text-ink">{typeOf(revokeTarget.typeId)?.name}</b> 이용권을 회수할까요? 되돌릴 수 없습니다.
          </p>
          {actionError && <div className="text-sm text-rose mt-3">{actionError}</div>}
          <div className="flex justify-end gap-2 mt-5">
            <Btn variant="ghost" onClick={() => { setRevokeTarget(null); setActionError(null) }}>취소</Btn>
            <Btn variant="danger" onClick={() => run(() => st.revokePass(revokeTarget.id))}>회수</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── 집계 그리드 ───────────────────────────────────────────────────────────

function AggGrid({ data }: { data: { t: PassType; issued: number; unused: number; used: number }[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {data.map(({ t, issued, unused, used }) => (
        <div key={t.id} className="bg-surface2/60 border border-line rounded-xl p-4">
          <div className="text-center font-bold mb-3" style={{ color: t.color }}>{t.name}</div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-mut">발급</dt><dd className="num font-semibold">{fmtNum(issued)}</dd></div>
            <div className="flex justify-between"><dt className="text-mut">미사용</dt><dd className="num font-semibold">{fmtNum(unused)}</dd></div>
            <div className="flex justify-between"><dt className="text-mut">사용</dt><dd className="num font-semibold text-mint">{fmtNum(used)}</dd></div>
          </dl>
        </div>
      ))}
    </div>
  )
}

// ── 발급 모달 ─────────────────────────────────────────────────────────────

function IssueModal({ onClose }: { onClose: () => void }) {
  const st = useStore()
  const [typeId, setTypeId] = useState(st.passTypes[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [memberId, setMemberId] = useState<string | null>(null)
  const [count, setCount] = useState('1')
  const [error, setError] = useState<string | null>(null)

  const list = st.members
    .filter((m) => m.status === 'active')
    .filter((m) => !q || m.nickname.includes(q) || m.no.includes(q))
  const selected = st.passTypes.find((t) => t.id === typeId)

  const submit = async () => {
    if (!memberId) return setError('회원을 선택해주세요.')
    const n = parseInt(count, 10)
    const err = await st.issuePasses(typeId, memberId, n || 0)
    if (err) return setError(err)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="이용권 발급">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="이용권 유형">
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {st.passTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="수량">
            <Input type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} />
          </Field>
        </div>
        {selected && (
          <p className="text-[13px] text-mut -mt-2">유효기간 발급일로부터 <b className="text-ink">{selected.validDays}일</b></p>
        )}
        <Field label="회원 검색">
          <Input placeholder="닉네임 혹은 번호" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
          {list.map((m) => (
            <button
              key={m.id}
              onClick={() => setMemberId(m.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors ${
                memberId === m.id ? 'border-mint/60 bg-mint/8' : 'border-line hover:border-line2'
              }`}
            >
              <Avatar emoji={m.emoji} color={m.color} size={26} />
              <span className="text-sm font-semibold">{m.nickname}</span>
              <span className="text-[13px] text-mut num">({m.no})</span>
            </button>
          ))}
        </div>
        {error && <div className="text-sm text-rose">{error}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" onClick={submit}>발급</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ── 유형 관리 모달 ────────────────────────────────────────────────────────

const TYPE_COLORS = ['#57B6F2', '#E9BB56', '#A98BF5', '#4FD1C5', '#F2A65A', '#F26D76']

function TypesModal({ onClose }: { onClose: () => void }) {
  const st = useStore()
  const [error, setError] = useState<string | null>(null)
  const uid = () => crypto.randomUUID().slice(0, 8)

  return (
    <Modal open onClose={onClose} title="이용권 유형 관리" wide>
      <div className="space-y-2">
        {st.passTypes.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3 border border-line rounded-xl flex-wrap">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color }} aria-hidden />
            <Input
              value={t.name}
              onChange={(e) => st.savePassType({ ...t, name: e.target.value })}
              className="!w-40"
            />
            <span className="text-sm text-mut">유효기간</span>
            <Input
              type="number"
              min={1}
              value={t.validDays}
              onChange={(e) => st.savePassType({ ...t, validDays: Math.max(1, +e.target.value) })}
              className="!w-24"
            />
            <span className="text-sm text-mut">일</span>
            <div className="ml-auto">
              <Btn sm variant="danger" onClick={async () => setError(await st.removePassType(t.id))}>삭제</Btn>
            </div>
          </div>
        ))}
        <Btn
          sm
          onClick={() =>
            st.savePassType({
              id: uid(),
              name: '새 이용권',
              validDays: 30,
              color: TYPE_COLORS[st.passTypes.length % TYPE_COLORS.length],
            })
          }
        >
          + 유형 추가
        </Btn>
        {error && <div className="text-sm text-rose">{error}</div>}
        <p className="text-[13px] text-mut pt-2">
          변경 사항은 즉시 저장됩니다. 이미 발급된 이용권의 만료일은 유효기간을 바꿔도 변하지 않습니다.
        </p>
      </div>
    </Modal>
  )
}

// ── 연장 모달 ─────────────────────────────────────────────────────────────

function ExtendModal({
  pass, typeName, memberName, error, onSubmit, onClose,
}: {
  pass: Pass
  typeName: string
  memberName: string
  error: string | null
  onSubmit: (days: number) => void
  onClose: () => void
}) {
  const now = Date.now()
  const expired = now > pass.expiresAt
  const [days, setDays] = useState('30')

  return (
    <Modal open onClose={onClose} title={expired ? '만료 이용권 연장 (재활성)' : '이용권 연장'}>
      <p className="text-sm text-mut leading-relaxed">
        <b className="text-ink">{memberName}</b>님의 <b className="text-ink">{typeName}</b> 이용권
        {expired ? (
          <> — <span className="text-rose">이미 만료되어</span> 오늘부터 연장 일수만큼 다시 유효해집니다.</>
        ) : (
          <> — 현재 만료일({fmtDateTime(pass.expiresAt)})에서 연장됩니다.</>
        )}
      </p>
      <div className="mt-4 max-w-40">
        <Field label="연장 일수">
          <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </div>
      {error && <div className="text-sm text-rose mt-3">{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={onClose}>취소</Btn>
        <Btn variant="primary" onClick={() => onSubmit(parseInt(days, 10) || 0)}>연장</Btn>
      </div>
    </Modal>
  )
}
