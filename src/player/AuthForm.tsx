import { useState } from 'react'
import { Link } from 'react-router-dom'
import { signIn, signUp } from '../auth'
import { COLORS, EMOJIS } from '../lib/avatar'
import { formatPhone, isKrMobile } from '../lib/phone'
import { Btn, Field, Input, Segmented } from '../components/ui'
import Avatar from '../components/Avatar'

/** 회원 로그인/가입 폼 — QR 가입 페이지와 셀프 바인 페이지가 공용 */
export default function AuthForm({
  storeId,
  defaultMode = 'signup',
  onDone,
}: {
  storeId?: string
  defaultMode?: 'signup' | 'login'
  onDone: () => void
}) {
  const [mode, setMode] = useState<'signup' | 'login'>(defaultMode)
  const [realName, setRealName] = useState('')
  const [phone, setPhone] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[Math.floor(Math.random() * EMOJIS.length)])
  const [color, setColor] = useState(COLORS[Math.floor(Math.random() * COLORS.length)])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    if (mode === 'login') {
      if (!email.trim() || !pw) return setError('이메일과 비밀번호를 입력해주세요.')
      setBusy(true)
      const err = await signIn(email, pw)
      setBusy(false)
      if (err) return setError(err)
      onDone()
      return
    }
    // 가입: 이름·휴대폰·닉네임은 필수 (휴대폰은 알림 발송 기준이라 형식까지 검사)
    if (!realName.trim()) return setError('이름을 입력해주세요.')
    if (!isKrMobile(phone)) return setError('휴대폰 번호를 정확히 입력해주세요. (예: 010-1234-5678)')
    if (!nickname.trim()) return setError('닉네임을 입력해주세요.')
    if (!email.trim()) return setError('이메일을 입력해주세요.')
    if (pw.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.')
    setBusy(true)
    const r = await signUp({
      email, password: pw, kind: 'member',
      realName, phone: formatPhone(phone), nickname, emoji, color, storeId,
    })
    setBusy(false)
    if (r.error) return setError(r.error)
    if (r.needsConfirm) {
      setNotice('가입 메일을 보냈습니다. 메일의 링크로 인증한 뒤 로그인해주세요.')
      setMode('login')
      return
    }
    onDone()
  }

  return (
    <div className="space-y-4">
      <Segmented
        options={[
          { value: 'signup', label: '회원가입' },
          { value: 'login', label: '로그인' },
        ]}
        value={mode}
        onChange={(m) => { setMode(m); setError(null) }}
      />
      {notice && <div className="text-sm text-mint leading-relaxed">{notice}</div>}
      {mode === 'signup' && (
        <>
          <Field label="이름">
            <Input value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="실명" autoComplete="name" maxLength={20} />
          </Field>
          <Field label="휴대폰 번호">
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setPhone((p) => formatPhone(p))}
              placeholder="010-0000-0000"
            />
          </Field>
          <div className="flex items-center gap-3">
            <Avatar emoji={emoji} color={color} size={52} />
            <div className="flex-1 min-w-0">
              <Field label="닉네임">
                <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="게임에서 쓸 이름" maxLength={12} />
              </Field>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`w-9 h-9 rounded-xl border text-lg ${emoji === e ? 'border-mint/70 bg-mint/10' : 'border-line2'}`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`컬러 ${c}`}
                className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </>
      )}
      <Field label="이메일">
        <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </Field>
      <Field label={mode === 'signup' ? '비밀번호 (6자 이상)' : '비밀번호'}>
        <Input
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </Field>
      {error && <div className="text-sm text-rose">{error}</div>}
      <Btn variant="primary" className="w-full !py-3" onClick={submit} disabled={busy}>
        {busy ? '처리 중…' : mode === 'signup' ? '가입하고 시작하기' : '로그인'}
      </Btn>
      {mode === 'signup' ? (
        <p className="text-[14px] text-faint leading-relaxed">
          휴대폰 번호는 게임 시작·대기 호출 같은 매장 알림(카카오톡)에 사용되며, 이름과 함께 다른 회원에게는 보이지 않습니다.
          직원이 미리 등록해 둔 회원은 같은 번호로 가입하면 자동으로 연결됩니다. 만 19세 이상만 가입할 수 있습니다.
        </p>
      ) : (
        <div className="text-center"><Link to="/reset" className="text-[15px] text-mut hover:text-ink">비밀번호를 잊으셨나요?</Link></div>
      )}
    </div>
  )
}
