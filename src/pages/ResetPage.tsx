import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hasSupabase, supabase } from '../lib/supabase'
import { authErrMsg, useAuth } from '../auth'
import { absUrl } from '../lib/url'
import { Btn, Field, Input } from '../components/ui'
import Splash from '../components/Splash'

function Shell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen stage-bg flex items-center justify-center p-6">
      <div className="card w-full max-w-sm p-8">
        <div className="font-extrabold tracking-tight text-lg text-center mb-1">♠ ALL-IN <span className="text-mint">ONE</span></div>
        <h1 className="text-center font-bold text-xl mt-3">{title}</h1>
        {sub && <p className="text-center text-[14px] text-mut mt-1.5 leading-relaxed">{sub}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

/** 비밀번호 재설정 메일 요청 (/reset) — 직원·회원 공용 */
export function ResetRequestPage() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  if (!hasSupabase || !supabase) return <Splash text="클라우드 모드에서만 사용할 수 있습니다" />
  const sb = supabase

  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setMsg({ ok: false, text: '올바른 이메일 주소를 입력해주세요.' })
    setBusy(true)
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: absUrl('/reset-password') })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: authErrMsg(error.message) })
    setMsg({ ok: true, text: '재설정 메일을 보냈습니다. 몇 분 내 도착하며, 스팸함도 확인해주세요. 메일의 링크를 누르면 새 비밀번호를 정할 수 있습니다.' })
  }

  return (
    <Shell title="비밀번호 재설정" sub="가입한 이메일로 재설정 링크를 보내드립니다.">
      <div className="space-y-3">
        <Field label="이메일">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Field>
        {msg && <div className={`text-sm leading-relaxed ${msg.ok ? 'text-mint' : 'text-rose'}`}>{msg.text}</div>}
        <Btn variant="primary" className="w-full" onClick={submit} disabled={busy || msg?.ok}>{busy ? '보내는 중…' : '재설정 메일 보내기'}</Btn>
      </div>
      <div className="mt-5 flex justify-between text-[13px]">
        <Link to="/" className="text-mut hover:text-ink">직원 로그인</Link>
        <Link to="/join" className="text-mut hover:text-ink">회원 로그인</Link>
      </div>
    </Shell>
  )
}

/** 메일 링크로 진입 (/reset-password) — 복구 세션으로 새 비밀번호 설정 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const session = useAuth((s) => s.session)
  const role = useAuth((s) => s.role)
  const status = useAuth((s) => s.status)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [waited, setWaited] = useState(false)

  // 링크의 토큰을 supabase-js가 세션으로 바꾸는 데 잠시 걸림
  useEffect(() => { const t = setTimeout(() => setWaited(true), 4000); return () => clearTimeout(t) }, [])

  if (!hasSupabase || !supabase) return <Splash text="클라우드 모드에서만 사용할 수 있습니다" />
  const sb = supabase
  if (!session) {
    if (status === 'loading' || !waited) return <Splash text="링크 확인 중…" />
    return (
      <Shell title="링크가 만료되었거나 잘못되었습니다" sub="재설정 메일을 다시 요청해주세요. 링크는 1시간 동안만 유효합니다.">
        <Link to="/reset" className="block"><Btn className="w-full">다시 요청</Btn></Link>
      </Shell>
    )
  }

  const submit = async () => {
    if (pw.length < 6) return setMsg({ ok: false, text: '비밀번호는 6자 이상이어야 합니다.' })
    if (pw !== pw2) return setMsg({ ok: false, text: '두 비밀번호가 일치하지 않습니다.' })
    setBusy(true)
    const { error } = await sb.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: authErrMsg(error.message) })
    setMsg({ ok: true, text: '비밀번호가 변경되었습니다. 잠시 후 이동합니다.' })
    setTimeout(() => navigate(role.kind === 'member' ? '/me' : '/', { replace: true }), 1200)
  }

  return (
    <Shell title="새 비밀번호 설정" sub={session.user.email ?? undefined}>
      <div className="space-y-3">
        <Field label="새 비밀번호 (6자 이상)">
          <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </Field>
        <Field label="새 비밀번호 확인">
          <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Field>
        {msg && <div className={`text-sm ${msg.ok ? 'text-mint' : 'text-rose'}`}>{msg.text}</div>}
        <Btn variant="primary" className="w-full" onClick={submit} disabled={busy || msg?.ok}>{busy ? '변경 중…' : '비밀번호 변경'}</Btn>
      </div>
    </Shell>
  )
}
