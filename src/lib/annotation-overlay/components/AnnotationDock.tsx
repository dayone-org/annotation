import {
  ArrowRightIcon,
  ChatsIcon,
  CheckCircleIcon,
  CheckIcon,
  CopySimpleIcon,
  GearSixIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemHeader } from "@/components/ui/item";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { errorMessageClass } from "@/components/ui/styles";
import { Switch } from "@/components/ui/switch";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type Variants,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import useMeasure from "react-use-measure";
import logo from "@/logo.svg";
import {
  getStorageKey,
  readStoredBoolean,
  readStoredString,
  writeStoredBoolean,
  writeStoredString,
} from "../storage";
import { css, cx } from "../stitches";
import type { AnnotationComment, AnnotationPosition } from "../types";
import {
  formatAnnotationCollectionMarkdown,
  formatAnnotationThreadMarkdown,
  formatTimestamp,
  getReplies,
  getTopLevelComments,
  measureRect,
} from "../utils";
import { useAnnotation } from "../useAnnotation";

type CopyState = "idle" | "copied" | "error";

type ResolveSliderIconState = "idle" | "loading";

type ResolveAllSliderProps = {
  onResolveAll: () => Promise<boolean>;
};

type ThreadCardProps = {
  activeThreadId: string | null;
  canManage: boolean;
  comment: AnnotationComment;
  comments: AnnotationComment[];
  currentPath: string;
};

const RESOLVE_ALL_COMPLETE_THRESHOLD = 0.96;
const DEFAULT_POSITION: AnnotationPosition = "bottom-right";
const POSITION_OPTIONS: Array<{ label: string; value: AnnotationPosition }> = [
  { label: "Top left", value: "top-left" },
  { label: "Top right", value: "top-right" },
  { label: "Bottom left", value: "bottom-left" },
  { label: "Bottom right", value: "bottom-right" },
];

const threadCardClass = css({
  backgroundColor: "var(--annotation-background)",
  transition: "border-color 150ms ease, opacity 150ms ease, background-color 150ms ease",
  "& [data-thread-card-actions='true']": {
    opacity: 0,
    transition: "opacity 150ms ease",
  },
  "&:hover [data-thread-card-actions='true']": {
    opacity: 1,
  },
});

const threadCardActiveClass = css({
  borderColor: "var(--annotation-primary)",
});

const threadCardResolvedClass = css({
  opacity: 0.5,
});

const threadCardHeaderClass = css({
  alignItems: "center",
  display: "flex",
  gap: "0.5rem",
  justifyContent: "space-between",
});

const threadCardActionsClass = css({
  alignItems: "center",
  display: "flex",
  gap: "0.125rem",
});

const threadCardBodyClass = css({
  display: "flex",
  flexDirection: "column",
  fontSize: "0.875rem",
  gap: "0.5rem",
});

const threadCardCopyClass = css({
  alignItems: "flex-start",
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
});

const threadAuthorClass = css({
  color: "var(--annotation-foreground)",
  fontWeight: 600,
  margin: 0,
});

const threadTextClass = css({
  color: "var(--annotation-muted-foreground)",
  margin: 0,
  whiteSpace: "pre-wrap",
});

const threadMetaClass = css({
  color: "var(--annotation-muted-foreground)",
  display: "flex",
  fontSize: "0.75rem",
  gap: "0.5rem",
  justifyContent: "space-between",
});

const resolveSliderTrackClass = css({
  backgroundColor: "var(--annotation-muted)",
  border: "1px solid var(--annotation-border)",
  borderRadius: "9999px",
  boxSizing: "content-box",
  height: 24,
  overflow: "hidden",
  position: "relative",
});

const resolveSliderFillClass = css({
  backgroundColor: "var(--annotation-primary)",
  borderRadius: "9999px",
  inset: "0 auto 0 0",
  position: "absolute",
});

const resolveSliderThumbClass = css({
  alignItems: "center",
  backgroundColor: "var(--annotation-background)",
  border: "1px solid var(--annotation-border)",
  borderRadius: "9999px",
  boxShadow: "0 1px 3px color-mix(in oklab, var(--annotation-foreground) 12%, transparent)",
  color: "var(--annotation-foreground)",
  display: "flex",
  height: 24,
  justifyContent: "center",
  position: "relative",
  transition: "transform 150ms ease, color 150ms ease",
  width: 24,
  zIndex: 10,
});

const resolveSliderThumbInteractiveClass = css({
  cursor: "grab",
  "&:active": {
    cursor: "grabbing",
  },
});

const toolbarClass = css({
  alignItems: "center",
  display: "flex",
  gap: "0.5rem",
  padding: "0.25rem",
});

const dockShellClass = css({
  backgroundColor: "var(--annotation-primary)",
  borderRadius: "calc(var(--annotation-radius) * 1.2)",
  overflow: "hidden",
});

const dockShellInnerClass = css({
  height: "fit-content",
  overflow: "hidden",
  position: "relative",
  width: "fit-content",
});

const toolbarButtonClass = css({
  backgroundColor: "transparent",
  color: "var(--annotation-primary-foreground)",
  "&:hover:not(:disabled)": {
    backgroundColor:
      "color-mix(in oklab, var(--annotation-primary-foreground) 14%, transparent)",
  },
});

const toolbarSeparatorClass = css({
  backgroundColor: "color-mix(in oklab, var(--annotation-primary-foreground) 25%, transparent)",
});

const authorGateFormClass = css({
  alignItems: "center",
  display: "flex",
  gap: "0.5rem",
  padding: "0.25rem",
});

const authorGateInputClass = css({
  backgroundColor:
    "color-mix(in oklab, var(--annotation-primary-foreground) 10%, transparent)",
  border: "none",
  color: "var(--annotation-primary-foreground)",
  width: 192,
  "&::placeholder": {
    color: "color-mix(in oklab, var(--annotation-primary-foreground) 50%, transparent)",
  },
  "&:focus": {
    borderColor: "transparent",
    boxShadow:
      "0 0 0 3px color-mix(in oklab, var(--annotation-primary-foreground) 16%, transparent)",
  },
});

const panelCardClass = css({
  paddingBottom: 0,
  width: 256,
});

const panelContentClass = css({
  borderTop: "1px solid var(--annotation-border)",
  display: "flex",
  flexDirection: "column",
  gap: 0,
  padding: 0,
});

const panelBodyClass = css({
  backgroundColor: "var(--annotation-muted)",
  display: "grid",
  gap: 0,
  height: "min(24rem, calc(100vh - 8rem))",
});

const panelScrollClass = css({
  height: "100%",
  maxHeight: "min(24rem, calc(100vh - 8rem))",
});

const panelListClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "0.5rem",
});

const panelEmptyTextClass = css({
  color: "var(--annotation-muted-foreground)",
  fontSize: "0.875rem",
  margin: 0,
  padding: "0.5rem",
  textAlign: "center",
});

const panelErrorWrapClass = css({
  borderTop: "1px solid color-mix(in oklab, var(--annotation-border) 60%, transparent)",
  padding: "0.75rem 1rem",
});

const settingsCardClass = css({
  width: 256,
});

const settingsTitleClass = css({
  alignItems: "baseline",
  display: "flex",
  gap: "0.5rem",
  justifyContent: "space-between",
});

const logoClass = css({
  display: "block",
  height: 12,
  width: "auto",
});

const versionClass = css({
  color: "var(--annotation-muted-foreground)",
  fontSize: "0.75rem",
});

const positionGridClass = css({
  display: "grid",
  gap: "0.5rem",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
});

const resolveHeadingRowClass = css({
  alignItems: "center",
  display: "flex",
  gap: "0.5rem",
  justifyContent: "space-between",
});

function isAnnotationPosition(value: string): value is AnnotationPosition {
  return POSITION_OPTIONS.some((option) => option.value === value);
}

function readStoredPosition(key: string, fallback: AnnotationPosition): AnnotationPosition {
  const value = readStoredString(key);
  return isAnnotationPosition(value) ? value : fallback;
}

function getPositionConfig(position: AnnotationPosition) {
  const isLeft = position.endsWith("left");
  const isTop = position.startsWith("top");

  const rootStyle: CSSProperties = {
    alignItems: isLeft ? "flex-start" : "flex-end",
    display: "flex",
    flexDirection: isTop ? "column-reverse" : "column",
    gap: "1rem",
    position: "fixed",
    zIndex: 2147483602,
  };

  if (isTop) {
    rootStyle.top = "1.5rem";
  } else {
    rootStyle.bottom = "1.5rem";
  }

  if (isLeft) {
    rootStyle.left = "1.5rem";
  } else {
    rootStyle.right = "1.5rem";
  }

  return {
    anchorX: isLeft ? "left" : "right",
    anchorY: isTop ? "top" : "bottom",
    buttonTransformOrigin: isLeft ? "center left" : "center right",
    cardOffset: isTop ? -10 : 10,
    rootStyle,
  } as const;
}

function useCopyState() {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setState("idle");
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [state]);

  return [state, setState] as const;
}

async function copyToClipboard(value: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function getCopyActionIcon(state: CopyState) {
  if (state === "copied") {
    return <CheckIcon size={16} />;
  }

  if (state === "error") {
    return <XIcon size={16} />;
  }

  return <CopySimpleIcon size={16} />;
}

function getResolveSliderIcon(state: ResolveSliderIconState) {
  if (state === "loading") {
    return <Spinner />;
  }

  return <ArrowRightIcon size={16} />;
}

function stopItemClick(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
  event.stopPropagation();
}

function AnimatedIconTransition<T extends string>({
  renderIcon,
  state,
}: {
  renderIcon: (state: T) => ReactNode;
  state: T;
}) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
        exit={{ filter: "blur(5px)", opacity: 0, scale: 0.5 }}
        initial={{ filter: "blur(5px)", opacity: 0, scale: 0.5 }}
        key={state}
      >
        {renderIcon(state)}
      </motion.div>
    </AnimatePresence>
  );
}

function AnimatedCopyStateIcon({ state }: { state: CopyState }) {
  return <AnimatedIconTransition renderIcon={getCopyActionIcon} state={state} />;
}

function ThreadCard({
  activeThreadId,
  canManage,
  comment,
  comments,
  currentPath,
}: ThreadCardProps) {
  const { openThreadComposer, scrollToComment, toggleResolved } = useAnnotation();
  const [copyState, setCopyState] = useCopyState();
  const replies = getReplies(comments, comment.id);
  const isActive = activeThreadId === comment.id;

  const goToThreadAndOpenComposer = useCallback(
    (scrollTargetId: string) => {
      scrollToComment(scrollTargetId);

      const markerNode = document.querySelector<HTMLElement>(`[data-thread-id="${comment.id}"]`);
      const anchorRect = markerNode ? measureRect(markerNode) : comment.rect;
      if (!anchorRect) {
        return;
      }

      openThreadComposer(comment.id, anchorRect);
    },
    [comment.id, comment.rect, openThreadComposer, scrollToComment],
  );

  const handleCopy = useCallback(async () => {
    const markdown = formatAnnotationThreadMarkdown(comment, comments, currentPath);
    const didCopy = await copyToClipboard(markdown);
    setCopyState(didCopy ? "copied" : "error");
  }, [comment, comments, currentPath, setCopyState]);

  return (
    <Item
      className={cx(
        threadCardClass(),
        isActive && threadCardActiveClass(),
        comment.resolved && threadCardResolvedClass(),
      )}
      onClick={() => goToThreadAndOpenComposer(comment.id)}
    >
      <ItemHeader className={threadCardHeaderClass()}>
        <Badge variant="secondary">{comment.page_path}</Badge>
        <div className={threadCardActionsClass()} data-thread-card-actions="true">
          <Button
            className={toolbarButtonClass()}
            onClick={(event) => {
              stopItemClick(event);
              void handleCopy();
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <AnimatedCopyStateIcon state={copyState} />
          </Button>
          {canManage ? (
            <Button
              aria-label={comment.resolved ? "Mark annotation as open" : "Resolve annotation"}
              className={toolbarButtonClass()}
              onClick={(event) => {
                stopItemClick(event);
                void toggleResolved(comment.id);
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              {comment.resolved ? (
                <CheckCircleIcon size={16} weight="fill" />
              ) : (
                <CheckCircleIcon size={16} />
              )}
            </Button>
          ) : null}
        </div>
      </ItemHeader>
      <ItemContent className={threadCardBodyClass()}>
        <div className={threadCardCopyClass()}>
          <p className={threadAuthorClass()}>{comment.author}</p>
          <p className={threadTextClass()}>{comment.text}</p>
        </div>
        <div className={threadMetaClass()}>
          <span>
            {replies.length > 0 &&
              `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
          </span>
          <span>{formatTimestamp(comment.created_at)}</span>
        </div>
      </ItemContent>
    </Item>
  );
}

function ResolveAllSlider({ onResolveAll }: ResolveAllSliderProps) {
  const [isResolving, setIsResolving] = useState(false);
  const trackNodeRef = useRef<HTMLDivElement | null>(null);
  const thumbNodeRef = useRef<HTMLButtonElement | null>(null);
  const [measureTrackRef, { width: measuredTrackWidth }] = useMeasure({ offsetSize: true });
  const [measureThumbRef, { width: measuredThumbWidth }] = useMeasure({ offsetSize: true });
  const x = useMotionValue(0);
  const setTrackRef = useCallback(
    (node: HTMLDivElement | null) => {
      trackNodeRef.current = node;
      measureTrackRef(node);
    },
    [measureTrackRef],
  );
  const setThumbRef = useCallback(
    (node: HTMLButtonElement | null) => {
      thumbNodeRef.current = node;
      measureThumbRef(node);
    },
    [measureThumbRef],
  );
  const trackWidth = trackNodeRef.current?.clientWidth ?? measuredTrackWidth;
  const thumbWidth = thumbNodeRef.current?.offsetWidth ?? measuredThumbWidth;
  const maxDrag = Math.max(trackWidth - thumbWidth, 0);
  const progressWidth = useTransform(x, (latest) =>
    Math.min(Math.max(latest + thumbWidth / 2, 0), trackWidth),
  );

  const moveThumbToEnd = useCallback(() => {
    void animate(x, maxDrag, {
      damping: 42,
      mass: 0.4,
      stiffness: 560,
      type: "spring",
    });
  }, [maxDrag, x]);

  const resetThumb = useCallback(() => {
    void animate(x, 0, {
      damping: 42,
      mass: 0.4,
      stiffness: 560,
      type: "spring",
    });
  }, [x]);

  const runResolveAll = useCallback(async () => {
    const startedAt = performance.now();

    setIsResolving(true);
    moveThumbToEnd();

    try {
      await onResolveAll();

      const elapsed = performance.now() - startedAt;
      const remaining = Math.max(0, 2000 - elapsed);

      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, remaining);
        });
      }
    } finally {
      setIsResolving(false);
      resetThumb();
    }
  }, [moveThumbToEnd, onResolveAll, resetThumb]);

  useEffect(() => {
    if (isResolving) {
      x.set(maxDrag);
      return;
    }

    if (x.get() > maxDrag) {
      x.set(maxDrag);
    }
  }, [isResolving, maxDrag, x]);

  const handleDragEnd = useCallback(() => {
    const completion = maxDrag <= 0 ? 0 : x.get() / maxDrag;

    if (isResolving) {
      return;
    }

    if (completion < RESOLVE_ALL_COMPLETE_THRESHOLD) {
      resetThumb();
      return;
    }

    void runResolveAll();
  }, [isResolving, maxDrag, resetThumb, runResolveAll, x]);
  const resolveSliderIconState: ResolveSliderIconState = isResolving ? "loading" : "idle";

  return (
    <div className={resolveSliderTrackClass()} ref={setTrackRef}>
      <motion.div
        aria-hidden
        className={resolveSliderFillClass()}
        style={{
          width: progressWidth,
        }}
      />
      <motion.button
        aria-label="Resolve all"
        className={cx(
          resolveSliderThumbClass(),
          !isResolving && resolveSliderThumbInteractiveClass(),
        )}
        disabled={isResolving}
        drag={isResolving ? false : "x"}
        dragConstraints={{ left: 0, right: maxDrag }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        ref={setThumbRef}
        style={{ x }}
        type="button"
        whileTap={isResolving ? undefined : { scale: 0.98 }}
      >
        <AnimatedIconTransition renderIcon={getResolveSliderIcon} state={resolveSliderIconState} />
      </motion.button>
    </div>
  );
}

export function AnnotationDock({
  defaultPosition = DEFAULT_POSITION,
}: {
  defaultPosition?: AnnotationPosition;
}) {
  const {
    activeThreadId,
    annotationMode,
    author,
    cancelAnnotationMode,
    closeAuthorGate,
    comments,
    composer,
    currentPath,
    errorMessage,
    isAuthorGateOpen,
    isLoading,
    resolveAllComments,
    setAuthor,
    setShowResolved,
    showResolved,
    startAnnotationMode,
    storageKeyPrefix,
    submitAuthorGate,
  } = useAnnotation();
  const onlyCurrentPageKey = useMemo(
    () => getStorageKey(storageKeyPrefix, "only_current_page"),
    [storageKeyPrefix],
  );
  const positionKey = useMemo(
    () => getStorageKey(storageKeyPrefix, "position"),
    [storageKeyPrefix],
  );
  const [showOnlyCurrentPage, setShowOnlyCurrentPage] = useState(() =>
    readStoredBoolean(onlyCurrentPageKey, false),
  );
  const [position, setPosition] = useState<AnnotationPosition>(() =>
    readStoredPosition(positionKey, defaultPosition),
  );
  const [isPanelOpen, setPanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [authorGateInput, setAuthorGateInput] = useState("");
  const [bulkCopyState, setBulkCopyState] = useCopyState();

  const [refContainer, { height, width }] = useMeasure();

  const topLevelComments = getTopLevelComments(comments);
  const sortedThreads = [...topLevelComments].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
  const showAllPages = !showOnlyCurrentPage;
  const pageScopedThreads = showAllPages
    ? sortedThreads
    : sortedThreads.filter((comment) => comment.page_path === currentPath);
  const visibleThreads = pageScopedThreads.filter((comment) => showResolved || !comment.resolved);
  const currentRouteOpenThreads = sortedThreads.filter(
    (comment) => comment.page_path === currentPath && !comment.resolved,
  );
  const unresolvedThreadCount = topLevelComments.filter((comment) => !comment.resolved).length;
  const hasAuthor = Boolean(author);
  const positionConfig = useMemo(() => getPositionConfig(position), [position]);

  const variantsButton = useMemo(
    () =>
      ({
        animate: {
          filter: "blur(0px)",
          opacity: 1,
          transform: "scale(1)",
          transformOrigin: positionConfig.buttonTransformOrigin,
          transition: { duration: 0.4, ease: [0.17, 0.84, 0.44, 1] },
        },
        exit: {
          filter: "blur(10px)",
          opacity: 0,
          transform: "scale(0.75)",
          transformOrigin: positionConfig.buttonTransformOrigin,
          transition: { duration: 0.4, ease: [0.17, 0.84, 0.44, 1] },
        },
        initial: { filter: "blur(10px)", opacity: 0, transform: "scale(0.75)" },
      }) satisfies Variants,
    [positionConfig.buttonTransformOrigin],
  );

  const variantsCard = useMemo(
    () =>
      ({
        animate: {
          opacity: 1,
          transform: "translateY(0)",
          transition: {
            duration: 0.25,
            ease: [0.17, 0.84, 0.44, 1],
          },
        },
        exit: {
          opacity: 0,
          transform: "translateY(0px)",
          transition: {
            duration: 0.15,
            ease: [0.17, 0.84, 0.44, 1],
          },
        },
        initial: {
          opacity: 0,
          transform: `translateY(${positionConfig.cardOffset}px)`,
        },
      }) satisfies Variants,
    [positionConfig.cardOffset],
  );

  useEffect(() => {
    setShowOnlyCurrentPage(readStoredBoolean(onlyCurrentPageKey, false));
  }, [onlyCurrentPageKey]);

  useEffect(() => {
    setPosition(readStoredPosition(positionKey, defaultPosition));
  }, [defaultPosition, positionKey]);

  useEffect(() => {
    if (!annotationMode) {
      setIsSettingsOpen(false);
      setPanelOpen(false);
    }
  }, [annotationMode]);

  useEffect(() => {
    if (isAuthorGateOpen) {
      setAuthorGateInput("");
    }
  }, [isAuthorGateOpen]);

  useEffect(() => {
    if (composer && !composer.parentId) {
      setPanelOpen(false);
    }
  }, [composer]);

  const toggleAnnotationsPanel = useCallback(() => {
    setIsSettingsOpen(false);
    closeAuthorGate();
    setPanelOpen((open) => !open);
  }, [closeAuthorGate]);

  const closeAnnotationDock = useCallback(() => {
    setIsSettingsOpen(false);
    closeAuthorGate();
    cancelAnnotationMode();
  }, [cancelAnnotationMode, closeAuthorGate]);

  const handleBulkCopy = useCallback(async () => {
    const markdown = formatAnnotationCollectionMarkdown(
      currentRouteOpenThreads,
      comments,
      currentPath,
    );
    const didCopy = await copyToClipboard(markdown);
    setBulkCopyState(didCopy ? "copied" : "error");
  }, [comments, currentPath, currentRouteOpenThreads, setBulkCopyState]);

  const renderDock = () => {
    if (!annotationMode && !isAuthorGateOpen) {
      return (
        <motion.div
          animate="animate"
          className={toolbarClass()}
          exit="exit"
          initial="initial"
          key="floating-button"
          variants={variantsButton}
        >
          <Button
            className={toolbarButtonClass()}
            onClick={() => startAnnotationMode()}
            size="sm"
            type="button"
            variant="ghost"
          >
            Annotation
            <Kbd>c</Kbd>
          </Button>
        </motion.div>
      );
    }

    if (isAuthorGateOpen) {
      return (
        <motion.form
          animate="animate"
          className={authorGateFormClass()}
          exit="exit"
          initial="initial"
          key="floating-button-author-gate"
          onSubmit={(event) => {
            event.preventDefault();
            submitAuthorGate(authorGateInput);
          }}
          variants={variantsButton}
        >
          <Input
            autoFocus
            className={authorGateInputClass()}
            id="annotation-author-gate-name"
            maxLength={48}
            onChange={(event) => setAuthorGateInput(event.target.value)}
            placeholder="What's your name?"
            value={authorGateInput}
          />
          <Button
            className={toolbarButtonClass()}
            disabled={!authorGateInput.trim()}
            size="iconSm"
            type="submit"
            variant="ghost"
          >
            <CheckIcon size={16} />
          </Button>
          <Separator className={toolbarSeparatorClass()} orientation="vertical" />
          <Button
            className={toolbarButtonClass()}
            onClick={closeAuthorGate}
            size="iconSm"
            type="button"
            variant="ghost"
          >
            <XIcon size={16} />
          </Button>
        </motion.form>
      );
    }

    return (
      <motion.div
        animate="animate"
        className={toolbarClass()}
        exit="exit"
        initial="initial"
        key="floating-button-active"
        variants={variantsButton}
      >
        <Button
          className={toolbarButtonClass()}
          disabled={currentRouteOpenThreads.length === 0}
          onClick={() => void handleBulkCopy()}
          size="iconSm"
          type="button"
          variant="ghost"
        >
          <AnimatedCopyStateIcon state={bulkCopyState} />
        </Button>
        <Button
          aria-expanded={isPanelOpen}
          aria-label="Annotations panel"
          className={toolbarButtonClass()}
          onClick={toggleAnnotationsPanel}
          size="iconSm"
          type="button"
          variant="ghost"
        >
          <ChatsIcon size={16} />
        </Button>
        <Button
          aria-expanded={isSettingsOpen}
          aria-label="Annotation settings"
          className={toolbarButtonClass()}
          onClick={() => {
            setIsSettingsOpen((open) => {
              const next = !open;
              if (next) {
                setPanelOpen(false);
                closeAuthorGate();
              }
              return next;
            });
          }}
          size="iconSm"
          type="button"
          variant="ghost"
        >
          <GearSixIcon size={16} />
        </Button>
        <Separator className={toolbarSeparatorClass()} orientation="vertical" />
        <Button
          className={toolbarButtonClass()}
          onClick={closeAnnotationDock}
          size="iconSm"
          type="button"
          variant="ghost"
        >
          <XIcon size={16} />
        </Button>
      </motion.div>
    );
  };

  return (
    <div data-annotation-overlay-root="true" style={positionConfig.rootStyle}>
      <AnimatePresence
        anchorX={positionConfig.anchorX}
        anchorY={positionConfig.anchorY}
        mode="popLayout"
      >
        {isPanelOpen ? (
          <motion.div
            animate="animate"
            exit="exit"
            initial="initial"
            key="annotations"
            variants={variantsCard}
          >
            <Card className={panelCardClass()}>
              <CardHeader>
                <FieldGroup>
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="annotation-panel-show-resolved">
                      Resolved comments
                    </FieldLabel>
                    <Switch
                      checked={showResolved}
                      id="annotation-panel-show-resolved"
                      onCheckedChange={setShowResolved}
                    />
                  </Field>
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="annotation-panel-show-all">All pages</FieldLabel>
                    <Switch
                      checked={showAllPages}
                      id="annotation-panel-show-all"
                      onCheckedChange={(checked) => {
                        writeStoredBoolean(onlyCurrentPageKey, !checked);
                        setShowOnlyCurrentPage(!checked);
                      }}
                    />
                  </Field>
                </FieldGroup>
              </CardHeader>
              <CardContent className={panelContentClass()}>
                <div className={panelBodyClass()}>
                  <ScrollArea className={panelScrollClass()}>
                    <div className={panelListClass()}>
                      {isLoading ? (
                        <p className={panelEmptyTextClass()}>Loading annotations…</p>
                      ) : null}
                      {!isLoading && visibleThreads.length === 0 ? (
                        <p className={panelEmptyTextClass()}>No annotations</p>
                      ) : null}
                      {!isLoading
                        ? visibleThreads.map((comment) => (
                            <ThreadCard
                              activeThreadId={activeThreadId}
                              canManage={hasAuthor}
                              comment={comment}
                              comments={comments}
                              currentPath={currentPath}
                              key={comment.id}
                            />
                          ))
                        : null}
                    </div>
                  </ScrollArea>
                  {errorMessage ? (
                    <div className={panelErrorWrapClass()}>
                      <div className={errorMessageClass()}>{errorMessage}</div>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}

        {isSettingsOpen ? (
          <motion.div
            animate="animate"
            exit="exit"
            initial="initial"
            key="settings"
            variants={variantsCard}
          >
            <Card className={settingsCardClass()}>
              <CardHeader>
                <CardTitle className={settingsTitleClass()}>
                  <img alt="Annotation" className={logoClass()} src={logo} />
                  <span className={versionClass()}>v0.1</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="annotation-panel-name">Name</FieldLabel>
                    <Input
                      id="annotation-panel-name"
                      maxLength={48}
                      onBlur={(event) => {
                        if (!event.currentTarget.value.trim()) {
                          cancelAnnotationMode();
                        }
                      }}
                      onChange={(event) => setAuthor(event.target.value)}
                      placeholder="Annotator"
                      value={author}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Position</FieldLabel>
                    <div className={positionGridClass()}>
                      {POSITION_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          onClick={() => {
                            writeStoredString(positionKey, option.value);
                            setPosition(option.value);
                          }}
                          size="xs"
                          type="button"
                          variant={position === option.value ? "secondary" : "outline"}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </Field>
                  <Field>
                    <div className={resolveHeadingRowClass()}>
                      <FieldLabel>Resolve all</FieldLabel>
                      <Badge variant="secondary">{unresolvedThreadCount}</Badge>
                    </div>
                    <ResolveAllSlider onResolveAll={resolveAllComments} />
                  </Field>
                </FieldGroup>
                {errorMessage ? (
                  <div style={{ marginTop: "1rem" }}>
                    <div className={errorMessageClass()}>{errorMessage}</div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        animate={{ height, width }}
        className={dockShellClass()}
        transition={{ duration: 0.25, ease: [0.17, 0.84, 0.44, 1] }}
      >
        <div className={dockShellInnerClass()} ref={refContainer}>
          <AnimatePresence mode="popLayout">{renderDock()}</AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
