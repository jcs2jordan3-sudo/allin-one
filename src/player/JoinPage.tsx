import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { hasSupabase } from '../lib/supabase'
import { signOut, useAuth } from '../auth'
import { Btn, Card } from '../components/ui'
import Splash from '../components/Splash'
import PlayerShell from './PlayerShell'
import AuthForm from './AuthForm'
import { fetchStoreName } from './api'

/** 매장 QR → 회원가입/로그인. ?s=매장id ?r=가입 후 이동 경로 */
export default function JoinPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const storeParam = params.get('s') ?? undefined
  const table = params.get('table')
  const seat = params.get('seat')
  const redirect = table ? `/checkin?table=${table}&seat=${seat ?? ''}` : params.get('r') || '/me'
  const status = useAuth((s) => s.status)
  const role = useAuth((s) => s.role)
  const session = useAuth((s) => s.session)
  const [store, setStore] = useState<{ id: string; name: string } | null | undefined>(undefined)

  useEffect(() => {
    if (!hasSupabase) return
    fetchStoreName(storeParam).then(setStore).catch(() => setStore(null))
  }, [storeParam])

  useEffect(() => {
    if (role.kind === 'member') navigate(redirect, { replace: true })
  }, [role, redirect, navigate])

  if (!hasSupabase) return <LocalNotice />
  if (status === 'loading' || store === undefined) return <Splash text="불러오는 중…" />

  if (role.kind === 'staff') {
    return (
      <PlayerShell storeName={store?.name}>
        <Card className="p-6 text-center space-y-3">
          <div className="font-bold">직원 계정으로 로그인되어 있습니다</div>
          <p className="text-sm text-mut">회원가입은 손님 본인의 휴대폰에서 진행해주세요.</p>
          <Link to="/" className="block"><Btn className="w-full">관리자 콘솔로</Btn></Link>
          <Btn variant="ghost" className="w-full" onClick={() => signOut()}>로그아웃</Btn>
        </Card>
      </PlayerShell>
    )
  }

  if (session && role.kind === 'none') {
    return (
      <PlayerShell storeName={store?.name}>
        <Card className="p-6 text-center space-y-3">
          <div className="font-bold">회원 정보를 찾을 수 없습니다</div>
          <p className="text-sm text-mut leading-relaxed">가입은 됐지만 회원 정보가 만들어지지 않았습니다. 카운터 직원에게 문의해주세요.</p>
          <Btn variant="ghost" className="w-full" onClick={() => signOut()}>로그아웃</Btn>
        </Card>
      </PlayerShell>
    )
  }

  return (
    <PlayerShell storeName={store?.name}>
      <div className="text-center pt-2 pb-1">
        <h1 className="text-2xl font-black tracking-tight">{store?.name ?? '매장'} 회원가입</h1>
        <p className="text-sm text-mut mt-1">
          {table ? `TABLE ${table} · ${seat}번 좌석 QR입니다. 가입 또는 로그인하면 이 자리에 체크인됩니다.` : '가입하면 포인트 지갑이 생기고, 전광판 QR로 바로 바인할 수 있어요.'}
        </p>
      </div>
      <Card className="p-5">
        <AuthForm storeId={store?.id} onDone={() => navigate(redirect, { replace: true })} />
      </Card>
    </PlayerShell>
  )
}

export function LocalNotice() {
  return (
    <Splash
      text="이 기능은 클라우드 모드에서만 사용할 수 있습니다"
      sub="관리자가 Supabase를 연결하면(SUPABASE_SETUP.md) 회원가입·셀프 바인이 활성화됩니다."
    />
  )
}
