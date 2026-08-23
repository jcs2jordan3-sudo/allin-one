import { useState } from 'react'
import type { BlindLevel, BuyinType, GameSet } from '../types'
import { BUYIN_TYPE_LABEL } from '../types'
import { useStore } from '../store'
import { Btn, Field, Input, Modal, Select } from './ui'

/** 게임 셋 편집기 — 레벨 스트럭쳐 / 레지 마감 / 참가 조건 / 얼리버드 / 프라이즈 */
export default function GameSetEditor({ gameSet, onClose }: { gameSet: GameSet; onClose: () => void }) {
  const saveGameSet = useStore((s) => s.saveGameSet)
  const [gs, setGs] = useState<GameSet>(() => JSON.parse(JSON.stringify(gameSet)))

  const patchLevel = (i: number, patch: Partial<BlindLevel>) =>
    setGs({ ...gs, levels: gs.levels.map((l, j) => (i === j ? { ...l, ...patch } : l)) })

  const relabel = (levels: BlindLevel[]): BlindLevel[] => {
    let lv = 0
    let br = 0
    return levels.map((l) => ({ ...l, label: l.type === 'break' ? `BREAK ${++br}` : `Level ${++lv}` }))
  }

  const addLevel = (type: BlindLevel['type']) => {
    const last = [...gs.levels].reverse().find((l) => l.type === 'level')
    const next: BlindLevel =
      type === 'break'
        ? { type, label: '', durationMin: 10, sb: 0, bb: 0, ante: 0, colorUp: 500 }
        : { type, label: '', durationMin: 7, sb: (last?.sb ?? 100) * 2, bb: (last?.bb ?? 200) * 2, ante: last?.ante ?? 0 }
    setGs({ ...gs, levels: relabel([...gs.levels, next]) })
  }

  const removeLevel = (i: number) => {
    const levels = relabel(gs.levels.filter((_, j) => j !== i))
    setGs({ ...gs, levels, regCloseLevelIndex: Math.min(gs.regCloseLevelIndex, levels.length - 1) })
  }

  const patchRule = (i: number, field: 'chips' | 'P' | 'S' | 'V', value: number) =>
    setGs({
      ...gs,
      buyinRules: gs.buyinRules.map((r, j) => {
        if (i !== j) return r
        if (field === 'chips') return { ...r, chips: value }
        return { ...r, cost: { ...r.cost, [field]: value } }
      }),
    })

  return (
    <Modal open onClose={onClose} title="게임 셋 수정" wide>
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
        <Field label="게임 셋 이름">
          <Input value={gs.name} onChange={(e) => setGs({ ...gs, name: e.target.value })} />
        </Field>

        {/* 게임 스트럭쳐 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[14px] font-bold">게임 스트럭쳐</span>
            <div className="flex gap-2">
              <Btn sm onClick={() => addLevel('level')}>+ 레벨</Btn>
              <Btn sm onClick={() => addLevel('break')}>+ 브레이크</Btn>
            </div>
          </div>
          <div className="overflow-x-auto border border-line rounded-xl">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-mut border-b border-line">
                  <th className="px-3 py-2">구분</th>
                  <th className="px-2 py-2 w-20">시간(분)</th>
                  <th className="px-2 py-2 w-24">SB</th>
                  <th className="px-2 py-2 w-24">BB</th>
                  <th className="px-2 py-2 w-24">ANTE</th>
                  <th className="px-2 py-2 w-24">칩 제거</th>
                  <th className="px-2 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {gs.levels.map((l, i) => (
                  <tr key={i} className={`border-b border-line/50 last:border-0 ${l.type === 'break' ? 'bg-gold/5' : ''}`}>
                    <td className={`px-3 py-1.5 font-semibold ${l.type === 'break' ? 'text-gold' : ''}`}>{l.label}</td>
                    <td className="px-2 py-1.5">
                      <Input type="number" value={l.durationMin} onChange={(e) => patchLevel(i, { durationMin: +e.target.value })} className="!px-2 !py-1" />
                    </td>
                    {l.type === 'break' ? (
                      <>
                        <td colSpan={3} className="px-3 py-1.5 text-gold/80 text-center">휴식 · 칩 제거</td>
                        <td className="px-2 py-1.5">
                          <Input type="number" value={l.colorUp ?? 0} onChange={(e) => patchLevel(i, { colorUp: +e.target.value })} className="!px-2 !py-1" />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-1.5"><Input type="number" value={l.sb} onChange={(e) => patchLevel(i, { sb: +e.target.value })} className="!px-2 !py-1" /></td>
                        <td className="px-2 py-1.5"><Input type="number" value={l.bb} onChange={(e) => patchLevel(i, { bb: +e.target.value })} className="!px-2 !py-1" /></td>
                        <td className="px-2 py-1.5"><Input type="number" value={l.ante} onChange={(e) => patchLevel(i, { ante: +e.target.value })} className="!px-2 !py-1" /></td>
                        <td className="px-2 py-1.5 text-center text-faint">—</td>
                      </>
                    )}
                    <td className="px-2 py-1.5">
                      <button onClick={() => removeLevel(i)} className="text-mut hover:text-rose" aria-label="레벨 삭제">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 max-w-xs">
            <Field label="레지 마감 레벨 (도달 시 신규 참가 차단)">
              <Select value={gs.regCloseLevelIndex} onChange={(e) => setGs({ ...gs, regCloseLevelIndex: +e.target.value })}>
                {gs.levels.map((l, i) => (
                  <option key={i} value={i}>{l.label}</option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        {/* 참가 조건 */}
        <div>
          <span className="text-[14px] font-bold block mb-2">참가 조건 (재화별 비용 → 지급 칩)</span>
          <div className="overflow-x-auto border border-line rounded-xl">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-mut border-b border-line">
                  <th className="px-3 py-2">구분</th>
                  <th className="px-2 py-2 w-16">회차</th>
                  <th className="px-2 py-2 w-24">포인트</th>
                  <th className="px-2 py-2 w-24">시드</th>
                  <th className="px-2 py-2 w-24">음료권</th>
                  <th className="px-2 py-2 w-28">지급 칩</th>
                </tr>
              </thead>
              <tbody>
                {gs.buyinRules.map((r, i) => (
                  <tr key={i} className="border-b border-line/50 last:border-0">
                    <td className="px-3 py-1.5 font-semibold">{BUYIN_TYPE_LABEL[r.type as BuyinType]}</td>
                    <td className="px-2 py-1.5 num">{r.round}</td>
                    <td className="px-2 py-1.5"><Input type="number" value={r.cost.P ?? 0} onChange={(e) => patchRule(i, 'P', +e.target.value)} className="!px-2 !py-1" /></td>
                    <td className="px-2 py-1.5"><Input type="number" value={r.cost.S ?? 0} onChange={(e) => patchRule(i, 'S', +e.target.value)} className="!px-2 !py-1" /></td>
                    <td className="px-2 py-1.5"><Input type="number" value={r.cost.V ?? 0} onChange={(e) => patchRule(i, 'V', +e.target.value)} className="!px-2 !py-1" /></td>
                    <td className="px-2 py-1.5"><Input type="number" value={r.chips} onChange={(e) => patchRule(i, 'chips', +e.target.value)} className="!px-2 !py-1" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 얼리버드 · 프라이즈 */}
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <span className="text-[14px] font-bold block mb-2">얼리버드 (참가 레벨별 보너스 칩)</span>
            <div className="space-y-2">
              {gs.earlyBird.map((eb, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={eb.levelIndex}
                    onChange={(e) => setGs({ ...gs, earlyBird: gs.earlyBird.map((x, j) => (i === j ? { ...x, levelIndex: +e.target.value } : x)) })}
                    className="w-32"
                  >
                    {gs.levels.map((l, li) => (
                      <option key={li} value={li}>{l.label}</option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    value={eb.chips}
                    onChange={(e) => setGs({ ...gs, earlyBird: gs.earlyBird.map((x, j) => (i === j ? { ...x, chips: +e.target.value } : x)) })}
                  />
                  <Btn sm variant="ghost" onClick={() => setGs({ ...gs, earlyBird: gs.earlyBird.filter((_, j) => j !== i) })}>✕</Btn>
                </div>
              ))}
              <Btn sm onClick={() => setGs({ ...gs, earlyBird: [...gs.earlyBird, { levelIndex: 0, chips: 5000 }] })}>+ 추가</Btn>
            </div>
          </div>
          <div>
            <span className="text-[14px] font-bold block mb-2">프라이즈 (순위별 포인트)</span>
            <div className="space-y-2">
              {gs.prizes.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-mut w-12 num">{p.rank}위</span>
                  <Input
                    type="number"
                    value={p.amount}
                    onChange={(e) => setGs({ ...gs, prizes: gs.prizes.map((x, j) => (i === j ? { ...x, amount: +e.target.value } : x)) })}
                  />
                  <Btn sm variant="ghost" onClick={() => setGs({ ...gs, prizes: gs.prizes.filter((_, j) => j !== i).map((x, j) => ({ ...x, rank: j + 1 })) })}>✕</Btn>
                </div>
              ))}
              <Btn sm onClick={() => setGs({ ...gs, prizes: [...gs.prizes, { rank: gs.prizes.length + 1, currency: 'P', amount: 1 }] })}>+ 추가</Btn>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-line">
        <Btn variant="ghost" onClick={onClose}>취소</Btn>
        <Btn variant="primary" onClick={() => { saveGameSet(gs); onClose() }}>저장</Btn>
      </div>
    </Modal>
  )
}
