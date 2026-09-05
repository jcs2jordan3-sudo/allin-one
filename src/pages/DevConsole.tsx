import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hasSupabase } from '../lib/supabase'
import { refreshRole, signIn, signOut, useAuth } from '../auth'
import { absUrl } from '../lib/url'
import { fmtDateTime } from '../lib/format'
import { Badge, Btn, Card, Field, Input, Modal } from '../components/ui'
import Splash from '../components/Splash'
import { LocalNotice } from '../player/JoinPage'
import { adminCreateStore, adminListStores, adminSelectStore, adminSetStoreOwner, fetchIsPlatformAdmin, type AdminStore } from '../dev/api'

/**
 * 개발자(플랫폼 관리자) 콘솔 — /dev
 *  서비스 구매가 들어오면 여기서 매장을 개설하고 구매자 이메일을 대표로 지정한다.
 *  구매자가 그 이메일로 관리자 콘솔에서 가입하면 서버 트리거가 자동으로 대표 권한에 연결한다.
 *  platform_admins 테이블에 등록된 계정만 사용할 수 있다(등록은 SQL로만).
 */
export default function DevConsole() {
  const status = useAuth((s) => s.status)
  const session = useAuth((s) => s.session)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    if (!hasSupabase || !session) { setIsAdmin(null); return }
    let alive = true
    fetchIsPlatformAdmin().then((b) => { if (alive) setIsAdmin(b) })
    return () => { alive = false }
  }, [session])

  if (!hasSupabase) return <LocalNotice />
  if (status === 'loading') return <Splash text="세션 확인 중…" />
  if (!session) {
    return (
      <Shell title="개발자 콘솔 로그인" sub="플랫폼 관리자로 등록된 계정만 들어올 수 있습니다.">
        <LoginForm />
      </Shell>
    )
  }
  if (isAdmin === null) return <Splash text="권한 확인 중…" />
  if (!isAdmin) {
    return (
      <Shell title="개발자 계정이 아닙니다" sub={`${session.user.email ?? ''} 계정은 플랫폼 관리자로 등록되어 있지 않습니다.`}>
        <div className="space-y-2">
          <Link to="/" className="block"><Btn className="w-full">관리자 콘솔로</Btn></Link>
          <Btn variant="ghost" className="w-full" onClick={() => signOut()}>다른 계정으로 로그인</Btn>
        </div>
      </Shell>
    )
  }
  return <Dashboard email={session.user.email ?? ''} />
}

function Shell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen stage-bg flex items-center justify-center p-6">
      <div className="card w-full max-w-sm p-8">
        <div className="font-extrabold tracking-tight text-lg text-center mb-1">
          ♠ ALL-IN <span className="text-mint">ONE</span> <span className="text-mut text-[15px] font-semibold">DEV</span>
        </div>
        <h1 className="text-center font-bold text-xl mt-3">{title}</h1>
        {sub && <p className="text-center text-[16px] text-mut mt-1.5 leading-relaxed">{sub}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!email.trim() || !pw) return setError('이메일과 비밀번호를 입력해주세요.')
    setBusy(true)
    setError(null)
    const err = await signIn(email, pw)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="space-y-3">
      <Field label="이메일">
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dev@example.com" autoFocus />
      </Field>
      <Field label="비밀번호">
        <Input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </Field>
      {error && <div className="text-sm text-rose">{error}</div>}
      <Btn variant="primary" className="w-full" onClick={submit} disabled={busy}>{busy ? '로그인 중…' : '로그인'}</Btn>
    </div>
  )
}

/** 구매자에게 보낼 안내문 — 콘솔 주소와 가입 절차 */
export function handoffText(storeName: string, ownerEmail: string): string {
  return [
    `[ALL-IN ONE] ${storeName} 관리자 콘솔 안내`,
    `1) ${absUrl('/')} 접속`,
    `2) "초대받은 직원이에요 → 가입" 선택`,
    `3) 이메일 ${ownerEmail} 로 가입 (비밀번호 6자 이상)`,
    `가입 즉시 대표 권한으로 콘솔이 열립니다.`,
  ].join('\n')
}

function Dashboard({ email }: { email: string }) {
  const [stores, setStores] = useState<AdminStore[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ownerTarget, setOwnerTarget] = useState<AdminStore | null>(null)
  const [created, setCreated] = useState<{ storeName: string; ownerEmail: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const r = await adminListStores()
    if (r.error) setError(r.error)
    else { setError(null); setStores(r.stores) }
  }, [])
  useEffect(() => { void load() }, [load])

  /** 매장을 선택하고 관리자 콘솔로 이동 — 서버가 이 계정을 그 매장의 대표로 판정 */
  const openConsole = async (id: string) => {
    setOpening(id)
    const err = await adminSelectStore(id)
    if (err) { setError(err); setOpening(null); return }
    await refreshRole()
    navigate('/')
  }

  const copy = async (storeName: string, ownerEmail: string) => {
    try { await navigator.clipboard.writeText(handoffText(storeName, ownerEmail)); setCopied(storeName) } catch { setCopied(null) }
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line px-5 py-3 flex items-center justify-between gap-3">
        <div className="font-extrabold tracking-tight">
          ♠ ALL-IN <span className="text-mint">ONE</span> <span className="text-mut font-semibold ml-2">개발자 콘솔</span>
        </div>
        <div className="flex items-center gap-3 text-[15px] text-mut">
          <span className="truncate">{email}</span>
          <Btn sm variant="ghost" onClick={() => signOut()}>로그아웃</Btn>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <section>
          <h2 className="text-lg font-bold mb-1">매장 개설</h2>
          <p className="text-[15px] text-mut mb-3">서비스를 구매한 사람의 이메일을 대표로 지정합니다. 그 이메일로 관리자 콘솔에서 가입하면 바로 대표 권한이 됩니다. 매장 목록의 "콘솔 열기"를 누르면 그 매장을 대표 권한으로 직접 볼 수 있습니다.</p>
          <Card className="p-5">
            <CreateForm onCreated={(c) => { setCreated(c); void load() }} />
          </Card>
          {created && (
            <Card className="p-5 mt-3">
              <div className="font-bold text-mint">"{created.storeName}" 개설 완료</div>
              <pre className="mt-2 text-[15px] text-mut whitespace-pre-wrap leading-relaxed">{handoffText(created.storeName, created.ownerEmail)}</pre>
              <div className="mt-3 flex gap-2">
                <Btn sm onClick={() => copy(created.storeName, created.ownerEmail)}>{copied === created.storeName ? '복사됨' : '안내문 복사'}</Btn>
                <Btn sm variant="ghost" onClick={() => setCreated(null)}>닫기</Btn>
              </div>
            </Card>
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">
            매장 목록 {stores && <span className="text-mut font-semibold">{stores.length}</span>}
          </h2>
          {error && <div className="text-sm text-rose mb-2">{error}</div>}
          {!stores && !error && <div className="text-mut text-sm">불러오는 중…</div>}
          {stores?.length === 0 && <div className="text-mut text-sm">아직 개설된 매장이 없습니다.</div>}
          <div className="space-y-2.5">
            {stores?.map((s) => (
              <Card key={s.id} className="p-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{s.name}</div>
                  <div className="text-[15px] text-mut mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>대표 {s.owner ? `${s.owner.name} · ${s.owner.email}` : '미지정'}</span>
                    {s.owner && (s.owner.linked ? <Badge tone="mint">로그인 연결됨</Badge> : <Badge tone="rose">가입 대기</Badge>)}
                  </div>
                  <div className="text-[14px] text-faint mt-0.5">
                    직원 {s.staffCount} · 회원 {s.memberCount} · 개설 {s.createdAt ? fmtDateTime(new Date(s.createdAt).getTime()) : '—'}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {s.owner && !s.owner.linked && (
                    <Btn sm onClick={() => copy(s.name, s.owner!.email)}>{copied === s.name ? '복사됨' : '안내문 복사'}</Btn>
                  )}
                  <Btn sm onClick={() => setOwnerTarget(s)}>대표 변경</Btn>
                  <Btn sm variant="primary" onClick={() => openConsole(s.id)} disabled={opening !== null}>
                    {opening === s.id ? '여는 중…' : s.selected ? '콘솔 열기 (보는 중)' : '콘솔 열기'}
                  </Btn>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </main>

      {ownerTarget && <OwnerModal store={ownerTarget} onClose={() => { setOwnerTarget(null); void load() }} />}
    </div>
  )
}

function CreateForm({ onCreated }: { onCreated: (c: { storeName: string; ownerEmail: string }) => void }) {
  const [storeName, setStoreName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    if (!storeName.trim()) return setError('매장 이름을 입력해주세요.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail.trim())) return setError('대표 이메일을 정확히 입력해주세요.')
    setBusy(true)
    const r = await adminCreateStore({ storeName, ownerEmail, ownerName })
    setBusy(false)
    if (r.error) return setError(r.error)
    onCreated({ storeName: storeName.trim(), ownerEmail: ownerEmail.trim().toLowerCase() })
    setStoreName(''); setOwnerEmail(''); setOwnerName('')
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="매장 이름">
        <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="예: 홍대 2호점" />
      </Field>
      <Field label="대표 이메일 (구매자)">
        <Input type="email" inputMode="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@example.com" />
      </Field>
      <Field label="대표 이름">
        <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="예: 홍길동" onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </Field>
      {error && <div className="sm:col-span-3 text-sm text-rose">{error}</div>}
      <div className="sm:col-span-3">
        <Btn variant="primary" onClick={submit} disabled={busy}>{busy ? '개설 중…' : '매장 개설 + 대표 지정'}</Btn>
      </div>
    </div>
  )
}

function OwnerModal({ store, onClose }: { store: AdminStore; onClose: () => void }) {
  const [email, setEmail] = useState(store.owner?.email ?? '')
  const [name, setName] = useState(store.owner?.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('대표 이메일을 정확히 입력해주세요.')
    setBusy(true)
    const err = await adminSetStoreOwner({ storeId: store.id, ownerEmail: email, ownerName: name })
    setBusy(false)
    if (err) return setError(err)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`${store.name} · 대표 변경`}>
      <div className="space-y-4">
        <p className="text-[15px] text-mut leading-relaxed">
          입력한 이메일이 대표가 됩니다. 이미 가입된 계정이면 즉시 연결되고, 아니면 그 이메일로 가입할 때 연결됩니다. 기존 대표는 매니저로 내려갑니다.
        </p>
        <Field label="대표 이메일">
          <Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@example.com" autoFocus />
        </Field>
        <Field label="대표 이름">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 홍길동" onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Field>
        {error && <div className="text-sm text-rose">{error}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" onClick={submit} disabled={busy}>{busy ? '저장 중…' : '대표로 지정'}</Btn>
        </div>
      </div>
    </Modal>
  )
}
