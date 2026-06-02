import {
  ArrowDownLeftIcon,
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpLeftIcon,
  ArrowUpRightIcon,
  ChatsIcon,
  CheckCircleIcon,
  CheckIcon,
  CopySimpleIcon,
  GearSixIcon,
  ImageSquareIcon,
  XIcon,
} from "@phosphor-icons/react";
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
  type MouseEvent,
  type ReactNode,
} from "react";
import useMeasure from "react-use-measure";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import logo from "@/logo.svg";
import type { AnnotationComment, AnnotationPosition } from "../types";
import {
  getStorageKey,
  readStoredBoolean,
  readStoredString,
  writeStoredBoolean,
  writeStoredString,
} from "../storage";
import { useAnnotation } from "../useAnnotation";
import {
  formatAnnotationCollectionMarkdown,
  formatAnnotationThreadMarkdown,
  formatTimestamp,
  getReplies,
  getTopLevelComments,
  measureRect,
} from "../utils";

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
const POSITION_OPTIONS: Array<{ icon: ReactNode; value: AnnotationPosition }> = [
  { icon: <ArrowUpLeftIcon />, value: "top-left" },
  { icon: <ArrowUpRightIcon />, value: "top-right" },
  { icon: <ArrowDownLeftIcon />, value: "bottom-left" },
  { icon: <ArrowDownRightIcon />, value: "bottom-right" },
];

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

  return {
    anchorX: isLeft ? "left" : "right",
    anchorY: isTop ? "top" : "bottom",
    buttonTransformOrigin: isLeft ? "center left" : "center right",
    cardOffset: isTop ? -10 : 10,
    rootClassName: cn(
      "annotation:fixed annotation:z-2147483602 annotation:flex annotation:gap-4",
      isTop
        ? "annotation:top-6 annotation:flex-col-reverse"
        : "annotation:bottom-6 annotation:flex-col",
      isLeft
        ? "annotation:left-6 annotation:items-start"
        : "annotation:right-6 annotation:items-end",
    ),
    toolbarOriginClassName: (() => {
      if (position === "top-left") {
        return "annotation:origin-top-left";
      }

      if (position === "top-right") {
        return "annotation:origin-top-right";
      }

      if (position === "bottom-left") {
        return "annotation:origin-bottom-left";
      }

      return "annotation:origin-bottom-right";
    })(),
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
    return <CheckIcon />;
  }

  if (state === "error") {
    return <XIcon />;
  }

  return <CopySimpleIcon />;
}

function getResolveSliderIcon(state: ResolveSliderIconState) {
  if (state === "loading") {
    return <Spinner className="annotation:size-4" />;
  }

  return <ArrowRightIcon className="annotation:size-4" />;
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
        className="annotation:flex annotation:items-center annotation:justify-center"
        animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
        exit={{ opacity: 0, filter: "blur(5px)", scale: 0.5 }}
        initial={{ opacity: 0, filter: "blur(5px)", scale: 0.5 }}
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
  const hasScreenshot = [comment, ...replies].some((threadComment) => threadComment.screenshot);

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
      className={cn(
        "annotation:group annotation:bg-background annotation:transition-all",
        isActive && "annotation:border annotation:border-primary",
        comment.resolved && "annotation:opacity-50",
      )}
      onClick={() => goToThreadAndOpenComposer(comment.id)}
      size="xs"
      variant="outline"
    >
      <ItemHeader className="annotation:flex annotation:items-center annotation:justify-between annotation:gap-2">
        <Badge variant="secondary">{comment.page_path}</Badge>
        <div className="annotation:flex annotation:items-center annotation:gap-0 annotation:opacity-0 annotation:transition-opacity annotation:duration-150 annotation:group-hover:opacity-100">
          <Button
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
              onClick={(event) => {
                stopItemClick(event);
                void toggleResolved(comment.id);
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              {comment.resolved ? <CheckCircleIcon weight="fill" /> : <CheckCircleIcon />}
            </Button>
          ) : null}
        </div>
      </ItemHeader>
      <ItemContent className="annotation:flex annotation:flex-col annotation:gap-2 annotation:text-sm">
        <div className="annotation:flex annotation:flex-col">
          <p className="annotation:font-medium">{comment.author}</p>
          <p className="annotation:whitespace-pre-wrap annotation:text-muted-foreground">
            {comment.text}
          </p>
        </div>
        <div className="annotation:flex annotation:justify-between annotation:gap-2 annotation:text-xs annotation:text-muted-foreground">
          <span>
            {replies.length > 0 &&
              `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
          </span>
          <span className="annotation:flex annotation:items-center annotation:gap-2">
            {hasScreenshot ? (
              <ImageSquareIcon aria-label="Thread has screenshot" className="annotation:size-3" />
            ) : null}
            {formatTimestamp(comment.created_at)}
          </span>
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
      type: "spring",
      stiffness: 560,
      damping: 42,
      mass: 0.4,
    });
  }, [maxDrag, x]);

  const resetThumb = useCallback(() => {
    void animate(x, 0, {
      type: "spring",
      stiffness: 560,
      damping: 42,
      mass: 0.4,
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
    <div
      className="annotation:relative annotation:box-content annotation:h-6 annotation:overflow-hidden annotation:rounded-full annotation:border annotation:bg-muted"
      ref={setTrackRef}
    >
      <motion.div
        aria-hidden
        className="annotation:absolute annotation:inset-y-0 annotation:left-0 annotation:rounded-full annotation:bg-primary"
        style={{
          width: progressWidth,
        }}
      />
      <motion.button
        aria-label="Resolve all"
        className={cn(
          "annotation:relative annotation:z-10 annotation:flex annotation:size-6 annotation:items-center annotation:justify-center annotation:rounded-full annotation:bg-background annotation:shadow-sm annotation:ring-1 annotation:ring-border annotation:transition-colors",
          !isResolving && "annotation:cursor-grab annotation:active:cursor-grabbing",
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
        initial: { opacity: 0, filter: "blur(10px)", transform: "scale(0.75)" },
        animate: {
          opacity: 1,
          filter: "blur(0px)",
          transform: "scale(1)",
          transformOrigin: positionConfig.buttonTransformOrigin,
          transition: { duration: 0.4, ease: [0.17, 0.84, 0.44, 1] },
        },
        exit: {
          opacity: 0,
          filter: "blur(10px)",
          transform: "scale(0.75)",
          transformOrigin: positionConfig.buttonTransformOrigin,
          transition: { duration: 0.4, ease: [0.17, 0.84, 0.44, 1] },
        },
      }) satisfies Variants,
    [positionConfig.buttonTransformOrigin],
  );

  const variantsCard = useMemo(
    () =>
      ({
        initial: {
          opacity: 0,
          transform: `translateY(${positionConfig.cardOffset}px)`,
        },
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
          className="annotation:flex annotation:items-center"
          exit="exit"
          initial="initial"
          key="floating-button"
          variants={variantsButton}
        >
          <Button className="annotation:pr-1" onClick={() => startAnnotationMode()} size="sm">
            Annotation
            <Kbd className="annotation:bg-primary-foreground/15 annotation:text-primary-foreground">
              C
            </Kbd>
          </Button>
        </motion.div>
      );
    }

    if (isAuthorGateOpen) {
      return (
        <motion.form
          animate="animate"
          className="annotation:flex annotation:items-center annotation:gap-2 annotation:p-1"
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
            className="annotation:w-48 annotation:border-none annotation:bg-primary-foreground/10 annotation:text-primary-foreground annotation:placeholder:text-primary-foreground/50"
            id="annotation-author-gate-name"
            maxLength={48}
            onChange={(event) => setAuthorGateInput(event.target.value)}
            placeholder="What's your name?"
            value={authorGateInput}
          />
          <Button disabled={!authorGateInput.trim()} size="icon-sm" type="submit">
            <CheckIcon />
          </Button>
          <Separator className="annotation:bg-primary-black" orientation="vertical" />
          <Button onClick={closeAuthorGate} size="icon-sm" type="button">
            <XIcon />
          </Button>
        </motion.form>
      );
    }

    return (
      <motion.div
        animate="animate"
        className={cn(
          "annotation:flex annotation:items-center annotation:gap-2 annotation:p-1",
          positionConfig.toolbarOriginClassName,
        )}
        exit="exit"
        initial="initial"
        key="floating-button-active"
        variants={variantsButton}
      >
        <Button
          disabled={currentRouteOpenThreads.length === 0}
          onClick={() => void handleBulkCopy()}
          size="icon-sm"
        >
          <AnimatedCopyStateIcon state={bulkCopyState} />
        </Button>
        <Button
          aria-expanded={isPanelOpen}
          aria-label="Annotations panel"
          onClick={toggleAnnotationsPanel}
          size="icon-sm"
        >
          <ChatsIcon />
        </Button>
        <Button
          aria-expanded={isSettingsOpen}
          aria-label="Annotation settings"
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
          size="icon-sm"
        >
          <GearSixIcon />
        </Button>
        <Separator className="annotation:bg-primary-foreground/25" orientation="vertical" />
        <Button onClick={closeAnnotationDock} size="icon-sm">
          <XIcon />
        </Button>
      </motion.div>
    );
  };

  return (
    <div className={positionConfig.rootClassName} data-annotation-overlay-root="true">
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
            <Card className="annotation:w-64 annotation:pb-0">
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
              <CardContent className="annotation:flex annotation:flex-col annotation:gap-0 annotation:border-t annotation:p-0">
                <div className="annotation:grid annotation:h-[min(24rem,calc(100vh-8rem))] annotation:gap-0 annotation:bg-muted">
                  <ScrollArea
                    className="annotation:h-full annotation:max-h-[min(24rem,calc(100vh-8rem))]"
                    type="scroll"
                  >
                    <div className="annotation:flex annotation:flex-col annotation:gap-2 annotation:p-2">
                      {isLoading ? (
                        <p className="annotation:p-2 annotation:text-center annotation:text-sm annotation:text-muted-foreground">
                          Loading annotations…
                        </p>
                      ) : null}
                      {!isLoading && visibleThreads.length === 0 ? (
                        <p className="annotation:p-2 annotation:text-center annotation:text-sm annotation:text-muted-foreground">
                          No annotations
                        </p>
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
                    <div className="annotation:border-t annotation:border-border/60 annotation:px-4 annotation:py-3">
                      <div className="annotation:rounded-xl annotation:border annotation:border-destructive/30 annotation:bg-destructive/10 annotation:px-3 annotation:py-2 annotation:text-sm annotation:text-destructive">
                        {errorMessage}
                      </div>
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
            <Card className="annotation:w-64">
              <CardHeader>
                <CardTitle className="annotation:flex annotation:items-baseline annotation:justify-between annotation:gap-2">
                  <img alt="Annotation" className="annotation:h-3 annotation:w-fit" src={logo} />
                  <span className="annotation:text-xs annotation:text-muted-foreground">v0.1</span>
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
                    <div className="annotation:grid annotation:grid-cols-2 annotation:gap-2">
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
                          {option.icon}
                        </Button>
                      ))}
                    </div>
                  </Field>
                  <Field>
                    <div className="annotation:flex annotation:items-center annotation:justify-between annotation:gap-2">
                      <FieldLabel>Resolve all</FieldLabel>
                      <Badge variant="secondary">{unresolvedThreadCount}</Badge>
                    </div>
                    <ResolveAllSlider onResolveAll={resolveAllComments} />
                  </Field>
                </FieldGroup>
                {errorMessage ? (
                  <div className="annotation:mt-4 annotation:rounded-xl annotation:border annotation:border-destructive/30 annotation:bg-destructive/10 annotation:px-3 annotation:py-2 annotation:text-sm annotation:text-destructive">
                    {errorMessage}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        animate={{ height, width }}
        className="annotation:overflow-hidden annotation:rounded-md annotation:bg-primary"
        transition={{ duration: 0.25, ease: [0.17, 0.84, 0.44, 1] }}
      >
        <div
          className="annotation:relative annotation:h-fit annotation:w-fit annotation:overflow-hidden"
          ref={refContainer}
        >
          <AnimatePresence mode="popLayout">{renderDock()}</AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
