import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { hasSupabase, supabase } from '../lib/supabase'
import { absUrl } from '../lib/url'
import { withStore } from '../lib/storeUrl'
import { buildNotice, localNoticeStats, type NoticeStats } from '../lib/notice'
import type { NoticeSettings } from '../types'
import { Btn, Field, Input, Modal } from './ui'

/**
 * 카톡 공지 만들기 — 오늘의 현황 공지문을 자동 완성해 복사·공유한다.
 * 카카오톡은 단톡방에 글을 올리는 공식 API가 없어, 직원이 "공유" 또는 "복사"로 올리는 방식.
 */
export default function NoticeModal({ onClose }: { onClose: () => void }) {
  const st = useStore()
  const [draft, setDraft] = useState<NoticeSettings>(st.notice)
  const [stats, setStats] = useState<NoticeStats | null>(null)
  const [statsErr, setStatsErr] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // 통계: 클라우드는 서버(영업일 06시 기준), 로컬은 콘솔 상태로 계산
  useEffect(() => {
    let alive = true
    if (!hasSupabase) { setStats(localNoticeStats(st, Date.now())); return }
    supabase!.rpc('notice_stats').then(({ data, error }) => {
      if (!alive) return
      if (error) { setStatsErr('통계를 불러오지 못해 출석·전일 랭커는 비워 둡니다.'); setStats({ yesterdayTop: [], attendance: [] }); return }
      const r = data as { yesterdayTop?: { nickname: string }[]; attendance?: string[] }
      setStats({ yesterdayTop: (r.yesterdayTop ?? []).map((x) => x.nickname), attendance: r.attendance ?? [] })
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dealerNames = useMemo(() => st.managers.filter((m) => m.role === 'dealer').map((m) => m.name), [st.managers])
  const generated = useMemo(() => {
    if (!stats) return ''
    // 매장 전체 현황(/live)은 게임이 바뀌어도 주소가 같아 공지에 한 번만 넣는다
    const storeLiveUrl = absUrl(withStore('/live'))
    return buildNotice({ now: Date.now(), storeName: st.storeName, games: st.games, members: st.members, dealerNames, stats, settings: draft, storeLiveUrl })
  }, [stats, st.games, st.members, st.storeName, dealerNames, draft])
  useEffect(() => { if (!edited) setText(generated) }, [generated, edited])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2000) }
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); flash('복사했습니다. 카톡방에 붙여넣기 하세요.') } catch { flash('복사 실패 — 문구를 길게 눌러 직접 복사해주세요.') }
  }
  const share = async () => {
    if (!navigator.share) return copy()
    try { await navigator.share({ text }) } catch { /* 사용자가 취소 */ }
  }
  const saveSettings = async () => {
    setBusy(true)
    const err = await st.saveNotice(draft)
    setBusy(false)
    flash(err ?? '템플릿을 저장했습니다. 다른 직원 화면에도 적용됩니다.')
  }
  const set = (k: keyof NoticeSettings) => (v: string) => setDraft((d) => ({ ...d, [k]: v }))

  return (
    <Modal open onClose={onClose} title="카톡 공지 만들기" wide>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          <p className="text-[15px] text-mut leading-relaxed">
            오늘 영업일(06시 기준)의 게임 결과·진행 상황과 딜러, 전일 랭커, 전주 출석이 자동으로 채워집니다.
            매일 바뀌는 문구는 아래 칸에 적어 두면 그 자리에 들어갑니다.
          </p>
          {statsErr && <div className="text-[14px] text-rose">{statsErr}</div>}
          <Field label="첫 줄 ({요일} {매장명} {날짜} 사용 가능)">
            <Input value={draft.title} onChange={(e) => set('title')(e.target.value)} />
          </Field>
          <Field label="오늘 근무 딜러 (비우면 딜러 직원 전원)">
            <Input value={draft.dealers} onChange={(e) => set('dealers')(e.target.value)} placeholder={dealerNames.join(' ') || '예: 다라 진성 연이'} />
          </Field>
          <Field label="🔥 줄 (한 줄에 하나, {전일랭커} 사용 가능)">
            <textarea value={draft.lines} onChange={(e) => set('lines')(e.target.value)} rows={4}
              className="w-full bg-surface2 border border-line2 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-mint/60" />
          </Field>
          <Field label=": 안내 줄 (한 줄에 하나)">
            <textarea value={draft.notes} onChange={(e) => set('notes')(e.target.value)} rows={2}
              className="w-full bg-surface2 border border-line2 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-mint/60" />
          </Field>
          <button type="button" onClick={() => setShowSettings((v) => !v)} className="text-[14px] text-mut hover:text-ink underline">
            {showSettings ? '고급 설정 닫기' : '고급 설정 (출석 제목·마지막 줄)'}
          </button>
          {showSettings && (
            <>
              <Field label="출석 명단 제목 (비우면 명단 생략)">
                <Input value={draft.attendanceTitle} onChange={(e) => set('attendanceTitle')(e.target.value)} />
              </Field>
              <Field label="마지막 줄">
                <Input value={draft.footer} onChange={(e) => set('footer')(e.target.value)} placeholder="예: 문의는 카운터로" />
              </Field>
            </>
          )}
          <div className="flex gap-2 flex-wrap">
            <Btn sm onClick={saveSettings} disabled={busy}>{busy ? '저장 중…' : '템플릿 저장'}</Btn>
            <Btn sm variant="ghost" onClick={() => { setDraft(st.notice); setEdited(false) }}>저장된 값으로</Btn>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold tracking-widest text-faint">미리보기 · 직접 고쳐도 됩니다</span>
            {edited && <button type="button" onClick={() => setEdited(false)} className="text-[14px] text-mut hover:text-ink underline">다시 생성</button>}
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setEdited(true) }}
            rows={22}
            className="w-full bg-surface2 border border-line2 rounded-xl px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:border-mint/60 font-sans whitespace-pre-wrap"
          />
          <div className="flex gap-2 flex-wrap">
            <Btn variant="primary" onClick={share}>카카오톡으로 공유</Btn>
            <Btn onClick={copy}>복사</Btn>
            <Btn variant="ghost" onClick={onClose}>닫기</Btn>
          </div>
          {msg && <div className="text-[14px] text-mint">{msg}</div>}
          <p className="text-[13px] text-faint leading-relaxed">
            휴대폰에서는 "카카오톡으로 공유"를 누르면 카톡 앱이 열리고 방을 고르면 바로 올라갑니다. PC에서는 복사해서 붙여넣으세요.
          </p>
        </div>
      </div>
    </Modal>
  )
}
