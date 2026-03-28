import {
  ChatsIcon,
  CheckCircleIcon,
  CopySimpleIcon,
  GearSixIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import useMeasure from "react-use-measure";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { AnnotationComment } from "../types";
import {
  ANNOTATION_ONLY_CURRENT_PAGE_KEY,
  readStoredBoolean,
  writeStoredBoolean,
} from "../storage";
import { useAnnotation } from "../useAnnotation";
import {
  formatAnnotationCollectionMarkdown,
  formatAnnotationThreadMarkdown,
  formatTimestamp,
  getReplies,
  getTopLevelComments,
} from "../utils";

type CopyState = "idle" | "copied" | "error";

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

function getCopyActionLabel(scope: "annotation" | "annotations", state: CopyState): string {
  if (state === "copied") {
    return scope === "annotation" ? "Annotation copied" : "Annotations copied";
  }

  if (state === "error") {
    return scope === "annotation" ? "Copy annotation failed" : "Copy annotations failed";
  }

  return scope === "annotation"
    ? "Copy annotation as markdown"
    : "Copy open annotations on this route as markdown";
}

function getCopyActionIcon(state: CopyState) {
  if (state === "copied") {
    return <CheckCircleIcon />;
  }

  if (state === "error") {
    return <XIcon />;
  }

  return <CopySimpleIcon />;
}

type ThreadCardProps = {
  activeThreadId: string | null;
  canManage: boolean;
  comment: AnnotationComment;
  comments: AnnotationComment[];
  currentPath: string;
};

function ThreadCard({
  activeThreadId,
  canManage,
  comment,
  comments,
  currentPath,
}: ThreadCardProps) {
  const { scrollToComment, toggleResolved } = useAnnotation();
  const [copyState, setCopyState] = useCopyState();

  const replies = getReplies(comments, comment.id);
  const isActive = activeThreadId === comment.id;

  const handleCopy = async () => {
    const markdown = formatAnnotationThreadMarkdown(comment, comments, currentPath);
    const didCopy = await copyToClipboard(markdown);
    setCopyState(didCopy ? "copied" : "error");
  };

  return (
    <article
      className={cn(
        "grid gap-3 rounded-2xl border p-3 transition",
        isActive ? "border-primary/45 bg-primary/6" : "border-border/70 bg-background",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          className="flex flex-1 items-start gap-3 text-left"
          onClick={() => scrollToComment(comment.id)}
          type="button"
        >
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <strong className="text-sm text-foreground">{comment.author}</strong>
              <span>{formatTimestamp(comment.created_at)}</span>
            </div>
            <p className="text-sm leading-6 text-foreground">{comment.text}</p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <Badge variant={comment.resolved ? "secondary" : "outline"}>
            {comment.resolved ? "Resolved" : "Open"}
          </Badge>
          <Button
            aria-label={getCopyActionLabel("annotation", copyState)}
            onClick={() => void handleCopy()}
            size="icon"
            title={getCopyActionLabel("annotation", copyState)}
            type="button"
            variant="ghost"
          >
            {getCopyActionIcon(copyState)}
          </Button>
          {canManage ? (
            <Button
              aria-label={comment.resolved ? "Mark annotation as open" : "Resolve annotation"}
              className={comment.resolved ? "opacity-50" : ""}
              onClick={() => void toggleResolved(comment.id)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <CheckCircleIcon />
            </Button>
          ) : null}
        </div>
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
      <Badge variant="secondary">{comment.page_path}</Badge>
    </article>
  );
}

export function AnnotationDock() {
  const {
    activeThreadId,
    author,
    cancelCommentMode,
    closeAuthorGate,
    commentMode,
    comments,
    currentPath,
    errorMessage,
    isAuthorGateOpen,
    isLoading,
    isPanelOpen,
    setAuthor,
    setPanelOpen,
    setShowResolved,
    showResolved,
    startCommentMode,
    submitAuthorGate,
  } = useAnnotation();
  const [showOnlyCurrentPage, setShowOnlyCurrentPage] = useState(() =>
    readStoredBoolean(ANNOTATION_ONLY_CURRENT_PAGE_KEY, false),
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [authorGateInput, setAuthorGateInput] = useState("");

  const [refContainer, { width, height }] = useMeasure();

  const topLevelComments = getTopLevelComments(comments);
  const sortedThreads = [...topLevelComments].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  const showAllPages = !showOnlyCurrentPage;
  const pageScopedThreads = showAllPages
    ? sortedThreads
    : sortedThreads.filter((comment) => comment.page_path === currentPath);
  const visibleThreads = pageScopedThreads.filter((comment) => showResolved || !comment.resolved);
  const pageCount = new Set(topLevelComments.map((comment) => comment.page_path)).size;
  const currentPageCount = topLevelComments.filter(
    (comment) => comment.page_path === currentPath,
  ).length;
  const currentRouteOpenThreads = sortedThreads.filter(
    (comment) => comment.page_path === currentPath && !comment.resolved,
  );
  const hasAuthor = Boolean(author);
  const [bulkCopyState, setBulkCopyState] = useCopyState();

  const variantsButton = {
    initial: { opacity: 0, filter: "blur(10px)", transform: "scale(0.8)" },
    animate: { opacity: 1, filter: "blur(0px)", transform: "scale(1)" },
    exit: { opacity: 0, filter: "blur(10px)", transform: "scale(0.8)" },
  };

  const toggleAnnotationsPanel = () => {
    setIsSettingsOpen(false);
    closeAuthorGate();
    setPanelOpen(!isPanelOpen);
  };

  const closeCommentDock = () => {
    setIsSettingsOpen(false);
    closeAuthorGate();
    cancelCommentMode();
  };

  useEffect(() => {
    if (!commentMode) {
      setIsSettingsOpen(false);
    }
  }, [commentMode]);

  useEffect(() => {
    if (isAuthorGateOpen) {
      setAuthorGateInput("");
    }
  }, [isAuthorGateOpen]);

  const handleBulkCopy = async () => {
    const markdown = formatAnnotationCollectionMarkdown(
      currentRouteOpenThreads,
      comments,
      currentPath,
    );
    const didCopy = await copyToClipboard(markdown);
    setBulkCopyState(didCopy ? "copied" : "error");
  };

  return (
    <div
      className="fixed right-6 bottom-6 z-2147483602 flex flex-col items-end gap-4"
      data-annotation-overlay-root="true"
    >
      {isPanelOpen && (
        <Card className="w-64">
          <CardContent>
            <section id="annotation-panel-surface">
              <div className="border-b border-border/60 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold tracking-[0.18em] text-foreground uppercase">
                        Annotations
                      </h2>
                      <Badge variant="secondary">{sortedThreads.length}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {`${visibleThreads.length} annotations across ${showAllPages ? pageCount || 0 : 1} ${showAllPages ? "pages" : "page"}. ${currentPageCount} on this page.`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid max-h-[min(32rem,calc(100vh-7.5rem))] gap-0">
                <ScrollArea className="max-h-[min(28rem,calc(100vh-11rem))] px-3 py-3">
                  <div className="grid gap-2">
                    {isLoading ? (
                      <p className="px-1 text-sm text-muted-foreground">Loading annotations…</p>
                    ) : null}
                    {!isLoading && visibleThreads.length === 0 ? (
                      <p className="px-1 text-sm text-muted-foreground">
                        {topLevelComments.length === 0
                          ? "No annotations yet."
                          : !showAllPages && currentPageCount === 0
                            ? "No annotations on this page."
                            : 'Resolved annotations are hidden. Turn on "Resolved comments" to see them.'}
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
            </section>
          </CardContent>
        </Card>
      )}

      {isAuthorGateOpen && (
        <Card className="w-64">
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitAuthorGate(authorGateInput);
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="annotation-author-gate-name">
                    What&apos;s your name?
                  </FieldLabel>
                  <Input
                    autoFocus
                    id="annotation-author-gate-name"
                    maxLength={48}
                    onChange={(event) => setAuthorGateInput(event.target.value)}
                    placeholder="Annotator"
                    value={authorGateInput}
                  />
                </Field>
                <Button disabled={!authorGateInput.trim()} type="submit">
                  Continue
                </Button>
              </FieldGroup>
            </form>
            {errorMessage ? (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {commentMode && isSettingsOpen && (
        <Card className="w-64">
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="annotation-panel-name">Name</FieldLabel>
                <Input
                  id="annotation-panel-name"
                  maxLength={48}
                  onChange={(event) => setAuthor(event.target.value)}
                  placeholder="Annotator"
                  value={author}
                />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="annotation-panel-show-resolved">Resolved comments</FieldLabel>
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
                    writeStoredBoolean(ANNOTATION_ONLY_CURRENT_PAGE_KEY, !checked);
                    setShowOnlyCurrentPage(!checked);
                  }}
                />
              </Field>
            </FieldGroup>

            {errorMessage ? (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <motion.div
        layout
        animate={{ width, height }}
        className="overflow-hidden rounded-md bg-primary"
        transition={{ duration: 0.15, ease: [0.17, 0.84, 0.44, 1] }}
      >
        <div ref={refContainer} className="h-fit w-fit">
          <AnimatePresence mode="popLayout">
            {!commentMode ? (
              <motion.div
                key="floating-button"
                variants={variantsButton}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.17, 0.84, 0.44, 1] }}
                className="flex items-center"
              >
                <Button
                  onClick={() => startCommentMode()}
                  size="sm"
                  variant="ghost"
                  className="pr-1 hover:bg-primary-foreground/10"
                >
                  Annotation
                  <Kbd className="bg-primary-foreground/15 text-primary-foreground">C</Kbd>
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="floating-button-active"
                variants={variantsButton}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.17, 0.84, 0.44, 1] }}
                className="flex origin-bottom-right items-center gap-2 p-1"
              >
                <Button
                  aria-label={getCopyActionLabel("annotations", bulkCopyState)}
                  className="hover:bg-primary-foreground/10"
                  disabled={currentRouteOpenThreads.length === 0}
                  onClick={() => void handleBulkCopy()}
                  size="icon-sm"
                  title={getCopyActionLabel("annotations", bulkCopyState)}
                  variant="ghost"
                >
                  {getCopyActionIcon(bulkCopyState)}
                </Button>
                <Button
                  onClick={toggleAnnotationsPanel}
                  variant="ghost"
                  size="icon-sm"
                  className="hover:bg-primary-foreground/10"
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
                  variant="ghost"
                  className="hover:bg-primary-foreground/10"
                >
                  <GearSixIcon />
                </Button>
                <Separator orientation="vertical" className="bg-primary-foreground/25" />
                <Button
                  onClick={closeCommentDock}
                  size="icon-sm"
                  variant="ghost"
                  className="hover:bg-primary-foreground/10"
                >
                  <XIcon />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
