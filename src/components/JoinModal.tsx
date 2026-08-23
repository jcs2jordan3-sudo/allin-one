import { useMemo, useState } from 'react'
import type { BuyinType, Currency, Game } from '../types'
import { BUYIN_TYPE_LABEL, CURRENCY_LABEL, CURRENCY_UNIT } from '../types'
import { useStore } from '../store'
import { Btn, Field, Input, Modal, Segmented } from './ui'
import Avatar from './Avatar'

/** 참가 등록(바인/리바인/리엔트리) 모달 — 참가 조건 매트릭스 기반 결제 */
export default function JoinModal({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const members = useStore((s) => s.members)
  const joinGame = useStore((s) => s.joinGame)
  const [type, setType] = useState<BuyinType>('BUYIN')
  const [q, setQ] = useState('')
  const [memberId, setMemberId] = useState<string | null>(null)
  const [currency, setCurrency] = useState<Currency>('P')
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(() => {
    const inGame = new Map(game.entries.map((e) => [e.memberId, e.status]))
    return members
      .filter((m) => m.status === 'active')
      .filter((m) => {
        const st = inGame.get(m.id)
        if (type === 'BUYIN') return !st
        if (type === 'RE_BUYIN') return st === 'playing'
        return st === 'eliminated'
      })
      .filter((m) => !q || m.nickname.includes(q) || m.no.includes(q))
  }, [members, game, type, q])

  const round = useMemo(() => {
    if (!memberId || type === 'BUYIN') return 1
    return game.buyins.filter((b) => b.memberId === memberId && b.type === type).length + 1
  }, [game, memberId, type])

  const rule = game.snapshot.buyinRules.find((r) => r.type === type && r.round === round)

  const submit = () => {
    if (!memberId) return setError('회원을 선택해주세요.')
    const err = joinGame(game.id, memberId, type, currency)
    if (err) return setError(err)
    setError(null)
    setMemberId(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="참가 등록">
      <div className="space-y-4">
        <Segmented
          options={(['BUYIN', 'RE_BUYIN', 'RE_ENTRY'] as BuyinType[]).map((t) => ({ value: t, label: BUYIN_TYPE_LABEL[t] }))}
          value={type}
          onChange={(t) => { setType(t); setMemberId(null); setError(null) }}
        />
        <Field label="회원 검색">
          <Input placeholder="닉네임 혹은 번호" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
          {candidates.length === 0 && <div className="text-sm text-mut py-3 text-center">대상 회원이 없습니다</div>}
          {candidates.map((m) => (
            <button
              key={m.id}
              onClick={() => setMemberId(m.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors ${
                memberId === m.id ? 'border-mint/60 bg-mint/8' : 'border-line hover:border-line2'
              }`}
            >
              <Avatar emoji={m.emoji} color={m.color} size={28} />
              <span className="text-sm font-semibold">{m.nickname}</span>
              <span className="text-[13px] text-mut num">({m.no})</span>
              <span className="ml-auto text-[13px] text-mut num">
                {m.balances.P.toLocaleString()}P · {m.balances.S.toLocaleString()}S · {m.balances.V}장
              </span>
            </button>
          ))}
        </div>

        {rule ? (
          <div>
            <div className="text-[13px] font-semibold text-mut mb-1.5">
              결제 재화 선택 · {round}회차 {BUYIN_TYPE_LABEL[type]} → <span className="text-gold num">{rule.chips.toLocaleString()}칩</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['P', 'S', 'V'] as Currency[]).map((c) => {
                const cost = rule.cost[c]
                const disabled = cost === undefined
                return (
                  <button
                    key={c}
                    disabled={disabled}
                    onClick={() => setCurrency(c)}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-30 ${
                      currency === c ? 'border-mint/60 bg-mint/10 text-mint' : 'border-line2 text-mut hover:text-ink'
                    }`}
                  >
                    {CURRENCY_LABEL[c]}
                    <span className="block text-[13px] font-normal num">
                      {disabled ? '사용 불가' : `${cost}${CURRENCY_UNIT[c]}`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          memberId && <div className="text-sm text-rose">해당 회차 {BUYIN_TYPE_LABEL[type]} 규칙이 없습니다 (한도 초과).</div>
        )}

        {error && <div className="text-sm text-rose">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" onClick={submit} disabled={!memberId || !rule}>등록</Btn>
        </div>
      </div>
    </Modal>
  )
}
