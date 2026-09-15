import { useCallback, useEffect, useRef, useState } from 'react'
import { hasSupabase } from '../lib/supabase'
import { fetchThread, sendChat, type ChatThread } from './api'
import { QUICK_TOPICS, useChat } from './chat'

const SEEN_KEY = 'aio-chat-seen' // 마지막으로 읽은 관리자 답장 id

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16H5.5A1.5 1.5 0 0 1 4 14.5v-9Z" fill="currentColor" />
      <circle cx="9" cy="10" r="1.2" fill="#2fd6a0" /><circle cx="12" cy="10" r="1.2" fill="#2fd6a0" /><circle cx="15" cy="10" r="1.2" fill="#2fd6a0" />
    </svg>
  )
}

const readSeen = () => {
  try { return localStorage.getItem(SEEN_KEY) } catch { return null }
}
const writeSeen = (id: string) => {
  try { localStorage.setItem(SEEN_KEY, id) } catch { /* 무시 */ }
}
const timeOf = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * 도입 상담 채팅 — 방문자는 로그인 없이 문의하고, 답장은 개발자 콘솔(/dev)에서 보낸다.
 * 열려 있으면 5초, 닫혀 있고 대화가 있으면 1분마다 새 답장을 확인한다.
 */
export default function ChatWidget() {
  const { open, draft, openWith, close, setDraft } = useChat()
  const [thread, setThread] = useState<ChatThread | null>(null)
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unread, setUnread] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const openRef = useRef(open)
  openRef.current = open

  const load = useCallback(async () => {
    const t = await fetchThread()
    if (!t) return
    setThread(t)
    const lastAdmin = [...t.messages].reverse().find((m) => m.sender === 'admin')
    if (!lastAdmin) return
    if (openRef.current) {
      writeSeen(lastAdmin.id)
      setUnread(false)
    } else {
      setUnread(readSeen() !== lastAdmin.id)
    }
  }, [])

  const count = thread?.messages.length ?? 0
  useEffect(() => { if (hasSupabase) void load() }, [load])
  useEffect(() => {
    if (!hasSupabase || (!open && count === 0)) return
    if (open) void load()
    const id = setInterval(() => void load(), open ? 5000 : 60000)
    return () => clearInterval(id)
  }, [open, count, load])
  useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [open, count])
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    const r = await sendChat(body, name, contact)
    setSending(false)
    if (r.error) {
      setError(r.error)
      return
    }
    setThread(r.thread)
    setDraft('')
  }

  const hasThread = count > 0

  return (
    <>
      {!open && (
        <button
          onClick={() => openWith()}
          className="fixed z-50 right-4 bottom-4 sm:right-6 sm:bottom-6 h-[52px] w-[52px] sm:w-auto sm:px-5 justify-center bg-mint text-mintink font-bold text-[16px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] flex items-center gap-2 hover:brightness-110"
          aria-label="도입 문의 채팅 열기"
        >
          <ChatIcon />
          <span className="hidden sm:inline">문의하기</span>
          {unread && <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-rose border-2 border-bg" aria-label="새 답장" />}
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="도입 상담 채팅"
          className="fixed z-50 inset-x-3 bottom-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[390px] h-[min(80vh,620px)] flex flex-col bg-[#0b0f16] border border-line2 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.9)]"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <div className="min-w-0">
              <div className="font-bold text-[17px]">ALL-IN ONE 도입 상담</div>
              <div className="text-[14px] text-mut truncate">남겨주시면 확인하는 대로 답변드려요</div>
            </div>
            <button onClick={close} aria-label="채팅 닫기" className="text-mut hover:text-ink text-[26px] leading-none px-1">×</button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {!hasSupabase && <p className="text-[15px] text-mut">채팅 문의는 온라인 서비스에서 사용할 수 있습니다.</p>}
            {hasSupabase && !hasThread && (
              <div className="space-y-3">
                <p className="text-[15px] text-mut leading-relaxed">
                  요금·도입 방법·무료 체험 등 궁금한 점을 남겨주세요. 답변은 이 창에 표시되고, 연락처를 남기시면 그쪽으로도 연락드립니다.
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TOPICS.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => { setDraft(t.text); inputRef.current?.focus() }}
                      className="px-3 py-1.5 border border-line2 text-[15px] text-ink hover:border-mint/60 hover:text-mint whitespace-nowrap"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {thread?.messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === 'visitor' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3.5 py-2.5 border ${m.sender === 'visitor' ? 'bg-mint/12 border-mint/30' : 'bg-surface2 border-line'}`}>
                  {m.sender === 'admin' && <div className="text-[13px] font-bold text-mint mb-0.5">ALL-IN ONE</div>}
                  <div className="text-[15px] whitespace-pre-wrap break-words leading-relaxed">{m.body}</div>
                  <div className="text-[12px] text-faint mt-1 text-right">{timeOf(m.at)}</div>
                </div>
              </div>
            ))}
            {hasThread && thread!.messages[thread!.messages.length - 1].sender === 'visitor' && (
              <p className="text-[13px] text-faint text-center">문의가 접수됐어요. 답변이 오면 여기에 표시됩니다.</p>
            )}
          </div>

          {hasSupabase && (
            <div className="border-t border-line p-3 space-y-2">
              {!hasThread && (
                <div className="grid grid-cols-2 gap-2">
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="이름 (선택)"
                    className="w-full bg-surface2 border border-line2 px-3 py-2 text-[15px] placeholder:text-faint focus:border-mint/60 outline-none" />
                  <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={80} placeholder="휴대폰·이메일 (선택)"
                    className="w-full bg-surface2 border border-line2 px-3 py-2 text-[15px] placeholder:text-faint focus:border-mint/60 outline-none" />
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  rows={draft.includes('\n') ? 4 : 2}
                  maxLength={2000}
                  placeholder="문의 내용을 입력하세요"
                  className="flex-1 resize-none bg-surface2 border border-line2 px-3 py-2 text-[15px] placeholder:text-faint focus:border-mint/60 outline-none"
                />
                <button
                  onClick={() => void send()}
                  disabled={!draft.trim() || sending}
                  className="h-[44px] px-4 bg-mint text-mintink font-bold text-[15px] disabled:opacity-40 whitespace-nowrap"
                >
                  {sending ? '전송 중' : '보내기'}
                </button>
              </div>
              {error && <p className="text-[14px] text-rose">{error}</p>}
            </div>
          )}
        </div>
      )}
    </>
  )
}
