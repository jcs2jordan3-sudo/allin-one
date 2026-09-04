import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { authErrMsg } from '../auth'
import { Btn, Field, Input } from './ui'

/** 로그인된 계정의 비밀번호 변경 (클라우드 모드) */
export default function PasswordChange({ compact }: { compact?: boolean }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (pw.length < 6) return setMsg({ ok: false, text: '비밀번호는 6자 이상이어야 합니다.' })
    if (pw !== pw2) return setMsg({ ok: false, text: '두 비밀번호가 일치하지 않습니다.' })
    if (!supabase) return setMsg({ ok: false, text: '클라우드 모드에서만 사용할 수 있습니다.' })
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: authErrMsg(error.message) })
    setPw('')
    setPw2('')
    setMsg({ ok: true, text: '비밀번호가 변경되었습니다.' })
  }

  return (
    <div className="space-y-3">
      <div className={compact ? 'space-y-3' : 'grid sm:grid-cols-2 gap-3'}>
        <Field label="새 비밀번호 (6자 이상)">
          <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field label="새 비밀번호 확인">
          <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Field>
      </div>
      {msg && <div className={`text-sm ${msg.ok ? 'text-mint' : 'text-rose'}`}>{msg.text}</div>}
      <div className={compact ? '' : 'flex justify-end'}>
        <Btn variant="primary" className={compact ? 'w-full' : ''} onClick={submit} disabled={busy}>{busy ? '변경 중…' : '비밀번호 변경'}</Btn>
      </div>
    </div>
  )
}
