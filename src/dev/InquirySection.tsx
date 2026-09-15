import { useCallback, useEffect, useRef, useState } from 'react'
import { fmtDateTime } from '../lib/format'
import { Badge, Btn, Card, Modal } from '../components/ui'
import { adminInquiries, adminInquiryMessages, adminInquiryReply, type AdminInquiry, type AdminInquiryMessage } from './api'

const ts = (iso: string) => fmtDateTime(new Date(iso).getTime())

/** 개발자 콘솔 — 마케팅 사이트 채팅 문의 목록과 답장 (목록 15초, 열린 대화 5초마다 새로고침) */
export default function InquirySection() {
  const [list, setList] = useState<AdminInquiry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await adminInquiries()
    setError(r.error)
    setList(r.list)
  }, [])
  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 15000)
    return () => clearInterval(id)
  }, [load])

  const unread = list?.filter((i) => i.unread).length ?? 0
  const current = list?.find((i) => i.id === openId) ?? null

  return (
    <section>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold">
            채팅 문의 {list && <span className="text-mut font-semibold">{list.length}</span>}
            {unread > 0 && <span className="ml-2 align-middle"><Badge tone="rose">새 문의 {unread}</Badge></span>}
          </h2>
          <p className="text-[15px] text-mut">소개 사이트(/intro) 채팅으로 들어온 문의입니다. 답장은 방문자 채팅창에 표시됩니다.</p>
        </div>
        <Btn sm onClick={() => void load()}>새로고침</Btn>
      </div>
      {error && <div className="text-sm text-rose mb-2">{error}</div>}
      {!list && !error && <div className="text-mut text-sm">불러오는 중…</div>}
      {list?.length === 0 && <div className="text-mut text-sm">아직 문의가 없습니다.</div>}
      <div className="space-y-2">
        {list?.map((i) => (
          <button key={i.id} onClick={() => setOpenId(i.id)} className="block w-full text-left">
            <Card className={`p-4 hover:border-mint/50 ${i.unread ? 'border-mint/50' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-bold">{i.name || '이름 없음'}</span>
                {i.contact && <span className="text-[15px] text-mut">{i.contact}</span>}
                {i.unread && <Badge tone="rose">안 읽음</Badge>}
                <span className="ml-auto text-[14px] text-faint">{ts(i.lastAt)}</span>
              </div>
              {i.last && (
                <p className="mt-1 text-[15px] text-mut line-clamp-2 whitespace-pre-wrap">
                  {i.last.sender === 'admin' ? '↳ 답장: ' : ''}{i.last.body}
                </p>
              )}
            </Card>
          </button>
        ))}
      </div>
      {current && <ThreadModal inquiry={current} onClose={() => { setOpenId(null); void load() }} />}
    </section>
  )
}

function ThreadModal({ inquiry, onClose }: { inquiry: AdminInquiry; onClose: () => void }) {
  const [messages, setMessages] = useState<AdminInquiryMessage[]>([])
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const r = await adminInquiryMessages(inquiry.id)
    if (r.error) setError(r.error)
    else setMessages(r.list)
  }, [inquiry.id])
  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 5000)
    return () => clearInterval(id)
  }, [load])
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  const send = async () => {
    if (!reply.trim() || busy) return
    setBusy(true)
    const err = await adminInquiryReply(inquiry.id, reply)
    setBusy(false)
    if (err) return setError(err)
    setReply('')
    void load()
  }

  return (
    <Modal open onClose={onClose} title={`${inquiry.name || '이름 없음'}${inquiry.contact ? ` · ${inquiry.contact}` : ''}`} wide>
      <div ref={listRef} className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3.5 py-2.5 border ${m.sender === 'admin' ? 'bg-mint/12 border-mint/30' : 'bg-surface2 border-line'}`}>
              <div className="text-[15px] whitespace-pre-wrap break-words leading-relaxed">{m.body}</div>
              <div className="text-[12px] text-faint mt-1 text-right">{m.sender === 'admin' ? '내 답장 · ' : ''}{ts(m.at)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-end gap-2">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send() }
          }}
          rows={3}
          maxLength={2000}
          placeholder="답장 입력 (Ctrl+Enter 보내기)"
          className="flex-1 resize-none bg-surface2 border border-line2 px-3 py-2 text-[15px] placeholder:text-faint focus:border-mint/60 outline-none"
        />
        <Btn variant="primary" onClick={() => void send()} disabled={!reply.trim() || busy}>{busy ? '보내는 중' : '답장'}</Btn>
      </div>
      {error && <p className="mt-2 text-sm text-rose">{error}</p>}
    </Modal>
  )
}
