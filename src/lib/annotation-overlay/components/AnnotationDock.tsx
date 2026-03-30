import {
  ArrowRightIcon,
  ChatsIcon,
  CheckCircleIcon,
  CheckIcon,
  CopySimpleIcon,
  GearSixIcon,
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
import type { AnnotationComment } from "../types";
import { getStorageKey, readStoredBoolean, writeStoredBoolean } from "../storage";
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
    return <Spinner className="size-4" />;
  }

  return <ArrowRightIcon className="size-4" />;
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
        "group bg-background transition-all",
        isActive && "border border-primary",
        comment.resolved && "opacity-50",
      )}
      onClick={() => goToThreadAndOpenComposer(comment.id)}
      size="xs"
      variant="outline"
    >
      <ItemHeader className="flex items-center justify-between gap-2">
        <Badge variant="secondary">{comment.page_path}</Badge>
        <div className="flex items-center gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
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
      <ItemContent className="flex flex-col gap-2 text-sm">
        <div className="flex flex-col">
          <p className="font-medium">{comment.author}</p>
          <p className="whitespace-pre-wrap text-muted-foreground">{comment.text}</p>
        </div>
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
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
      className="relative box-content h-6 overflow-hidden rounded-full border bg-muted"
      ref={setTrackRef}
    >
      <motion.div
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-primary"
        style={{
          width: progressWidth,
        }}
      />
      <motion.button
        aria-label="Resolve all"
        className={cn(
          "relative z-10 flex size-6 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border transition-colors",
          !isResolving && "cursor-grab active:cursor-grabbing",
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

export function AnnotationDock() {
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
  const [showOnlyCurrentPage, setShowOnlyCurrentPage] = useState(() =>
    readStoredBoolean(onlyCurrentPageKey, false),
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

  const variantsButton = {
    initial: { opacity: 0, filter: "blur(10px)", transform: "scale(0.75)" },
    animate: {
      opacity: 1,
      filter: "blur(0px)",
      transform: "scale(1)",
      transformOrigin: "center left",
      transition: { duration: 0.4, ease: [0.17, 0.84, 0.44, 1] },
    },
    exit: {
      opacity: 0,
      filter: "blur(10px)",
      transform: "scale(0.75)",
      transformOrigin: "center left",
      transition: { duration: 0.4, ease: [0.17, 0.84, 0.44, 1] },
    },
  } satisfies Variants;

  const variantsCard = {
    initial: {
      opacity: 0,
      transform: "translateY(10px)",
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
  } satisfies Variants;

  useEffect(() => {
    setShowOnlyCurrentPage(readStoredBoolean(onlyCurrentPageKey, false));
  }, [onlyCurrentPageKey]);

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
          className="flex items-center"
          exit="exit"
          initial="initial"
          key="floating-button"
          variants={variantsButton}
        >
          <Button className="pr-1" onClick={() => startAnnotationMode()} size="sm">
            Annotation
            <Kbd className="bg-primary-foreground/15 text-primary-foreground">C</Kbd>
          </Button>
        </motion.div>
      );
    }

    if (isAuthorGateOpen) {
      return (
        <motion.form
          animate="animate"
          className="flex items-center gap-2 p-1"
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
            className="w-48 border-none bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/50"
            id="annotation-author-gate-name"
            maxLength={48}
            onChange={(event) => setAuthorGateInput(event.target.value)}
            placeholder="What's your name?"
            value={authorGateInput}
          />
          <Button disabled={!authorGateInput.trim()} size="icon-sm" type="submit">
            <CheckIcon />
          </Button>
          <Separator className="bg-primary-foreground/25" orientation="vertical" />
          <Button onClick={closeAuthorGate} size="icon-sm" type="button">
            <XIcon />
          </Button>
        </motion.form>
      );
    }

    return (
      <motion.div
        animate="animate"
        className="flex origin-bottom-right items-center gap-2 p-1"
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
        <Separator className="bg-primary-foreground/25" orientation="vertical" />
        <Button onClick={closeAnnotationDock} size="icon-sm">
          <XIcon />
        </Button>
      </motion.div>
    );
  };

  return (
    <div
      className="fixed right-6 bottom-6 z-2147483602 flex flex-col items-end gap-4"
      data-annotation-overlay-root="true"
    >
      <AnimatePresence anchorX="right" anchorY="bottom" mode="popLayout">
        {isPanelOpen ? (
          <motion.div
            animate="animate"
            exit="exit"
            initial="initial"
            key="annotations"
            variants={variantsCard}
          >
            <Card className="w-64 pb-0">
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
              <CardContent className="flex flex-col gap-0 border-t p-0">
                <div className="grid h-[min(24rem,calc(100vh-8rem))] gap-0 bg-muted">
                  <ScrollArea className="h-full max-h-[min(24rem,calc(100vh-8rem))]" type="scroll">
                    <div className="flex flex-col gap-2 p-2">
                      {isLoading ? (
                        <p className="p-2 text-center text-sm text-muted-foreground">
                          Loading annotations…
                        </p>
                      ) : null}
                      {!isLoading && visibleThreads.length === 0 ? (
                        <p className="p-2 text-center text-sm text-muted-foreground">
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
                    <div className="border-t border-border/60 px-4 py-3">
                      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
            <Card className="w-64">
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between gap-2">
                  <img alt="Annotation" className="h-3 w-fit" src={logo} />
                  <span className="text-xs text-muted-foreground">v0.1</span>
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
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel>Resolve all</FieldLabel>
                      <Badge variant="secondary">{unresolvedThreadCount}</Badge>
                    </div>
                    <ResolveAllSlider onResolveAll={resolveAllComments} />
                  </Field>
                </FieldGroup>
                {errorMessage ? (
                  <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
        className="overflow-hidden rounded-md bg-primary"
        transition={{ duration: 0.25, ease: [0.17, 0.84, 0.44, 1] }}
      >
        <div className="relative h-fit w-fit overflow-hidden" ref={refContainer}>
          <AnimatePresence mode="popLayout">{renderDock()}</AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
