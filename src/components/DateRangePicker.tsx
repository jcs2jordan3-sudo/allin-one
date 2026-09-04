import type { DateRange } from '../types'
import { fmtDate } from '../lib/format'

const DAY = 86_400_000
const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }
const endOfDay = (ms: number) => startOfDay(ms) + DAY - 1

const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: '오늘', range: () => ({ from: startOfDay(Date.now()), to: endOfDay(Date.now()) }) },
  { label: '7일', range: () => ({ from: startOfDay(Date.now() - 6 * DAY), to: endOfDay(Date.now()) }) },
  { label: '30일', range: () => ({ from: startOfDay(Date.now() - 29 * DAY), to: endOfDay(Date.now()) }) },
  { label: '이번 달', range: () => { const d = new Date(); d.setDate(1); return { from: startOfDay(d.getTime()), to: endOfDay(Date.now()) } } },
  { label: '지난 달', range: () => { const d = new Date(); d.setDate(0); const to = endOfDay(d.getTime()); d.setDate(1); return { from: startOfDay(d.getTime()), to } } },
]

/** 조회 기간 선택 — 서버 조회 상한(거래내역·게임 기록) 대응 */
export default function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const parse = (s: string) => { const t = new Date(s + 'T00:00:00').getTime(); return isNaN(t) ? null : t }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        type="date"
        value={fmtDate(value.from)}
        onChange={(e) => { const t = parse(e.target.value); if (t !== null) onChange({ from: startOfDay(t), to: Math.max(value.to, endOfDay(t)) }) }}
        className="bg-surface2 border border-line2 rounded-lg px-2 py-1.5 text-[15px] num outline-none focus:border-mint/60"
      />
      <span className="text-faint text-[15px]">~</span>
      <input
        type="date"
        value={fmtDate(value.to)}
        onChange={(e) => { const t = parse(e.target.value); if (t !== null) onChange({ from: Math.min(value.from, startOfDay(t)), to: endOfDay(t) }) }}
        className="bg-surface2 border border-line2 rounded-lg px-2 py-1.5 text-[15px] num outline-none focus:border-mint/60"
      />
      {PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onChange(p.range())}
          className="px-2 py-1 rounded-full border border-line2 text-[14px] text-mut hover:text-ink hover:border-mint/50"
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
