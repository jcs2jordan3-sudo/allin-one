import { useState } from 'react'
import { useStore } from '../store'
import type { EventPost } from '../types'
import { fmtDate } from '../lib/format'
import { Btn, Card, Empty, Field, Input, Modal, Pager, SectionTitle } from '../components/ui'

const PAGE_SIZE = 5

export default function EventsTab() {
  const events = useStore((s) => s.events)
  const removeEvent = useStore((s) => s.removeEvent)
  const [editing, setEditing] = useState<EventPost | 'new' | null>(null)
  const [confirmDel, setConfirmDel] = useState<EventPost | null>(null)
  const [page, setPage] = useState(1)

  const pages = Math.max(1, Math.ceil(events.length / PAGE_SIZE))
  const pageRows = events.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <SectionTitle right={<Btn sm variant="gold" onClick={() => setEditing('new')}>등록하기</Btn>}>이벤트&공지</SectionTitle>
      {pageRows.length === 0 ? (
        <Empty>등록된 이벤트·공지가 없습니다.</Empty>
      ) : (
        <div className="space-y-3">
          {pageRows.map((e) => (
            <Card key={e.id} className="p-5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold">{e.title}</div>
                {e.body && <p className="text-sm text-mut mt-1 whitespace-pre-wrap">{e.body}</p>}
                <div className="text-[12px] text-faint num mt-2">{fmtDate(e.createdAt)}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Btn sm onClick={() => setEditing(e)}>수정</Btn>
                <Btn sm variant="danger" onClick={() => setConfirmDel(e)}>삭제</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Pager page={page} pages={pages} onPage={setPage} />

      {editing && <EventModal post={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {confirmDel && (
        <Modal open onClose={() => setConfirmDel(null)} title="공지 삭제">
          <p className="text-sm text-mut leading-relaxed">
            "<b className="text-ink">{confirmDel.title}</b>" 을(를) 삭제할까요? 되돌릴 수 없습니다.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Btn variant="ghost" onClick={() => setConfirmDel(null)}>취소</Btn>
            <Btn variant="danger" onClick={() => { removeEvent(confirmDel.id); setConfirmDel(null) }}>삭제</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

function EventModal({ post, onClose }: { post: EventPost | null; onClose: () => void }) {
  const saveEvent = useStore((s) => s.saveEvent)
  const [title, setTitle] = useState(post?.title ?? '')
  const [body, setBody] = useState(post?.body ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (!title.trim()) return setError('제목을 입력해주세요.')
    saveEvent({ id: post?.id, title: title.trim(), body: body.trim() })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={post ? '이벤트 수정' : '이벤트 등록'}>
      <div className="space-y-4">
        <Field label="제목">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="공지 제목" />
        </Field>
        <Field label="내용">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="w-full bg-surface2 border border-line2 rounded-xl px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-mint/60 outline-none resize-y"
            placeholder="내용을 입력하세요"
          />
        </Field>
        {error && <div className="text-sm text-rose">{error}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="primary" onClick={submit}>저장</Btn>
        </div>
      </div>
    </Modal>
  )
}
