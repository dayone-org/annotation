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
  portalContainer: Element | DocumentFragment | null;
  text: string;
  onToggleResolved?: () => void;
  onRemove?: () => void;
};

function ThreadComment({
  author,
  createdAt,
  isResolved = false,
  isRoot = false,
  portalContainer,
  onRemove,
  onToggleResolved,
  text,
}: ThreadCommentProps) {
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  return (
    <article className="annotation:flex annotation:flex-col annotation:gap-1 annotation:border-b annotation:border-border annotation:bg-background annotation:p-4">
      <div className="annotation:flex annotation:flex-col annotation:gap-2">
        <div className="annotation:flex annotation:items-center annotation:justify-between annotation:gap-3">
          <div className="annotation:flex annotation:items-center annotation:gap-2 annotation:text-xs annotation:text-muted-foreground">
            <strong className="annotation:text-sm annotation:text-foreground">{author}</strong>
            <span>{formatTimestamp(createdAt)}</span>
          </div>
          {isRoot && (onToggleResolved || onRemove) ? (
            <div className="annotation:flex annotation:items-center annotation:gap-1">
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
                    className="annotation:z-2147483604 annotation:w-32 annotation:p-1"
                    data-annotation-overlay-root="true"
                    data-annotation-overlay-scene="true"
                    portalContainer={portalContainer}
                    sideOffset={4}
                  >
                    <Button
                      className="annotation:w-full annotation:justify-start"
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
                  className={isResolved ? "annotation:opacity-50" : ""}
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
        <p className="annotation:text-sm annotation:leading-6 annotation:text-foreground">{text}</p>
      </div>
    </article>
  );
}

function ComposerPopover({
  portalContainer,
}: {
  portalContainer: Element | DocumentFragment | null;
}) {
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
          className="annotation:absolute annotation:top-0 annotation:left-0"
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
        className="annotation:z-2147483603 annotation:w-[min(22rem,calc(100vw-2rem))] annotation:overflow-hidden annotation:bg-muted annotation:p-0"
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
        portalContainer={portalContainer}
        sideOffset={12}
      >
        <PopoverHeader>
          <PopoverTitle className="annotation:sr-only">
            {parentComment ? "Reply to annotation" : "New annotation"}
          </PopoverTitle>
        </PopoverHeader>
        {parentComment ? (
          <div>
            <ScrollArea className="annotation:max-h-[min(18rem,40vh)]">
              <div className="annotation:flex annotation:flex-col">
                {threadComments.map((comment) => (
                  <ThreadComment
                    author={comment.author}
                    createdAt={comment.created_at}
                    isResolved={comment.resolved}
                    isRoot={comment.id === parentComment.id}
                    key={comment.id}
                    portalContainer={portalContainer}
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
        <div className={cn("annotation:p-2", !parentComment && "annotation:bg-background")}>
          <AnnotationComposer errorMessage={errorMessage} onSubmit={submitComment} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AnnotationOverlayScene({
  portalContainer,
  position,
}: {
  portalContainer: Element | DocumentFragment | null;
  position?: AnnotationPosition;
}) {
  return (
    <div
      className="annotation:absolute annotation:top-0 annotation:left-0 annotation:z-2147483600 annotation:h-px annotation:w-px"
      data-annotation-overlay-root="true"
      data-annotation-overlay-scene="true"
    >
      <InteractionLayer />
      <CommentMarkers />
      <ComposerPopover portalContainer={portalContainer} />
      <AnnotationDock defaultPosition={position} />
    </div>
  );
}

export function AnnotationOverlay(props: AnnotationOverlayProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.setAttribute("data-dayone-annotation-host", "true");
    document.body.appendChild(host);
    setPortalContainer(host);

    return () => {
      setPortalContainer((current) => (current === host ? null : current));
      host.remove();
    };
  }, []);

  if (!portalContainer) {
    return null;
  }

  return createPortal(
    <AnnotationProvider {...props}>
      <AnnotationOverlayScene portalContainer={portalContainer} position={props.position} />
    </AnnotationProvider>,
    portalContainer,
  );
}
