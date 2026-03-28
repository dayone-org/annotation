import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { flushSync } from "react-dom";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type {
  AnnotationComment,
  AnnotationOverlayProps,
  AnnotationRect,
  PendingAnnotation,
} from "./types";
import { AnnotationContext, type AnnotationContextValue } from "./annotation-context";
import { querySelectorSafely } from "./selector";
import {
  ANNOTATION_AUTHOR_KEY,
  ANNOTATION_SHOW_RESOLVED_KEY,
  readStoredBoolean,
  readStoredString,
  writeStoredBoolean,
  writeStoredString,
} from "./storage";
import { getCommentMap, getThreadRootId, normalizeComment, sortComments } from "./utils";

const supabaseClientCache = new Map<string, SupabaseClient>();

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

export function AnnotationProvider({
  children,
  supabaseAnonKey,
  supabaseUrl,
  pagePath,
  initialPanelOpen = false,
}: PropsWithChildren<AnnotationOverlayProps>) {
  const client = useMemo(
    () => getSupabaseClient(supabaseUrl, supabaseAnonKey),
    [supabaseAnonKey, supabaseUrl],
  );
  const [author, setAuthorState] = useState(() => readStoredString(ANNOTATION_AUTHOR_KEY));
  const [showResolved, setShowResolvedState] = useState(() =>
    readStoredBoolean(ANNOTATION_SHOW_RESOLVED_KEY, false),
  );
  const [currentPath, setCurrentPath] = useState(() => getActivePath(pagePath));
  const [comments, setComments] = useState<AnnotationComment[]>([]);
  const [composer, setComposer] = useState<PendingAnnotation | null>(null);
  const [commentMode, setCommentMode] = useState(false);
  const [isAuthorGateOpen, setAuthorGateOpen] = useState(false);
  const [isPanelOpen, setPanelOpen] = useState(initialPanelOpen);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const afterAuthorGateRef = useRef<(() => void) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const commentMap = useMemo(() => getCommentMap(comments), [comments]);

  const loadComments = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await client
      .from("comments")
      .select("*")
      .order("created_at", { ascending: true });

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
  }, [client]);

  const syncPath = useCallback(() => {
    const nextPath = getActivePath(pagePath);
    setCurrentPath((previous) => (previous === nextPath ? previous : nextPath));
  }, [pagePath]);

  useEffect(() => {
    setCurrentPath(getActivePath(pagePath));
  }, [pagePath]);

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
    const channel = client
      .channel("annotation-comments")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
        },
        () => {
          void loadComments();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, loadComments]);

  const setAuthor = useCallback((value: string) => {
    const nextValue = value.trim();
    writeStoredString(ANNOTATION_AUTHOR_KEY, nextValue);
    setAuthorState(nextValue);
  }, []);

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
        setAuthor(name);
      });
      setAuthorGateOpen(false);
      const resume = afterAuthorGateRef.current;
      afterAuthorGateRef.current = null;
      resume?.();
    },
    [setAuthor],
  );

  const setShowResolved = useCallback((value: boolean) => {
    writeStoredBoolean(ANNOTATION_SHOW_RESOLVED_KEY, value);
    setShowResolvedState(value);
  }, []);

  const closeComposer = useCallback(() => {
    setComposer(null);
    setCommentMode(false);
    setPanelOpen(false);
    setAuthorGateOpen(false);
    afterAuthorGateRef.current = null;
    setActiveThreadId(null);
  }, []);

  const startCommentMode = useCallback(() => {
    if (author) {
      setComposer(null);
      setCommentMode(true);
      setPanelOpen(false);
      return;
    }

    afterAuthorGateRef.current = () => {
      setComposer(null);
      setCommentMode(true);
      setPanelOpen(false);
    };
    setAuthorGateOpen(true);
  }, [author]);

  const cancelCommentMode = useCallback(() => {
    afterAuthorGateRef.current = null;
    setAuthorGateOpen(false);
    setCommentMode(false);
    setComposer(null);
    setPanelOpen(false);
    setActiveThreadId(null);
  }, []);

  const selectElement = useCallback((selector: string, rect: AnnotationRect) => {
    setComposer({
      parentId: null,
      selector,
      rect,
    });
    setCommentMode(false);
    setPanelOpen(false);
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
        setCommentMode(false);
        setPanelOpen(false);
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

      const { error } = await client
        .from("comments")
        .update({ rect, selector: nextSelector })
        .eq("id", threadId);

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
    [client, commentMap],
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
      setPanelOpen(true);

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
      };

      const { data, error } = await client.from("comments").insert(payload).select().single();

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
      setCommentMode(false);
      setActiveThreadId(
        inserted.parent_id ? getThreadRootId(inserted.parent_id, commentMap) : null,
      );
      return true;
    },
    [author, client, commentMap, composer, currentPath],
  );

  const removeThread = useCallback(
    async (commentId: string) => {
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
        const { error: repliesError } = await client.from("comments").delete().in("id", replyIds);

        if (repliesError) {
          setErrorMessage(repliesError.message);
          return false;
        }
      }

      const { error } = await client.from("comments").delete().eq("id", threadId);

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
    [client, closeComposer, commentMap, comments, composer],
  );

  const toggleResolved = useCallback(
    async (commentId: string) => {
      const threadId = getThreadRootId(commentId, commentMap);
      const target = commentMap.get(threadId);
      if (!target) {
        return;
      }

      const nextResolved = !target.resolved;
      const resolvedAt = nextResolved ? new Date().toISOString() : null;
      const { error } = await client
        .from("comments")
        .update({
          resolved: nextResolved,
          resolved_at: resolvedAt,
        })
        .eq("id", threadId);

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
    [client, closeComposer, commentMap, composer],
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
        if (commentMode) {
          cancelCommentMode();
        } else {
          startCommentMode();
        }
        return;
      }

      if (event.key === "Escape") {
        if (isAuthorGateOpen) {
          event.preventDefault();
          closeAuthorGate();
          return;
        }
        if (commentMode || composer) {
          event.preventDefault();
          cancelCommentMode();
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
    cancelCommentMode,
    closeAuthorGate,
    commentMode,
    composer,
    isAuthorGateOpen,
    startCommentMode,
    toggleResolved,
  ]);

  const value = useMemo<AnnotationContextValue>(
    () => ({
      activeThreadId,
      author,
      cancelCommentMode,
      commentMode,
      comments,
      closeComposer,
      composer,
      currentPath,
      errorMessage,
      isAuthorGateOpen,
      isLoading,
      isPanelOpen,
      closeAuthorGate,
      openThreadComposer,
      removeThread,
      scrollToComment,
      selectElement,
      setAuthor,
      setPanelOpen,
      setShowResolved,
      showResolved,
      startCommentMode,
      submitAuthorGate,
      submitComment,
      toggleResolved,
      updateThreadRect,
    }),
    [
      activeThreadId,
      author,
      cancelCommentMode,
      closeAuthorGate,
      commentMode,
      comments,
      closeComposer,
      composer,
      currentPath,
      errorMessage,
      isAuthorGateOpen,
      isLoading,
      isPanelOpen,
      openThreadComposer,
      removeThread,
      scrollToComment,
      selectElement,
      setAuthor,
      setShowResolved,
      showResolved,
      startCommentMode,
      submitAuthorGate,
      submitComment,
      toggleResolved,
      updateThreadRect,
    ],
  );

  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
}
