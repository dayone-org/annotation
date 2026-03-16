import { useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Avatar } from '../../../components/ui/avatar'
import { Badge } from '../../../components/ui/badge'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { Separator } from '../../../components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../components/ui/sheet'
import { Textarea } from '../../../components/ui/textarea'
import { MessageSquarePlus } from 'lucide-react'
import { useAnnotation } from '../useAnnotation'
import type { AnnotationComment } from '../types'
import { formatTimestamp, getInitials, getReplies, getThreadRootId, getTopLevelComments } from '../utils'
import { AuthorGate } from './AuthorGate'

type ComposerProps = {
  label: string
  onCancel: () => void
  onSubmit: (text: string) => Promise<boolean>
}

function Composer({ label, onCancel, onSubmit }: ComposerProps) {
  const [value, setValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <form
      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!value.trim()) {
          return
        }

        setIsSubmitting(true)
        const didSave = await onSubmit(value)
        if (didSave) {
          setValue('')
        }
        setIsSubmitting(false)
      }}
    >
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        <span>{label}</span>
        <Textarea
          onChange={(event) => setValue(event.target.value)}
          placeholder="Add context, describe the issue, or suggest the change."
          rows={4}
          value={value}
        />
      </label>

      <div className="flex items-center justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button disabled={isSubmitting || !value.trim()} type="submit">
          {isSubmitting ? 'Saving…' : 'Post annotation'}
        </Button>
      </div>
    </form>
  )
}

type ThreadCardProps = {
  activeThreadId: string | null
  comment: AnnotationComment
  comments: AnnotationComment[]
}

function ThreadCard({ activeThreadId, comment, comments }: ThreadCardProps) {
  const { closeComposer, composer, openReplyComposer, scrollToComment, toggleResolved, submitComment } = useAnnotation()

  const replies = getReplies(comments, comment.id)
  const isActive = activeThreadId === comment.id
  const commentMap = new Map(comments.map((item) => [item.id, item]))
  const replyTargetId = composer?.parentId ? getThreadRootId(composer.parentId, commentMap) : null
  const isReplying = replyTargetId === comment.id

  return (
    <article
      className={[
        'grid gap-3 rounded-xl border p-3 transition',
        isActive ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      <button className="grid grid-cols-[auto_1fr] gap-3 text-left" onClick={() => scrollToComment(comment.id)} type="button">
        <Avatar>{getInitials(comment.author)}</Avatar>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <strong className="text-sm text-slate-900">{comment.author}</strong>
            <span>{formatTimestamp(comment.created_at)}</span>
            <Badge variant={comment.resolved ? 'secondary' : 'default'}>{comment.resolved ? 'Resolved' : 'Open'}</Badge>
          </div>
          <p className="text-sm leading-6 text-slate-700">{comment.text}</p>
        </div>
      </button>

      <div className="flex items-center gap-2">
        <Button onClick={() => openReplyComposer(comment.id)} size="sm" type="button" variant="secondary">
          Reply
        </Button>
        <Button onClick={() => void toggleResolved(comment.id)} size="sm" type="button" variant="outline">
          {comment.resolved ? 'Unresolve' : 'Resolve'}
        </Button>
      </div>

      {replies.length > 0 ? (
        <div className="ml-4 grid gap-3 border-l border-slate-200 pl-4">
          {replies.map((reply) => (
            <button
              key={reply.id}
              className="grid grid-cols-[auto_1fr] gap-3 text-left"
              onClick={() => scrollToComment(reply.id)}
              type="button"
            >
              <Avatar className="h-8 w-8 text-[11px]">{getInitials(reply.author)}</Avatar>
              <div className="grid gap-1">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <strong className="text-sm text-slate-900">{reply.author}</strong>
                  <span>{formatTimestamp(reply.created_at)}</span>
                </div>
                <p className="text-sm leading-6 text-slate-700">{reply.text}</p>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {isReplying ? <Composer label="Reply" onCancel={closeComposer} onSubmit={submitComment} /> : null}
    </article>
  )
}

export function AnnotationPanel() {
  const {
    activeThreadId,
    author,
    cancelCommentMode,
    commentMode,
    comments,
    composer,
    currentPath,
    errorMessage,
    isLoading,
    isPanelOpen,
    setPanelOpen,
    setShowResolved,
    showResolved,
    startCommentMode,
    submitComment,
    closeComposer,
  } = useAnnotation()

  const topLevelComments = getTopLevelComments(comments)
  const openThreads = topLevelComments.filter((comment) => !comment.resolved)
  const resolvedThreads = topLevelComments.filter((comment) => comment.resolved)

  return (
    <>
      {!isPanelOpen ? (
        <Button
          className="fixed bottom-6 right-6 z-[2147483602] rounded-full shadow-lg shadow-slate-900/25"
          onClick={() => setPanelOpen(true)}
          type="button"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Annotation
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/15 px-1 text-[11px]">
            {openThreads.length + resolvedThreads.length}
          </span>
        </Button>
      ) : null}

      <Sheet onOpenChange={setPanelOpen} open={isPanelOpen}>
        <SheetContent data-review-overlay-root="true">
          <SheetHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Annotation overlay</p>
            <SheetTitle>Page annotations</SheetTitle>
            <SheetDescription>{currentPath}</SheetDescription>
          </SheetHeader>

          {!author ? (
            <AuthorGate />
          ) : (
            <>
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      if (commentMode) {
                        cancelCommentMode()
                      } else {
                        startCommentMode()
                      }
                    }}
                    type="button"
                  >
                    {commentMode ? 'Cancel comment mode' : '+ New annotation (C)'}
                  </Button>
                  <Button onClick={() => setShowResolved(!showResolved)} type="button" variant="outline">
                    {showResolved ? 'Hide resolved' : 'Show resolved'}
                  </Button>
                </div>

                <p className="text-sm text-slate-500">
                  {commentMode
                    ? 'Click any element on the page to anchor a new annotation. Press Esc to cancel.'
                    : 'Click a thread to scroll to its target. Press R to resolve the focused thread.'}
                </p>

                {composer && composer.parentId === null ? (
                  <Composer label="New annotation" onCancel={closeComposer} onSubmit={submitComment} />
                ) : null}
              </div>

              {errorMessage ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {errorMessage}
                </div>
              ) : null}

              <Separator />

              <ScrollArea className="grid min-h-0 gap-5 pr-1">
                <section className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Open</h3>
                    <Badge variant="outline">{openThreads.length}</Badge>
                  </div>

                  {isLoading ? <p className="text-sm text-slate-500">Loading annotations…</p> : null}
                  {!isLoading && openThreads.length === 0 ? (
                    <p className="text-sm text-slate-500">No open annotations for this page yet.</p>
                  ) : null}
                  {!isLoading
                    ? openThreads.map((comment) => (
                        <ThreadCard activeThreadId={activeThreadId} comment={comment} comments={comments} key={comment.id} />
                      ))
                    : null}
                </section>

                <section className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Resolved</h3>
                    <Badge variant="secondary">{resolvedThreads.length}</Badge>
                  </div>

                  {!showResolved ? (
                    <p className="text-sm text-slate-500">Resolved threads are hidden until you toggle them on.</p>
                  ) : null}
                  {showResolved && resolvedThreads.length === 0 ? (
                    <p className="text-sm text-slate-500">No resolved annotations on this page.</p>
                  ) : null}
                  {showResolved
                    ? resolvedThreads.map((comment) => (
                        <ThreadCard activeThreadId={activeThreadId} comment={comment} comments={comments} key={comment.id} />
                      ))
                    : null}
                </section>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
