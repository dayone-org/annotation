import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircleIcon, DotsThreeVerticalIcon, XIcon } from "@phosphor-icons/react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAnnotation } from "../useAnnotation";
import type { AnnotationComment } from "../types";
import { formatTimestamp, getReplies, getTopLevelComments } from "../utils";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ANNOTATION_ONLY_CURRENT_PAGE_KEY,
  readStoredBoolean,
  writeStoredBoolean,
} from "../storage";
import { Kbd } from "@/components/ui/kbd";

type ThreadCardProps = {
  activeThreadId: string | null;
  canManage: boolean;
  comment: AnnotationComment;
  comments: AnnotationComment[];
};

function ThreadCard({ activeThreadId, canManage, comment, comments }: ThreadCardProps) {
  const { scrollToComment, toggleResolved } = useAnnotation();

  const replies = getReplies(comments, comment.id);
  const isActive = activeThreadId === comment.id;

  return (
    <article
      className={cn(
        "grid gap-3 rounded-xl border p-3 transition",
        isActive ? "border-primary/40 bg-muted/50" : "border-border bg-background",
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
        {canManage && (
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
        )}
      </div>
      {replies.length > 0 && (
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
      )}
      <Badge variant="secondary">{comment.page_path}</Badge>
    </article>
  );
}

export function AnnotationPanel() {
  const {
    activeThreadId,
    author,
    cancelCommentMode,
    commentMode,
    comments,
    currentPath,
    errorMessage,
    isLoading,
    isPanelOpen,
    setAuthor,
    setPanelOpen,
    setShowResolved,
    showResolved,
    startCommentMode,
  } = useAnnotation();
  const [showOnlyCurrentPage, setShowOnlyCurrentPage] = useState(() =>
    readStoredBoolean(ANNOTATION_ONLY_CURRENT_PAGE_KEY, false),
  );
  const showAll = !showOnlyCurrentPage;

  const topLevelComments = getTopLevelComments(comments);
  const sortedThreads = [...topLevelComments].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  const pageScopedThreads = showAll
    ? sortedThreads
    : sortedThreads.filter((comment) => comment.page_path === currentPath);
  const visibleThreads = pageScopedThreads.filter((comment) => showResolved || !comment.resolved);
  const currentPageCount = topLevelComments.filter(
    (comment) => comment.page_path === currentPath,
  ).length;
  const hasAuthor = Boolean(author);

  return (
    <>
      <Button
        className="fixed bottom-6 right-6 z-2147483601"
        aria-controls="annotation-panel-dock"
        aria-expanded={isPanelOpen}
        data-annotation-overlay-root="true"
        onClick={() => setPanelOpen(!isPanelOpen)}
        type="button"
        variant={isPanelOpen ? "secondary" : "default"}
      >
        Annotation
        <Kbd>C</Kbd>
      </Button>
      {isPanelOpen ? (
        <section
          id="annotation-panel-dock"
          className="fixed bottom-22 right-6 z-2147483602 flex w-[min(26rem,calc(100vw-1.5rem))] max-h-[min(32rem,calc(100vh-6.5rem))] flex-col overflow-hidden rounded-[1.25rem] border border-border/70 bg-background/95 shadow-[0_24px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
          data-annotation-overlay-root="true"
        >
          <header className="relative shrink-0 border-b border-border/60 bg-muted/35 px-4 py-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-[0.18em] uppercase text-foreground">
                  Annotation
                </h2>
                <Badge variant="secondary">{visibleThreads.length}</Badge>
              </div>
              <Badge className="w-fit" variant="secondary">
                {currentPath}
              </Badge>
            </div>
            <div className="absolute right-3 top-3 flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    aria-label="Annotation settings"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <DotsThreeVerticalIcon />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="z-2147483604 w-80"
                  data-annotation-overlay-root="true"
                  sideOffset={8}
                >
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="annotation-panel-name">Name</FieldLabel>
                      <Input
                        id="annotation-panel-name"
                        maxLength={48}
                        onChange={(event) => setAuthor(event.target.value)}
                        placeholder="Jane Doe"
                        value={author}
                      />
                    </Field>
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
                        checked={showAll}
                        id="annotation-panel-show-all"
                        onCheckedChange={(checked) => {
                          writeStoredBoolean(ANNOTATION_ONLY_CURRENT_PAGE_KEY, !checked);
                          setShowOnlyCurrentPage(!checked);
                        }}
                      />
                    </Field>
                  </FieldGroup>

                  {errorMessage ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {errorMessage}
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
              <Button
                aria-label="Close annotation panel"
                onClick={() => setPanelOpen(false)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <XIcon />
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 p-3">
              <ScrollArea className="min-h-0 flex-1 pr-1">
                <div className="grid gap-2">
                  {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading annotations…</p>
                  ) : null}
                  {!isLoading && visibleThreads.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {topLevelComments.length === 0
                        ? "No annotations yet."
                        : !showAll && currentPageCount === 0
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
                          key={comment.id}
                        />
                      ))
                    : null}
                </div>
              </ScrollArea>
            </div>
            <div className="shrink-0 border-t border-border/60 bg-muted/25 p-3">
              <Button
                disabled={!hasAuthor}
                onClick={() => {
                  if (commentMode) {
                    cancelCommentMode();
                  } else {
                    startCommentMode();
                  }
                }}
                className="w-full"
                type="button"
              >
                {commentMode ? (
                  "Exit comment mode"
                ) : (
                  <>
                    New annotation <Kbd>C</Kbd>
                  </>
                )}
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
