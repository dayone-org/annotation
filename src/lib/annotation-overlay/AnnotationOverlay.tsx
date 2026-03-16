import { createPortal } from 'react-dom'
import { CheckCircleIcon, XIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from '@/components/ui/popover'
import { AnnotationProvider } from './AnnotationContext'
import type { AnnotationOverlayProps } from './types'
import { formatTimestamp, getInitials, rectToViewport } from './utils'
import { AnnotationComposer } from './components/AnnotationComposer'
import { InteractionLayer } from './components/InteractionLayer'
import { CommentMarkers } from './components/CommentMarkers'
import { AnnotationPanel } from './components/AnnotationPanel'
import { useAnnotation } from './useAnnotation'
import { cn } from '../utils'

type ThreadCommentProps = {
  isRoot?: boolean
  isResolved?: boolean
  author: string
  createdAt: string
  text: string
  onToggleResolved?: () => void
}

function ThreadComment({
  author,
  createdAt,
  isResolved = false,
  isRoot = false,
  onToggleResolved,
  text,
}: ThreadCommentProps) {
  return (
    <article
      className="flex flex-col gap-1 p-4 border-b border-border bg-background">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(author)}</AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <strong className="text-sm text-foreground">{author}</strong>
              <span>{formatTimestamp(createdAt)}</span>
            </div>
          </div>
          {isRoot && onToggleResolved ? (
            <Button
              aria-label={isResolved ? 'Mark annotation as open' : 'Resolve annotation'}
              className={isResolved ? 'opacity-50' : ''}
              onClick={onToggleResolved}
              size="icon"
              type="button"
              variant="ghost"
            >
              <CheckCircleIcon />
            </Button>
          ) : null}
        </div>
        <p className="text-sm leading-6 text-foreground">{text}</p>
      </div>
    </article >
  )
}

function AnnotationComposerPopover() {
  const { closeComposer, comments, composer, errorMessage, submitComment, toggleResolved } = useAnnotation()

  if (!composer || !composer.rect) {
    return null
  }

  const rect = rectToViewport(composer.rect)
  const parentComment = composer.parentId ? comments.find((comment) => comment.id === composer.parentId) ?? null : null
  const threadComments = parentComment
    ? comments.filter((comment) => comment.id === parentComment.id || comment.parent_id === parentComment.id)
    : []

  const handleToggleResolved = () => {
    if (parentComment) {
      void toggleResolved(parentComment.id)
    }
  }

  return (
    <Popover onOpenChange={(open) => !open && closeComposer()} open>
      <PopoverAnchor asChild>
        <div
          className="fixed"
          data-annotation-overlay-root="true"
          style={{
            height: rect.height,
            left: rect.left,
            top: rect.top,
            width: rect.width,
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="center"
        className="w-[min(22rem,calc(100vw-2rem))] bg-muted p-0 overflow-hidden"
        collisionPadding={16}
        data-annotation-overlay-root="true"
        sideOffset={12}
      >
        <PopoverHeader>
          <PopoverTitle className="sr-only">{parentComment ? 'Reply to annotation' : 'New annotation'}</PopoverTitle>
        </PopoverHeader>
        {parentComment ? (
          <div className="border-b border-border bg-muted/50">
            <ScrollArea className="max-h-[min(18rem,40vh)]">
              <div className="flex flex-col">
                {threadComments.map((comment) => (
                  <ThreadComment
                    author={comment.author}
                    createdAt={comment.created_at}
                    isResolved={comment.resolved}
                    isRoot={comment.id === parentComment.id}
                    key={comment.id}
                    onToggleResolved={comment.id === parentComment.id ? handleToggleResolved : undefined}
                    text={comment.text}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : null}
        <div className={cn('p-2', !parentComment && 'bg-background')}>
          <AnnotationComposer errorMessage={errorMessage} onSubmit={submitComment} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function AnnotationOverlayScene() {
  const { cancelCommentMode, commentMode, composer } = useAnnotation()

  return createPortal(
    <div className="relative z-2147483600" data-annotation-overlay-root="true">
      <InteractionLayer />
      <CommentMarkers />
      {commentMode && !composer ? (
        <Button
          aria-label="Exit comment mode"
          className="fixed bottom-6 left-1/2 z-2147483602 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border shadow-lg"
          onClick={cancelCommentMode}
          type="button"
          variant="secondary"
        >
          Comment mode active
          <XIcon weight="bold" />
        </Button>
      ) : null}
      <AnnotationComposerPopover />
      <AnnotationPanel />
    </div>,
    document.body,
  )
}

export function AnnotationOverlay(props: AnnotationOverlayProps) {
  if (typeof document === 'undefined') {
    return null
  }

  return (
    <AnnotationProvider {...props}>
      <AnnotationOverlayScene />
    </AnnotationProvider>
  )
}
