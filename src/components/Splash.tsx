/** 전체 화면 로딩/안내 */
export default function Splash({ text, sub }: { text?: string; sub?: string }) {
  return (
    <div className="min-h-screen stage-bg flex flex-col items-center justify-center gap-3 text-center px-6">
      <div className="font-extrabold tracking-tight text-lg">
        ♠ ALL-IN <span className="text-mint">ONE</span>
      </div>
      {text && <div className="text-mut text-sm">{text}</div>}
      {sub && <div className="text-faint text-[13px] max-w-sm leading-relaxed">{sub}</div>}
    </div>
  )
}
