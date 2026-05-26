import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { flushSync } from "react-dom";
import type {
  AnnotationComment,
  AnnotationOverlayProps,
  AnnotationRect,
  PendingAnnotation,
} from "./types";
import { AnnotationContext, type AnnotationContextValue } from "./annotation-context";
import { querySelectorSafely } from "./selector";
import {
  DEFAULT_STORAGE_KEY_PREFIX,
  getStorageKey,
  readStoredBoolean,
  readStoredString,
  writeStoredBoolean,
  writeStoredString,
} from "./storage";
import { getCommentMap, getThreadRootId, normalizeComment, sortComments } from "./utils";

const supabaseClientCache = new Map<string, SupabaseClient>();
const DEFAULT_TABLE_NAME = "comments";
const PROJECT_ID_REQUIRED_MESSAGE =
  "This comments table has a project_id column. Pass projectId to <Annotation /> to keep projects isolated.";

type SupabaseErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

type ProjectIdColumnState = "unknown" | "present" | "absent" | "error";

function getSupabaseClient(url: string, key: string): SupabaseClient {
  const cacheKey = `${url}::${key}`;
  const cachedClient = supabaseClientCache.get(cacheKey);
  if (cachedClient) {
    return cachedClient;
  }

  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  supabaseClientCache.set(cacheKey, client);
  return client;
}

function getActivePath(pathOverride?: string): string {
  if (pathOverride) {
    return pathOverride;
  }

  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function getRealtimeChannelName(tableName: string, projectId: string | null): string {
  return projectId
    ? `annotation-comments:${tableName}:${projectId}`
    : `annotation-comments:${tableName}`;
}

function isMissingProjectIdColumnError(error: SupabaseErrorLike): boolean {
  const errorText = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (error.code === "42703" || error.code === "PGRST204") && errorText.includes("project_id");
}

export function AnnotationProvider({
  children,
  pagePath,
  projectId,
  storageKeyPrefix = DEFAULT_STORAGE_KEY_PREFIX,
  supabaseAnonKey,
  supabaseUrl,
  tableName = DEFAULT_TABLE_NAME,
}: PropsWithChildren<AnnotationOverlayProps>) {
  const client = useMemo(
    () => getSupabaseClient(supabaseUrl, supabaseAnonKey),
    [supabaseAnonKey, supabaseUrl],
  );
  const authorStorageKey = useMemo(
    () => getStorageKey(storageKeyPrefix, "author"),
    [storageKeyPrefix],
  );
  const showResolvedStorageKey = useMemo(
    () => getStorageKey(storageKeyPrefix, "show_resolved"),
    [storageKeyPrefix],
  );
  const normalizedProjectId = useMemo(() => projectId?.trim() || null, [projectId]);
  const [author, setAuthorState] = useState(() => readStoredString(authorStorageKey));
  const [showResolved, setShowResolvedState] = useState(() =>
    readStoredBoolean(showResolvedStorageKey, false),
  );
  const [currentPath, setCurrentPath] = useState(() => getActivePath(pagePath));
  const [comments, setComments] = useState<AnnotationComment[]>([]);
  const [composer, setComposer] = useState<PendingAnnotation | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [isAuthorGateOpen, setAuthorGateOpen] = useState(false);
  const [isMarkerHovered, setMarkerHovered] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const afterAuthorGateRef = useRef<(() => void) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projectIdColumnState, setProjectIdColumnState] = useState<ProjectIdColumnState>("unknown");

  const commentMap = useMemo(() => getCommentMap(comments), [comments]);
  const canUseCommentsTable = Boolean(normalizedProjectId) || projectIdColumnState === "absent";
  const isMissingProjectIdForSharedTable =
    !normalizedProjectId && projectIdColumnState === "present";

  const blockMissingProjectId = useCallback(() => {
    setComments([]);
    setErrorMessage(PROJECT_ID_REQUIRED_MESSAGE);
    setIsLoading(false);
  }, []);

  const canWriteComments = useCallback(() => {
    if (canUseCommentsTable) {
      return true;
    }

    if (isMissingProjectIdForSharedTable) {
      blockMissingProjectId();
    }

    return false;
  }, [blockMissingProjectId, canUseCommentsTable, isMissingProjectIdForSharedTable]);

  const loadComments = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    if (!canUseCommentsTable) {
      setComments([]);

      if (isMissingProjectIdForSharedTable) {
        setErrorMessage(PROJECT_ID_REQUIRED_MESSAGE);
        setIsLoading(false);
      }

      return;
    }

    let query = client.from(tableName).select("*").order("created_at", { ascending: true });
    if (normalizedProjectId) {
      query = query.eq("project_id", normalizedProjectId);
    }

    const { data, error } = await query;

    if (error) {
      setComments([]);
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    startTransition(() => {
      setComments(
        sortComments(
          (data ?? []).map((row) =>
            normalizeComment(row as Partial<AnnotationComment> & { id: string }),
          ),
        ),
      );
      setIsLoading(false);
    });
  }, [
    canUseCommentsTable,
    client,
    isMissingProjectIdForSharedTable,
    normalizedProjectId,
    tableName,
  ]);

  const syncPath = useCallback(() => {
    const nextPath = getActivePath(pagePath);
    setCurrentPath((previous) => (previous === nextPath ? previous : nextPath));
  }, [pagePath]);

  useEffect(() => {
    setAuthorState(readStoredString(authorStorageKey));
  }, [authorStorageKey]);

  useEffect(() => {
    setShowResolvedState(readStoredBoolean(showResolvedStorageKey, false));
  }, [showResolvedStorageKey]);

  useEffect(() => {
    setCurrentPath(getActivePath(pagePath));
  }, [pagePath]);

  useEffect(() => {
    if (!annotationMode) {
      setMarkerHovered(false);
    }
  }, [annotationMode]);

  useEffect(() => {
    if (normalizedProjectId) {
      setProjectIdColumnState("unknown");
      return;
    }

    let isActive = true;

    setProjectIdColumnState("unknown");
    setIsLoading(true);
    setErrorMessage(null);

    async function detectProjectIdColumn() {
      const { error } = await client.from(tableName).select("project_id").limit(1);

      if (!isActive) {
        return;
      }

      if (!error) {
        setProjectIdColumnState("present");
        setComments([]);
        setErrorMessage(PROJECT_ID_REQUIRED_MESSAGE);
        setIsLoading(false);
        return;
      }

      if (isMissingProjectIdColumnError(error)) {
        setProjectIdColumnState("absent");
        return;
      }

      setProjectIdColumnState("error");
      setComments([]);
      setErrorMessage(error.message);
      setIsLoading(false);
    }

    void detectProjectIdColumn();

    return () => {
      isActive = false;
    };
  }, [client, normalizedProjectId, tableName]);

  useEffect(() => {
    void loadComments();
  }, [currentPath, loadComments]);

  useEffect(() => {
    if (pagePath) {
      return;
    }

    window.addEventListener("popstate", syncPath);
    const intervalId = window.setInterval(syncPath, 500);

    return () => {
      window.removeEventListener("popstate", syncPath);
      window.clearInterval(intervalId);
    };
  }, [pagePath, syncPath]);

  useEffect(() => {
    if (!canUseCommentsTable) {
      return;
    }

    const channel = client
      .channel(getRealtimeChannelName(tableName, normalizedProjectId))
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: normalizedProjectId ? `project_id=eq.${normalizedProjectId}` : undefined,
          schema: "public",
          table: tableName,
        },
        () => {
          void loadComments();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [canUseCommentsTable, client, loadComments, normalizedProjectId, tableName]);

  const setAuthor = useCallback(
    (value: string) => {
      const nextValue = value.trim();
      writeStoredString(authorStorageKey, nextValue);
      setAuthorState(nextValue);
    },
    [authorStorageKey],
  );

  const closeAuthorGate = useCallback(() => {
    afterAuthorGateRef.current = null;
    setAuthorGateOpen(false);
  }, []);

  const submitAuthorGate = useCallback(
    (name: string) => {
      const next = name.trim();
      if (!next) {
        return;
      }

      flushSync(() => {
        setAuthor(next);
      });
      setAuthorGateOpen(false);
      const resume = afterAuthorGateRef.current;
      afterAuthorGateRef.current = null;
      resume?.();
    },
    [setAuthor],
  );

  const setShowResolved = useCallback(
    (value: boolean) => {
      writeStoredBoolean(showResolvedStorageKey, value);
      setShowResolvedState(value);
    },
    [showResolvedStorageKey],
  );

  const closeComposer = useCallback(() => {
    setComposer(null);
    setAuthorGateOpen(false);
    afterAuthorGateRef.current = null;
    setActiveThreadId(null);
  }, []);

  const startAnnotationMode = useCallback(() => {
    if (author) {
      setComposer(null);
      setActiveThreadId(null);
      setAnnotationMode(true);
      return;
    }

    afterAuthorGateRef.current = () => {
      setComposer(null);
      setActiveThreadId(null);
      setAnnotationMode(true);
    };
    setAuthorGateOpen(true);
  }, [author]);

  const cancelAnnotationMode = useCallback(() => {
    afterAuthorGateRef.current = null;
    setAuthorGateOpen(false);
    setAnnotationMode(false);
    setComposer(null);
    setActiveThreadId(null);
  }, []);

  const selectElement = useCallback((selector: string, rect: AnnotationRect) => {
    setComposer({
      parentId: null,
      selector,
      rect,
    });
    setActiveThreadId(null);
  }, []);

  const openThreadComposer = useCallback(
    (threadId: string, rect: AnnotationRect) => {
      const apply = () => {
        const target = commentMap.get(threadId);

        setComposer({
          parentId: threadId,
          selector: target?.selector ?? null,
          rect,
        });
        setActiveThreadId(threadId);
      };

      if (!author) {
        afterAuthorGateRef.current = apply;
        setAuthorGateOpen(true);
        return;
      }

      apply();
    },
    [author, commentMap],
  );

  const updateThreadRect = useCallback(
    async (commentId: string, rect: AnnotationRect, selector?: string | null) => {
      if (!canWriteComments()) {
        return false;
      }

      const threadId = getThreadRootId(commentId, commentMap);
      const target = commentMap.get(threadId);
      if (!target) {
        return false;
      }

      const previousRect = target.rect;
      const previousSelector = target.selector;
      const nextSelector = selector === undefined ? target.selector : selector;
      setErrorMessage(null);

      startTransition(() => {
        setComments((previous) =>
          previous.map((comment) =>
            comment.id === threadId ? { ...comment, rect, selector: nextSelector } : comment,
          ),
        );
      });

      let query = client
        .from(tableName)
        .update({ rect, selector: nextSelector })
        .eq("id", threadId);
      if (normalizedProjectId) {
        query = query.eq("project_id", normalizedProjectId);
      }

      const { error } = await query;

      if (error) {
        setErrorMessage(error.message);
        startTransition(() => {
          setComments((previous) =>
            previous.map((comment) =>
              comment.id === threadId
                ? { ...comment, rect: previousRect, selector: previousSelector }
                : comment,
            ),
          );
        });
        return false;
      }

      return true;
    },
    [canWriteComments, client, commentMap, normalizedProjectId, tableName],
  );

  const scrollToComment = useCallback(
    (commentId: string) => {
      const targetComment = commentMap.get(commentId);
      if (!targetComment) {
        return;
      }

      const threadId = getThreadRootId(commentId, commentMap);
      const anchorComment = commentMap.get(threadId) ?? targetComment;

      setActiveThreadId(threadId);

      const scrollToAnchor = (allowRectFallback: boolean) => {
        const targetElement = querySelectorSafely(anchorComment.selector);

        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center",
          });
          return true;
        }

        if (allowRectFallback && anchorComment.rect) {
          const nextTop = Math.max(anchorComment.rect.pageY - window.innerHeight / 2, 0);
          window.scrollTo({
            top: nextTop,
            behavior: "smooth",
          });
          return true;
        }

        return false;
      };

      if (anchorComment.page_path !== currentPath) {
        if (window.location.pathname !== anchorComment.page_path) {
          window.history.pushState({}, "", anchorComment.page_path);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }

        let attempts = 0;

        const scrollAfterNavigation = () => {
          attempts += 1;

          if (scrollToAnchor(false) || attempts >= 10) {
            return;
          }

          window.requestAnimationFrame(scrollAfterNavigation);
        };

        window.requestAnimationFrame(scrollAfterNavigation);
        return;
      }

      scrollToAnchor(true);
    },
    [commentMap, currentPath],
  );

  const submitComment = useCallback(
    async (text: string) => {
      if (!canWriteComments()) {
        return false;
      }

      if (!composer) {
        return false;
      }

      const nextText = text.trim();
      if (!nextText || !author) {
        return false;
      }

      setErrorMessage(null);

      const payload = {
        page_path: currentPath,
        selector: composer.parentId ? null : composer.selector,
        rect: composer.parentId ? null : composer.rect,
        text: nextText,
        author,
        resolved: false,
        parent_id: composer.parentId,
        ...(normalizedProjectId ? { project_id: normalizedProjectId } : {}),
      };

      const { data, error } = await client.from(tableName).insert(payload).select().single();

      if (error) {
        setErrorMessage(error.message);
        return false;
      }

      const inserted = normalizeComment(data as Partial<AnnotationComment> & { id: string });
      startTransition(() => {
        setComments((previous) => sortComments([...previous, inserted]));
      });
      if (!composer.parentId) {
        setComposer(null);
      }
      setActiveThreadId(
        inserted.parent_id ? getThreadRootId(inserted.parent_id, commentMap) : null,
      );
      return true;
    },
    [
      author,
      canWriteComments,
      client,
      commentMap,
      composer,
      currentPath,
      normalizedProjectId,
      tableName,
    ],
  );

  const removeThread = useCallback(
    async (commentId: string) => {
      if (!canWriteComments()) {
        return false;
      }

      const threadId = getThreadRootId(commentId, commentMap);
      const target = commentMap.get(threadId);
      if (!target) {
        return false;
      }

      setErrorMessage(null);

      const replyIds = comments
        .filter((comment) => comment.parent_id === threadId)
        .map((comment) => comment.id);

      if (replyIds.length > 0) {
        let repliesQuery = client.from(tableName).delete().in("id", replyIds);
        if (normalizedProjectId) {
          repliesQuery = repliesQuery.eq("project_id", normalizedProjectId);
        }

        const { error: repliesError } = await repliesQuery;

        if (repliesError) {
          setErrorMessage(repliesError.message);
          return false;
        }
      }

      let threadQuery = client.from(tableName).delete().eq("id", threadId);
      if (normalizedProjectId) {
        threadQuery = threadQuery.eq("project_id", normalizedProjectId);
      }

      const { error } = await threadQuery;

      if (error) {
        setErrorMessage(error.message);
        return false;
      }

      startTransition(() => {
        setComments((previous) =>
          previous.filter((comment) => comment.id !== threadId && comment.parent_id !== threadId),
        );
      });

      if (composer?.parentId === threadId) {
        closeComposer();
        return true;
      }

      setActiveThreadId((previous) => (previous === threadId ? null : previous));
      return true;
    },
    [
      canWriteComments,
      client,
      closeComposer,
      commentMap,
      comments,
      composer,
      normalizedProjectId,
      tableName,
    ],
  );

  const resolveAllComments = useCallback(async () => {
    if (!canWriteComments()) {
      return false;
    }

    const openThreadIds = comments
      .filter((comment) => comment.parent_id === null && !comment.resolved)
      .map((comment) => comment.id);

    if (openThreadIds.length === 0) {
      return false;
    }

    setErrorMessage(null);

    const resolvedAt = new Date().toISOString();
    let query = client
      .from(tableName)
      .update({
        resolved: true,
        resolved_at: resolvedAt,
      })
      .in("id", openThreadIds);
    if (normalizedProjectId) {
      query = query.eq("project_id", normalizedProjectId);
    }

    const { error } = await query;

    if (error) {
      setErrorMessage(error.message);
      return false;
    }

    const resolvedThreadIds = new Set(openThreadIds);

    startTransition(() => {
      setComments((previous) =>
        previous.map((comment) =>
          resolvedThreadIds.has(comment.id)
            ? {
                ...comment,
                resolved: true,
                resolved_at: resolvedAt,
              }
            : comment,
        ),
      );
    });

    if (composer?.parentId && resolvedThreadIds.has(composer.parentId)) {
      closeComposer();
      return true;
    }

    setActiveThreadId((previous) =>
      previous && resolvedThreadIds.has(previous) ? null : previous,
    );
    return true;
  }, [canWriteComments, client, closeComposer, comments, composer, normalizedProjectId, tableName]);

  const toggleResolved = useCallback(
    async (commentId: string) => {
      if (!canWriteComments()) {
        return;
      }

      const threadId = getThreadRootId(commentId, commentMap);
      const target = commentMap.get(threadId);
      if (!target) {
        return;
      }

      const nextResolved = !target.resolved;
      const resolvedAt = nextResolved ? new Date().toISOString() : null;
      let query = client
        .from(tableName)
        .update({
          resolved: nextResolved,
          resolved_at: resolvedAt,
        })
        .eq("id", threadId);
      if (normalizedProjectId) {
        query = query.eq("project_id", normalizedProjectId);
      }

      const { error } = await query;

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      startTransition(() => {
        setComments((previous) =>
          previous.map((comment) =>
            comment.id === threadId
              ? {
                  ...comment,
                  resolved: nextResolved,
                  resolved_at: resolvedAt,
                }
              : comment,
          ),
        );
      });
      if (nextResolved && composer?.parentId === threadId) {
        closeComposer();
        return;
      }

      setActiveThreadId(threadId);
    },
    [canWriteComments, client, closeComposer, commentMap, composer, normalizedProjectId, tableName],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      const isTyping =
        Boolean(target?.isContentEditable) ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");

      if ((event.key === "c" || event.key === "C") && !isTyping) {
        event.preventDefault();
        if (annotationMode) {
          cancelAnnotationMode();
        } else {
          startAnnotationMode();
        }
        return;
      }

      if (event.key === "Escape") {
        if (isAuthorGateOpen) {
          event.preventDefault();
          closeAuthorGate();
          return;
        }
        if (annotationMode || composer) {
          event.preventDefault();
          cancelAnnotationMode();
        }
        return;
      }

      if ((event.key === "r" || event.key === "R") && !isTyping && activeThreadId) {
        event.preventDefault();
        void toggleResolved(activeThreadId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    activeThreadId,
    annotationMode,
    cancelAnnotationMode,
    closeAuthorGate,
    composer,
    isAuthorGateOpen,
    startAnnotationMode,
    toggleResolved,
  ]);

  const value = useMemo<AnnotationContextValue>(
    () => ({
      activeThreadId,
      annotationMode,
      author,
      cancelAnnotationMode,
      comments,
      closeComposer,
      composer,
      currentPath,
      errorMessage,
      isAuthorGateOpen,
      isLoading,
      isMarkerHovered,
      storageKeyPrefix,
      closeAuthorGate,
      openThreadComposer,
      removeThread,
      resolveAllComments,
      scrollToComment,
      selectElement,
      setAuthor,
      setMarkerHovered,
      setShowResolved,
      showResolved,
      startAnnotationMode,
      submitAuthorGate,
      submitComment,
      toggleResolved,
      updateThreadRect,
    }),
    [
      activeThreadId,
      annotationMode,
      author,
      cancelAnnotationMode,
      closeAuthorGate,
      comments,
      closeComposer,
      composer,
      currentPath,
      errorMessage,
      isAuthorGateOpen,
      isLoading,
      isMarkerHovered,
      storageKeyPrefix,
      openThreadComposer,
      removeThread,
      resolveAllComments,
      scrollToComment,
      selectElement,
      setAuthor,
      setMarkerHovered,
      setShowResolved,
      showResolved,
      startAnnotationMode,
      submitAuthorGate,
      submitComment,
      toggleResolved,
      updateThreadRect,
    ],
  );

  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
}
