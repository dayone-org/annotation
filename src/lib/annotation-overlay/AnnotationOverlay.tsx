import { CheckCircleIcon, DotsThreeVerticalIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AnnotationOverlayProps, AnnotationPosition } from "./types";
import { AnnotationProvider } from "./AnnotationProvider";
import { AnnotationComposer } from "./components/AnnotationComposer";
import { AnnotationDock } from "./components/AnnotationDock";
import { CommentMarkers } from "./components/CommentMarkers";
import { InteractionLayer } from "./components/InteractionLayer";
import { annotationPortalLayerClass, annotationScopeClass, css, cx } from "./stitches";
import { useAnnotation } from "./useAnnotation";
import { formatTimestamp } from "./utils";

const threadCommentClass = css({
  backgroundColor: "var(--annotation-background)",
  borderBottom: "1px solid var(--annotation-border)",
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  padding: "1rem",
});

const threadCommentHeaderClass = css({
  alignItems: "center",
  display: "flex",
  gap: "0.75rem",
  justifyContent: "space-between",
});

const threadCommentMetaClass = css({
  alignItems: "center",
  color: "var(--annotation-muted-foreground)",
  display: "flex",
  fontSize: "0.75rem",
  gap: "0.5rem",
});

const threadCommentTextClass = css({
  color: "var(--annotation-foreground)",
  fontSize: "0.875rem",
  lineHeight: 1.6,
  margin: 0,
  whiteSpace: "pre-wrap",
});

const composerAnchorClass = css({
  left: 0,
  position: "absolute",
  top: 0,
});

const composerPopoverClass = css({
  backgroundColor: "var(--annotation-muted)",
  overflow: "hidden",
  padding: 0,
  width: "min(22rem, calc(100vw - 2rem))",
});

const composerThreadListClass = css({
  display: "flex",
  flexDirection: "column",
});

const composerBodyClass = css({
  padding: "0.5rem",
});

const composerBodyStandaloneClass = css({
  backgroundColor: "var(--annotation-background)",
});

type ThreadCommentProps = {
  isRoot?: boolean;
  isResolved?: boolean;
  author: string;
  createdAt: string;
  text: string;
  onToggleResolved?: () => void;
  onRemove?: () => void;
};

function ThreadComment({
  author,
  createdAt,
  isResolved = false,
  isRoot = false,
  onRemove,
  onToggleResolved,
  text,
}: ThreadCommentProps) {
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  return (
    <article className={threadCommentClass()}>
      <div className={threadCommentHeaderClass()}>
        <div className={threadCommentMetaClass()}>
          <strong style={{ color: "var(--annotation-foreground)", fontSize: "0.875rem" }}>
            {author}
          </strong>
          <span>{formatTimestamp(createdAt)}</span>
        </div>
        {isRoot && (onToggleResolved || onRemove) ? (
          <div style={{ alignItems: "center", display: "flex", gap: "0.25rem" }}>
            {onRemove ? (
              <Popover onOpenChange={setIsActionsOpen} open={isActionsOpen}>
                <PopoverTrigger asChild>
                  <Button aria-label="Annotation actions" size="icon" type="button" variant="ghost">
                    <DotsThreeVerticalIcon />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className={composerBodyClass()}
                  data-annotation-overlay-root="true"
                  sideOffset={4}
                  style={{ width: 128 }}
                >
                  <Button
                    onClick={() => {
                      setIsActionsOpen(false);
                      onRemove();
                    }}
                    size="sm"
                    style={{ justifyContent: "flex-start", width: "100%" }}
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </PopoverContent>
              </Popover>
            ) : null}
            {onToggleResolved ? (
              <Button
                aria-label={isResolved ? "Mark annotation as open" : "Resolve annotation"}
                onClick={onToggleResolved}
                size="icon"
                style={{ opacity: isResolved ? 0.5 : 1 }}
                type="button"
                variant="ghost"
              >
                <CheckCircleIcon />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className={threadCommentTextClass()}>{text}</p>
    </article>
  );
}

function ComposerPopover() {
  const {
    closeComposer,
    comments,
    composer,
    errorMessage,
    removeThread,
    submitComment,
    toggleResolved,
  } = useAnnotation();

  if (!composer || !composer.rect) {
    return null;
  }

  const parentComment = composer.parentId
    ? (comments.find((comment) => comment.id === composer.parentId) ?? null)
    : null;
  const threadComments = parentComment
    ? comments.filter(
        (comment) => comment.id === parentComment.id || comment.parent_id === parentComment.id,
      )
    : [];

  return (
    <Popover onOpenChange={(open) => !open && closeComposer()} open>
      <PopoverAnchor asChild>
        <div
          className={composerAnchorClass()}
          data-annotation-overlay-root="true"
          style={{
            height: composer.rect.height,
            transform: `translate3d(${composer.rect.pageX}px, ${composer.rect.pageY}px, 0)`,
            width: composer.rect.width,
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="center"
        className={composerPopoverClass()}
        collisionPadding={16}
        data-annotation-overlay-root="true"
        onInteractOutside={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest('[data-annotation-overlay-root="true"]')
          ) {
            event.preventDefault();
          }
        }}
        sideOffset={12}
      >
        <PopoverHeader>
          <PopoverTitle visuallyHidden>
            {parentComment ? "Reply to annotation" : "New annotation"}
          </PopoverTitle>
        </PopoverHeader>
        {parentComment ? (
          <div>
            <ScrollArea heightMode="composer">
              <div className={composerThreadListClass()}>
                {threadComments.map((comment) => (
                  <ThreadComment
                    author={comment.author}
                    createdAt={comment.created_at}
                    isResolved={comment.resolved}
                    isRoot={comment.id === parentComment.id}
                    key={comment.id}
                    onRemove={
                      comment.id === parentComment.id
                        ? () => {
                            void removeThread(parentComment.id);
                          }
                        : undefined
                    }
                    onToggleResolved={
                      comment.id === parentComment.id
                        ? () => {
                            void toggleResolved(parentComment.id);
                          }
                        : undefined
                    }
                    text={comment.text}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : null}
        <div
          className={`${composerBodyClass()} ${!parentComment ? composerBodyStandaloneClass() : ""}`.trim()}
        >
          <AnnotationComposer errorMessage={errorMessage} onSubmit={submitComment} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AnnotationOverlayScene({ position }: { position?: AnnotationPosition }) {
  return createPortal(
    <div
      className={cx(annotationScopeClass(), annotationPortalLayerClass())}
      data-annotation-overlay-root="true"
    >
      <InteractionLayer />
      <CommentMarkers />
      <ComposerPopover />
      <AnnotationDock defaultPosition={position} />
    </div>,
    document.body,
  );
}

export function AnnotationOverlay(props: AnnotationOverlayProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <AnnotationProvider {...props}>
      <AnnotationOverlayScene position={props.position} />
    </AnnotationProvider>
  );
}
