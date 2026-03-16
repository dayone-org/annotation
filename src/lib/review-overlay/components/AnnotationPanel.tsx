import { useState } from 'react'
import { ChatCircleTextIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
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
      className="grid gap-3 rounded-xl border border-border bg-muted/40 p-3"
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
      <label className="grid gap-2 text-sm font-medium text-foreground">
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
      className={cn(
        'grid gap-3 rounded-xl border p-3 transition',
        isActive ? 'border-primary/40 bg-muted/50' : 'border-border bg-background',
      )}
    >
      <button className="grid grid-cols-[auto_1fr] gap-3 text-left" onClick={() => scrollToComment(comment.id)} type="button">
        <Avatar>
          <AvatarFallback>{getInitials(comment.author)}</AvatarFallback>
        </Avatar>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <strong className="text-sm text-foreground">{comment.author}</strong>
            <span>{formatTimestamp(comment.created_at)}</span>
            <Badge variant={comment.resolved ? 'secondary' : 'default'}>{comment.resolved ? 'Resolved' : 'Open'}</Badge>
          </div>
          <p className="text-sm leading-6 text-foreground">{comment.text}</p>
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
        <div className="ml-4 grid gap-3 border-l border-border pl-4">
          {replies.map((reply) => (
            <button
              key={reply.id}
              className="grid grid-cols-[auto_1fr] gap-3 text-left"
              onClick={() => scrollToComment(reply.id)}
              type="button"
            >
              <Avatar size="sm">
                <AvatarFallback>{getInitials(reply.author)}</AvatarFallback>
              </Avatar>
              <div className="grid gap-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <strong className="text-sm text-foreground">{reply.author}</strong>
                  <span>{formatTimestamp(reply.created_at)}</span>
                </div>
                <p className="text-sm leading-6 text-foreground">{reply.text}</p>
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
          className="fixed bottom-6 right-6 z-[2147483602]"
          onClick={() => setPanelOpen(true)}
          type="button"
        >
          <ChatCircleTextIcon data-icon="inline-start" weight="fill" />
          Annotation
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary-foreground/15 px-1 text-[11px]">
            {openThreads.length + resolvedThreads.length}
          </span>
        </Button>
      ) : null}

      <Sheet onOpenChange={setPanelOpen} open={isPanelOpen}>
        <SheetContent data-review-overlay-root="true">
          <SheetHeader>
            <SheetTitle>Page annotations</SheetTitle>
            <SheetDescription>{currentPath}</SheetDescription>
          </SheetHeader>

          {!author ? (
            <AuthorGate />
          ) : (
            <>
              <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4">
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

                <p className="text-sm text-muted-foreground">
                  {commentMode
                    ? 'Click any element on the page to anchor a new annotation. Press Esc to cancel.'
                    : 'Click a thread to scroll to its target. Press R to resolve the focused thread.'}
                </p>

                {composer && composer.parentId === null ? (
                  <Composer label="New annotation" onCancel={closeComposer} onSubmit={submitComment} />
                ) : null}
              </div>

              {errorMessage ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMessage}
                </div>
              ) : null}

              <Separator />

              <ScrollArea className="grid min-h-0 gap-5 pr-1">
                <section className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Open</h3>
                    <Badge variant="outline">{openThreads.length}</Badge>
                  </div>

                  {isLoading ? <p className="text-sm text-muted-foreground">Loading annotations…</p> : null}
                  {!isLoading && openThreads.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No open annotations for this page yet.</p>
                  ) : null}
                  {!isLoading
                    ? openThreads.map((comment) => (
                        <ThreadCard activeThreadId={activeThreadId} comment={comment} comments={comments} key={comment.id} />
                      ))
                    : null}
                </section>

                <section className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Resolved</h3>
                    <Badge variant="secondary">{resolvedThreads.length}</Badge>
                  </div>

                  {!showResolved ? (
                    <p className="text-sm text-muted-foreground">Resolved threads are hidden until you toggle them on.</p>
                  ) : null}
                  {showResolved && resolvedThreads.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No resolved annotations on this page.</p>
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
