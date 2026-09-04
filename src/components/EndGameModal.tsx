import { useMemo, useState } from 'react'
import type { Game } from '../types'
import { useStore } from '../store'
import { Btn, Modal } from './ui'
import Avatar from './Avatar'

/** 게임 종료 모달 — 남은 참가자의 최종 순위를 지정한 뒤 종료(프라이즈·RP 지급) */
export default function EndGameModal({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const members = useStore((s) => s.members)
  const endGame = useStore((s) => s.endGame)

  const playing = useMemo(
    () =>
      game.entries
        .filter((e) => e.status === 'playing')
        .sort((a, b) => a.table - b.table || a.seat - b.seat),
    [game.entries],
  )

  // 1위부터의 순서 (초기값: 좌석 순)
  const [order, setOrder] = useState<string[]>(() => playing.map((e) => e.memberId))

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
  }

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    const err = await endGame(game.id, order)
    setBusy(false)
    if (err) return setError(err)
    onClose()
  }

  const nameOf = (id: string) => members.find((m) => m.id === id)

  return (
    <Modal open={open} onClose={onClose} title="게임 종료 — 최종 순위 확정">
      {playing.length === 0 ? (
        <p className="text-sm text-mut leading-relaxed">
          남은 참가자가 없습니다. 탈락 순서대로 이미 기록된 순위로 게임을 종료하고, 프라이즈와 RP를 지급합니다.
        </p>
      ) : (
        <>
          <p className="text-sm text-mut leading-relaxed mb-4">
            남은 참가자 <b className="text-ink">{playing.length}명</b>의 최종 순위를 정해주세요 (위가 1위).
            프라이즈와 RP가 이 순위대로 자동 지급됩니다.
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {order.map((id, i) => {
              const m = nameOf(id)
              if (!m) return null
              return (
                <div key={id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-line bg-surface2/50">
                  <span className={`w-9 text-center font-bold num ${i === 0 ? 'text-gold' : 'text-mut'}`}>{i + 1}위</span>
                  <Avatar emoji={m.emoji} color={m.color} size={26} />
                  <span className="text-sm font-semibold">{m.nickname}</span>
                  <span className="ml-auto flex gap-1">
                    <Btn sm variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="순위 올리기">▲</Btn>
                    <Btn sm variant="ghost" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="순위 내리기">▼</Btn>
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
      {error && <div className="text-sm text-rose mt-3">{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={onClose}>취소</Btn>
        <Btn variant="danger" onClick={submit} disabled={busy}>{busy ? '처리 중…' : '종료 및 지급'}</Btn>
      </div>
    </Modal>
  )
}
