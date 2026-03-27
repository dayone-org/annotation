import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircleIcon, DotsThreeVerticalIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AnnotationProvider } from "./AnnotationContext";
import type { AnnotationOverlayProps } from "./types";
import { formatTimestamp, rectToViewport } from "./utils";
import { AnnotationComposer } from "./components/AnnotationComposer";
import { InteractionLayer } from "./components/InteractionLayer";
import { CommentMarkers } from "./components/CommentMarkers";
import { AnnotationPanel } from "./components/AnnotationPanel";
import { useAnnotation } from "./useAnnotation";
import { cn } from "../utils";

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

function AnnotationComposerPopover() {
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

  const rect = rectToViewport(composer.rect);
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
        className="z-2147483603 w-[min(22rem,calc(100vw-2rem))] overflow-hidden bg-muted p-0"
        collisionPadding={16}
        data-annotation-overlay-root="true"
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

function CommentModeCursor() {
  const { commentMode } = useAnnotation();

  useEffect(() => {
    const attributeName = "data-annotation-comment-mode";

    if (commentMode) {
      document.documentElement.setAttribute(attributeName, "true");
      return () => {
        document.documentElement.removeAttribute(attributeName);
      };
    }

    document.documentElement.removeAttribute(attributeName);

    return undefined;
  }, [commentMode]);

  return (
    <style>
      {`
        html[data-annotation-comment-mode="true"],
        html[data-annotation-comment-mode="true"] body,
        html[data-annotation-comment-mode="true"] body * {
          cursor: crosshair !important;
        }
      `}
    </style>
  );
}

function AnnotationOverlayScene() {
  const { cancelCommentMode, commentMode, composer } = useAnnotation();

  return createPortal(
    <div
      className="absolute h-px w-px top-0 left-0 z-2147483600"
      data-annotation-overlay-root="true"
    >
      <CommentModeCursor />
      <InteractionLayer />
      <CommentMarkers />
      {commentMode && !composer ? (
        <Button
          aria-label="Exit comment mode"
          className="fixed bottom-6 left-1/2 z-2147483602 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border shadow-lg"
          data-annotation-overlay-root="true"
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
  );
}

export function AnnotationOverlay(props: AnnotationOverlayProps) {
  if (typeof document === "undefined") {
    return null;
  }

  return (
    <AnnotationProvider {...props}>
      <AnnotationOverlayScene />
    </AnnotationProvider>
  );
}
