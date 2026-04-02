import { CheckCircleIcon, DotsThreeVerticalIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
import type { AnnotationOverlayProps, AnnotationPosition } from "./types";
import { cn } from "../utils";
import { AnnotationProvider } from "./AnnotationProvider";
import { AnnotationComposer } from "./components/AnnotationComposer";
import { AnnotationDock } from "./components/AnnotationDock";
import { CommentMarkers } from "./components/CommentMarkers";
import { InteractionLayer } from "./components/InteractionLayer";
import { useAnnotation } from "./useAnnotation";
import { formatTimestamp } from "./utils";

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
    <article className="flex flex-col gap-1 border-b border-border bg-background p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <strong className="text-sm text-foreground">{author}</strong>
            <span>{formatTimestamp(createdAt)}</span>
          </div>
          {isRoot && (onToggleResolved || onRemove) ? (
            <div className="flex items-center gap-1">
              {onRemove && (
                <Popover onOpenChange={setIsActionsOpen} open={isActionsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      aria-label="Annotation actions"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <DotsThreeVerticalIcon />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="z-2147483604 w-32 p-1"
                    data-annotation-overlay-root="true"
                    data-annotation-overlay-scene="true"
                    sideOffset={4}
                  >
                    <Button
                      className="w-full justify-start"
                      onClick={() => {
                        setIsActionsOpen(false);
                        onRemove();
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  </PopoverContent>
                </Popover>
              )}
              {onToggleResolved && (
                <Button
                  aria-label={isResolved ? "Mark annotation as open" : "Resolve annotation"}
                  className={isResolved ? "opacity-50" : ""}
                  onClick={onToggleResolved}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <CheckCircleIcon />
                </Button>
              )}
            </div>
          ) : null}
        </div>
        <p className="text-sm leading-6 text-foreground">{text}</p>
      </div>
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

  const handleToggleResolved = () => {
    if (parentComment) {
      void toggleResolved(parentComment.id);
    }
  };

  const handleRemoveThread = () => {
    if (parentComment) {
      void removeThread(parentComment.id);
    }
  };

  return (
    <Popover onOpenChange={(open) => !open && closeComposer()} open>
      <PopoverAnchor asChild>
        <div
          className="absolute top-0 left-0"
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
        className="z-2147483603 w-[min(22rem,calc(100vw-2rem))] overflow-hidden bg-muted p-0"
        collisionPadding={16}
        data-annotation-overlay-root="true"
        data-annotation-overlay-scene="true"
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
          <PopoverTitle className="sr-only">
            {parentComment ? "Reply to annotation" : "New annotation"}
          </PopoverTitle>
        </PopoverHeader>
        {parentComment ? (
          <div>
            <ScrollArea className="max-h-[min(18rem,40vh)]">
              <div className="flex flex-col">
                {threadComments.map((comment) => (
                  <ThreadComment
                    author={comment.author}
                    createdAt={comment.created_at}
                    isResolved={comment.resolved}
                    isRoot={comment.id === parentComment.id}
                    key={comment.id}
                    onRemove={comment.id === parentComment.id ? handleRemoveThread : undefined}
                    onToggleResolved={
                      comment.id === parentComment.id ? handleToggleResolved : undefined
                    }
                    text={comment.text}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : null}
        <div className={cn("p-2", !parentComment && "bg-background")}>
          <AnnotationComposer errorMessage={errorMessage} onSubmit={submitComment} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AnnotationOverlayScene({ position }: { position?: AnnotationPosition }) {
  return createPortal(
    <div
      className="absolute top-0 left-0 z-2147483600 h-px w-px"
      data-annotation-overlay-root="true"
      data-annotation-overlay-scene="true"
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
