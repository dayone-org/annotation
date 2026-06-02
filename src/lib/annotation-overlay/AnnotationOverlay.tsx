import { CheckCircleIcon, DotsThreeVerticalIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
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
import type { AnnotationOverlayProps, AnnotationPosition, AnnotationScreenshot } from "./types";
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
  screenshot: AnnotationScreenshot | null;
  text: string;
  onOpenScreenshot: (screenshot: AnnotationScreenshot) => void;
  onToggleResolved?: () => void;
  onRemove?: () => void;
};

function ThreadComment({
  author,
  createdAt,
  isResolved = false,
  isRoot = false,
  portalContainer,
  screenshot,
  onOpenScreenshot,
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
        {text ? (
          <p className="annotation:text-sm annotation:leading-6 annotation:whitespace-pre-wrap annotation:text-foreground">
            {text}
          </p>
        ) : null}
        {screenshot ? (
          <button
            aria-label="Screenshot preview"
            className="annotation:block annotation:h-28 annotation:w-full annotation:overflow-hidden annotation:rounded-md annotation:border annotation:bg-muted annotation:p-0 annotation:ring-primary annotation:transition annotation:outline-none annotation:hover:brightness-95 annotation:focus-visible:ring-2"
            onClick={() => onOpenScreenshot(screenshot)}
            type="button"
          >
            <img
              alt={screenshot.name}
              className="annotation:h-full annotation:w-full annotation:object-cover"
              src={screenshot.data_url}
            />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ComposerPopover({
  onOpenScreenshot,
  portalContainer,
}: {
  onOpenScreenshot: (screenshot: AnnotationScreenshot) => void;
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
        className="annotation:z-2147483603 annotation:grid annotation:max-h-[min(32rem,calc(100vh-2rem))] annotation:w-[min(22rem,calc(100vw-2rem))] annotation:grid-rows-[minmax(0,1fr)_auto] annotation:overflow-hidden annotation:bg-muted annotation:p-0"
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
          <div className="annotation:min-h-0">
            <ScrollArea className="annotation:h-full annotation:max-h-[min(22rem,50vh)]">
              <div className="annotation:flex annotation:flex-col">
                {threadComments.map((comment) => (
                  <ThreadComment
                    author={comment.author}
                    createdAt={comment.created_at}
                    isResolved={comment.resolved}
                    isRoot={comment.id === parentComment.id}
                    key={comment.id}
                    portalContainer={portalContainer}
                    screenshot={comment.screenshot}
                    onOpenScreenshot={onOpenScreenshot}
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

function ScreenshotViewer({
  onClose,
  screenshot,
}: {
  onClose: () => void;
  screenshot: AnnotationScreenshot | null;
}) {
  return (
    <AnimatePresence>
      {screenshot ? (
        <motion.button
          aria-label="Close screenshot viewer"
          className="annotation:fixed annotation:inset-0 annotation:flex annotation:items-center annotation:justify-center annotation:bg-black/80 annotation:p-4 annotation:outline-none"
          data-annotation-overlay-root="true"
          data-annotation-overlay-scene="true"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={onClose}
          style={{ zIndex: 2147483647 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          type="button"
        >
          <img
            alt={screenshot.name}
            className="annotation:max-h-full annotation:max-w-full annotation:rounded-md annotation:object-contain annotation:shadow-2xl"
            src={screenshot.data_url}
          />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

function AnnotationOverlayScene({
  portalContainer,
  position,
}: {
  portalContainer: Element | DocumentFragment | null;
  position?: AnnotationPosition;
}) {
  const [viewerScreenshot, setViewerScreenshot] = useState<AnnotationScreenshot | null>(null);

  return (
    <>
      <div
        className="annotation:absolute annotation:top-0 annotation:left-0 annotation:z-2147483600 annotation:h-px annotation:w-px"
        data-annotation-overlay-root="true"
        data-annotation-overlay-scene="true"
      >
        <InteractionLayer />
        <CommentMarkers />
        <ComposerPopover onOpenScreenshot={setViewerScreenshot} portalContainer={portalContainer} />
        <AnnotationDock defaultPosition={position} />
      </div>
      <ScreenshotViewer onClose={() => setViewerScreenshot(null)} screenshot={viewerScreenshot} />
    </>
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
