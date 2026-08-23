import { useState } from 'react'
import type { Game, PrizeRule } from '../types'
import { selTotalChips, useStore } from '../store'
import { fmtNum } from '../lib/format'
import { Btn, Field, Input, Modal } from './ui'

const CORRECTION_STEPS = [-10000, -1000, 1000, 10000]

/** 게임 수정 — 진행 중 게임의 이름·프라이즈·공지 수정 + 칩 보정·애드온 */
export default function GameEditModal({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const updateGame = useStore((s) => s.updateGame)
  const adjustChips = useStore((s) => s.adjustChips)

  const [name, setName] = useState(game.name)
  const [notice, setNotice] = useState(game.notice ?? '')
  const [prizes, setPrizes] = useState<PrizeRule[]>(() => game.snapshot.prizes.map((p) => ({ ...p })))
  const [pending, setPending] = useState(0) // 저장 시 확정되는 칩 보정값
  const [addon, setAddon] = useState('30000')
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const currentTotal = selTotalChips(game)

  const patchPrize = (i: number, amount: number) =>
    setPrizes(prizes.map((p, j) => (i === j ? { ...p, amount } : p)))

  const addAddon = () => {
    const n = parseInt(addon, 10) || 0
    const err = adjustChips(game.id, 'addon', n)
    if (err) return setError(err)
    setError(null)
    setMsg(`애드온 +${fmtNum(n)}칩이 반영되었습니다.`)
  }

  const submit = () => {
    if (!name.trim()) return setError('게임 이름을 입력해주세요.')
    if (pending !== 0) {
      const err = adjustChips(game.id, 'correction', pending)
      if (err) return setError(err)
    }
    updateGame(game.id, { name: name.trim(), notice: notice.trim(), prizes })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="게임 수정" wide>
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
        <Field label="게임 이름">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        {/* 프라이즈 설정 — 이 게임에만 적용 (게임 셋 원본은 유지) */}
        <div>
          <span className="text-[14px] font-bold block mb-2">
            프라이즈 설정 <span className="text-mut font-normal">· {prizes.length}등까지 제공 · 이 게임에만 적용</span>
          </span>
          <div className="space-y-2 max-w-xs">
            {prizes.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm text-mut w-10 num">{p.rank}등</span>
                <Input type="number" value={p.amount} onChange={(e) => patchPrize(i, +e.target.value)} />
                <span className="text-sm text-mut">P</span>
                <Btn sm variant="ghost" onClick={() => setPrizes(prizes.filter((_, j) => j !== i).map((x, j) => ({ ...x, rank: j + 1 })))}>✕</Btn>
              </div>
            ))}
            <Btn sm onClick={() => setPrizes([...prizes, { rank: prizes.length + 1, currency: 'P', amount: 1 }])}>+ 순위 추가</Btn>
          </div>
        </div>

        {/* 칩 보정 */}
        <div>
          <span className="text-[14px] font-bold block mb-2">칩 보정 <span className="text-mut font-normal">· 카운팅 오류 정정</span></span>
          <div className="flex flex-wrap gap-2 mb-3">
            {CORRECTION_STEPS.map((s) => (
              <Btn key={s} sm onClick={() => { setPending(pending + s); setMsg(null) }}>
                {s > 0 ? '+' : ''}{fmtNum(s)}
              </Btn>
            ))}
            <Btn sm variant="ghost" onClick={() => setPending(0)} disabled={pending === 0}>초기화</Btn>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            <div className="bg-surface2/60 border border-line rounded-xl px-3.5 py-2.5">
              <div className="text-[12px] text-faint">기존 전체 칩</div>
              <div className="font-bold num">{fmtNum(currentTotal)}</div>
            </div>
            <div className="bg-surface2/60 border border-line rounded-xl px-3.5 py-2.5">
              <div className="text-[12px] text-faint">조정값</div>
              <div className={`font-bold num ${pending > 0 ? 'text-mint' : pending < 0 ? 'text-rose' : ''}`}>
                {pending > 0 ? '+' : ''}{fmtNum(pending)}
              </div>
            </div>
            <div className="bg-surface2/60 border border-line rounded-xl px-3.5 py-2.5">
              <div className="text-[12px] text-faint">예상 칩</div>
              <div className="font-bold num text-gold">{fmtNum(currentTotal + pending)}</div>
            </div>
          </div>
          <div className="text-[13px] text-mut mt-2 num">
            누적 — 칩 보정 {game.correctionCount ?? 0}회 / 애드온 {game.addonCount ?? 0}회
          </div>
        </div>

        {/* 애드온 */}
        <div>
          <span className="text-[14px] font-bold block mb-2">애드온</span>
          <div className="flex items-end gap-2 max-w-xs">
            <Field label="애드온 칩">
              <Input type="number" min={1} value={addon} onChange={(e) => setAddon(e.target.value)} />
            </Field>
            <Btn variant="gold" onClick={addAddon}>애드온 추가</Btn>
          </div>
          <p className="text-[13px] text-mut mt-1.5">즉시 반영됩니다. 전광판 TOTAL STACKS에 합산됩니다.</p>
        </div>

        <Field label="공지사항 (전광판 NOTICE)">
          <Input value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="예: 오늘 1위 트로피 증정" />
        </Field>

        {msg && <div className="text-sm text-mint">{msg}</div>}
        {error && <div className="text-sm text-rose">{error}</div>}
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-line">
        <Btn variant="ghost" onClick={onClose}>취소</Btn>
        <Btn variant="primary" onClick={submit}>수정하기</Btn>
      </div>
    </Modal>
  )
}
