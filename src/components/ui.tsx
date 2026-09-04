import { useEffect, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'

// ── 버튼 ──────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'soft' | 'ghost' | 'danger' | 'gold'

const btnStyles: Record<BtnVariant, string> = {
  primary: 'bg-mint text-mintink font-semibold hover:brightness-110',
  soft: 'bg-surface2 text-ink border border-line2 hover:border-mint/50 hover:text-mint',
  ghost: 'text-mut hover:text-ink hover:bg-surface2',
  danger: 'bg-surface2 text-rose border border-line2 hover:border-rose/60',
  gold: 'bg-gold text-goldink font-semibold hover:brightness-110',
}

export function Btn({
  variant = 'soft',
  sm,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; sm?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        sm ? 'px-3 py-1.5 text-[16px]' : 'px-4 py-2.5 text-sm'
      } ${btnStyles[variant]} ${className}`}
      {...rest}
    />
  )
}

// ── 카드/타이틀 ───────────────────────────────────────────────────────────

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`card ${className}`}>{children}</div>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-[24px] font-bold tracking-tight">{children}</h2>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}

// ── 배지 ──────────────────────────────────────────────────────────────────

export function Badge({
  tone = 'mut',
  children,
}: {
  tone?: 'mint' | 'gold' | 'rose' | 'sky' | 'mut' | 'viol'
  children: ReactNode
}) {
  const tones = {
    mint: 'bg-mint/12 text-mint border-mint/30',
    gold: 'bg-gold/12 text-gold border-gold/30',
    rose: 'bg-rose/12 text-rose border-rose/30',
    sky: 'bg-sky/12 text-sky border-sky/30',
    viol: 'bg-viol/12 text-viol border-viol/30',
    mut: 'bg-surface2 text-mut border-line2',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[14px] font-semibold whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  )
}

// ── 입력 ──────────────────────────────────────────────────────────────────

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full bg-surface2 border border-line2 rounded-xl px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-mint/60 outline-none transition-colors ${className}`}
      {...rest}
    />
  )
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full bg-surface2 border border-line2 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-mint/60 ${className}`}
      {...rest}
    >
      {children}
    </select>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[15px] font-semibold text-mut mb-1.5 tracking-wide">{label}</span>
      {children}
    </label>
  )
}

// ── 세그먼트 컨트롤 ───────────────────────────────────────────────────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex bg-surface2 border border-line rounded-xl p-1 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3.5 py-1.5 rounded-lg text-[16px] font-medium transition-colors ${
            value === o.value ? 'bg-mint text-mintink' : 'text-mut hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── 모달 ──────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  side,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
  side?: boolean // 우측 드로어 형태
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  if (side) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div
          role="dialog"
          aria-modal="true"
          className="relative glass-panel border-l border-line w-full max-w-md h-full overflow-y-auto p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold tracking-tight">{title}</h3>
            <button onClick={onClose} aria-label="닫기" className="text-mut hover:text-ink text-xl leading-none px-1">
              ×
            </button>
          </div>
          {children}
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative card glass-panel w-full ${wide ? 'max-w-3xl' : 'max-w-md'} p-6 my-auto`}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold tracking-tight">{title}</h3>
          <button onClick={onClose} aria-label="닫기" className="text-mut hover:text-ink text-xl leading-none px-1">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

// ── 빈 상태 ───────────────────────────────────────────────────────────────

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="py-12 text-center text-mut text-sm border border-dashed border-line rounded-2xl">{children}</div>
  )
}

// ── 통계 타일 ─────────────────────────────────────────────────────────────

export function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: 'mint' | 'gold' | 'sky' | 'viol' }) {
  const color = accent ? { mint: 'text-mint', gold: 'text-gold', sky: 'text-sky', viol: 'text-viol' }[accent] : 'text-ink'
  return (
    <div className="bg-surface2/60 border border-line rounded-xl px-4 py-3">
      <div className="text-[15px] font-semibold text-mut">{label}</div>
      <div className={`mt-1 text-2xl font-bold num ${color}`}>{value}</div>
    </div>
  )
}

// ── 페이지네이션 ──────────────────────────────────────────────────────────

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      <Btn sm variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="이전 페이지">‹</Btn>
      {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          onClick={() => onPage(p)}
          className={`w-8 h-8 rounded-lg text-[16px] font-semibold ${
            p === page ? 'bg-mint text-mintink' : 'text-mut hover:text-ink hover:bg-surface2'
          }`}
        >
          {p}
        </button>
      ))}
      <Btn sm variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="다음 페이지">›</Btn>
    </div>
  )
}
