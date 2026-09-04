import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { refreshRole, signIn, signOut, signUp, useAuth } from '../auth'
import { errMsg } from '../store/map'
import { Btn, Field, Input } from '../components/ui'
import Splash from '../components/Splash'
import { appUrl } from '../lib/url'

/**
 * 콘솔 로그인 게이트 (클라우드 모드).
 *  - 매장이 없으면: 첫 직원이 가입하며 매장을 개설 (owner)
 *  - 매장이 있으면: 직원 로그인 / 초대받은 직원 가입
 *  - 로그인은 됐지만 직원이 아니면: 안내 + 로그아웃
 */
export default function StaffLogin() {
  const session = useAuth((s) => s.session)
  const role = useAuth((s) => s.role)
  const [hasStore, setHasStore] = useState<boolean | null>(null)

  useEffect(() => {
    supabase!.from('stores').select('id').limit(1).then(({ data, error }) => {
      setHasStore(error ? true : (data?.length ?? 0) > 0)
    })
  }, [session])

  if (hasStore === null) return <Splash text="확인 중…" />

  if (session && role.kind !== 'staff') {
    if (!hasStore) return <Shell title="매장 개설 마무리" sub="계정은 준비됐습니다. 매장 이름을 정하면 콘솔이 열립니다."><BootstrapForm /></Shell>
    return (
      <Shell title="직원 계정이 아닙니다" sub={role.kind === 'member' ? '이 계정은 플레이어(회원) 계정입니다.' : '이 이메일로 초대된 직원 정보가 없습니다. 대표에게 초대를 요청하세요.'}>
        <div className="space-y-2">
          {role.kind === 'member' && (
            <a href={appUrl('/me')} className="block"><Btn className="w-full">내 정보(플레이어 페이지)로 이동</Btn></a>
          )}
          <Btn className="w-full" onClick={() => refreshRole()}>다시 확인</Btn>
          <Btn variant="ghost" className="w-full" onClick={() => signOut()}>다른 계정으로 로그인</Btn>
        </div>
      </Shell>
    )
  }

  if (!hasStore) {
    return (
      <Shell title="매장 개설" sub="첫 직원 계정을 만들면서 매장을 개설합니다. 이 계정이 대표(owner)가 됩니다.">
        <SignupForm bootstrap />
      </Shell>
    )
  }

  return <LoginForm />
}

function Shell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen stage-bg flex items-center justify-center p-6">
      <div className="card w-full max-w-sm p-8">
        <div className="font-extrabold tracking-tight text-lg text-center mb-1">
          ♠ ALL-IN <span className="text-mint">ONE</span>
        </div>
        <h1 className="text-center font-bold text-xl mt-3">{title}</h1>
        {sub && <p className="text-center text-[16px] text-mut mt-1.5 leading-relaxed">{sub}</p>}
        <div className="mt-6">{children}</div>
        <div className="mt-6 text-center">
          <Link to="/rank" className="text-[15px] text-faint hover:text-mut">공개 랭킹 보기</Link>
        </div>
      </div>
    </div>
  )
}

function LoginForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
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

  if (mode === 'signup') {
    return (
      <Shell title="직원 가입" sub="대표가 콘솔에서 등록한 이메일로 가입하면 자동으로 연결됩니다.">
        <SignupForm />
        <button onClick={() => setMode('login')} className="mt-4 w-full text-[15px] text-mut hover:text-ink">이미 계정이 있어요 → 로그인</button>
      </Shell>
    )
  }

  return (
    <Shell title="관리자 콘솔 로그인">
      <div className="space-y-3">
        <Field label="이메일">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com" autoFocus />
        </Field>
        <Field label="비밀번호">
          <Input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Field>
        {error && <div className="text-sm text-rose">{error}</div>}
        <Btn variant="primary" className="w-full" onClick={submit} disabled={busy}>{busy ? '로그인 중…' : '로그인'}</Btn>
      </div>
      <div className="mt-4 flex items-center justify-between text-[15px]">
        <button onClick={() => setMode('signup')} className="text-mut hover:text-ink">초대받은 직원이에요 → 가입</button>
        <Link to="/reset" className="text-mut hover:text-ink">비밀번호 재설정</Link>
      </div>
    </Shell>
  )
}

/** 직원 가입 폼. bootstrap=true면 매장 이름까지 받아 개설 */
function SignupForm({ bootstrap }: { bootstrap?: boolean }) {
  const [storeName, setStoreName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const submit = async () => {
    if (bootstrap && !storeName.trim()) return setError('매장 이름을 입력해주세요.')
    if (!name.trim()) return setError('이름을 입력해주세요.')
    if (!email.trim() || pw.length < 6) return setError('이메일과 6자 이상의 비밀번호를 입력해주세요.')
    setBusy(true)
    setError(null)
    const r = await signUp({ email, password: pw, kind: 'staff' })
    if (r.error) { setBusy(false); return setError(r.error) }
    if (r.needsConfirm) {
      setBusy(false)
      setDone('가입 메일을 보냈습니다. 메일의 링크로 인증한 뒤 로그인하세요. (Supabase Auth 설정에서 "Confirm email"을 끄면 이 단계가 생략됩니다)')
      return
    }
    if (bootstrap) {
      const { error } = await supabase!.rpc('bootstrap_store', { p_store_name: storeName.trim(), p_owner_name: name.trim() })
      if (error) { setBusy(false); return setError(errMsg(error)) }
      await refreshRole()
    } else {
      // 초대 행 연결은 가입 트리거가 처리. 이름은 초대 시 대표가 정한 값을 사용.
      await refreshRole()
    }
    setBusy(false)
  }

  if (done) return <p className="text-sm text-mint leading-relaxed">{done}</p>

  return (
    <div className="space-y-3">
      {bootstrap && (
        <Field label="매장 이름">
          <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="예: 강남 1호점" autoFocus />
        </Field>
      )}
      <Field label={bootstrap ? '대표 이름' : '이름'}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 홍길동" />
      </Field>
      <Field label="이메일">
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com" />
      </Field>
      <Field label="비밀번호 (6자 이상)">
        <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </Field>
      {error && <div className="text-sm text-rose">{error}</div>}
      <Btn variant="primary" className="w-full" onClick={submit} disabled={busy}>
        {busy ? '처리 중…' : bootstrap ? '매장 개설하고 시작' : '가입'}
      </Btn>
    </div>
  )
}

/** 이미 로그인된 계정으로 매장만 개설 (이메일 인증 후 재로그인한 경우) */
function BootstrapForm() {
  const [storeName, setStoreName] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!storeName.trim()) return setError('매장 이름을 입력해주세요.')
    setBusy(true)
    const { error } = await supabase!.rpc('bootstrap_store', { p_store_name: storeName.trim(), p_owner_name: name.trim() || '대표' })
    setBusy(false)
    if (error) return setError(errMsg(error))
    await refreshRole()
  }

  return (
    <div className="space-y-3">
      <Field label="매장 이름">
        <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="예: 강남 1호점" autoFocus />
      </Field>
      <Field label="대표 이름">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 홍길동" />
      </Field>
      {error && <div className="text-sm text-rose">{error}</div>}
      <Btn variant="primary" className="w-full" onClick={submit} disabled={busy}>{busy ? '처리 중…' : '매장 개설'}</Btn>
      <Btn variant="ghost" className="w-full" onClick={() => signOut()}>로그아웃</Btn>
    </div>
  )
}
