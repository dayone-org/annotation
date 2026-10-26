import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
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
  DEFAULT_STORAGE_KEY_PREFIX,
  getStorageKey,
  readStoredBoolean,
  readStoredString,
  takeLinkKey,
  writeStoredBoolean,
  writeStoredString,
} from "./storage";
import { getCommentMap, getThreadRootId, normalizeComment, sortComments } from "./utils";

const supabaseClientCache = new Map<string, SupabaseClient>();
const DEFAULT_TABLE_NAME = "comments";
// Den Anzeigenamen liefert die Person beim Lesen, damit Umbenennungen auch alte Kommentare treffen.
const COMMENT_SELECT = "*, author:annotation_people(display_name, is_guest)";

type Session = {
  project_id: string;
  person_id: string;
  display_name: string;
  is_guest: boolean;
  realtime_topic: string;
};

type CommentRow = Omit<Partial<AnnotationComment>, "author"> & {
  id: string;
  author?: { display_name: string; is_guest: boolean } | null;
};

function toComment({ author, ...row }: CommentRow): AnnotationComment {
  return normalizeComment({
    ...row,
    author: author?.display_name,
    author_is_guest: author?.is_guest ?? false,
  });
}

function getSupabaseClient(url: string, anonKey: string, accessKey: string): SupabaseClient {
  const cacheKey = `${url}::${anonKey}::${accessKey}`;
  const cachedClient = supabaseClientCache.get(cacheKey);
  if (cachedClient) {
    return cachedClient;
  }

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    // Die Datenbank prüft bei jeder Anfrage Person und Projektzugriff anhand dieses Schlüssels.
    global: accessKey ? { headers: { "x-annotation-key": accessKey } } : undefined,
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
  pagePath,
  projectId,
  storageKeyPrefix = DEFAULT_STORAGE_KEY_PREFIX,
  supabaseAnonKey,
  supabaseUrl,
  tableName = DEFAULT_TABLE_NAME,
}: PropsWithChildren<AnnotationOverlayProps>) {
  const keyStorageKey = getStorageKey(storageKeyPrefix, "key");
  const [linkKey] = useState(takeLinkKey);
  const [accessKey, setAccessKey] = useState(() => readStoredString(keyStorageKey));
  // Projekt-Link eines Gasts, der noch keinen Namen eingegeben hat.
  const [pendingProjectKey, setPendingProjectKey] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionCheck, setSessionCheck] = useState(0);
  const client = useMemo(
    () => getSupabaseClient(supabaseUrl, supabaseAnonKey, accessKey),
    [accessKey, supabaseAnonKey, supabaseUrl],
  );
  const showResolvedStorageKey = useMemo(
    () => getStorageKey(storageKeyPrefix, "show_resolved"),
    [storageKeyPrefix],
  );
  const projectOverride = projectId?.trim() || null;
  const normalizedProjectId = session?.project_id ?? null;
  const personId = session?.person_id ?? null;
  const author = session?.display_name ?? "";
  const phase = session ? "ready" : pendingProjectKey ? "join" : "hidden";
  const [showResolved, setShowResolvedState] = useState(() =>
    readStoredBoolean(showResolvedStorageKey, false),
  );
  const [currentPath, setCurrentPath] = useState(() => getActivePath(pagePath));
  const [comments, setComments] = useState<AnnotationComment[]>([]);
  const [composer, setComposer] = useState<PendingAnnotation | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [isMarkerHovered, setMarkerHovered] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const commentMap = useMemo(() => getCommentMap(comments), [comments]);
  const canWriteComments = useCallback(() => Boolean(session), [session]);

  const loadComments = useCallback(async () => {
    if (!normalizedProjectId) {
      setComments([]);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await client
      .from(tableName)
      .select(COMMENT_SELECT)
      .eq("project_id", normalizedProjectId)
      .order("created_at", { ascending: true });

    if (error) {
      setComments([]);
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    startTransition(() => {
      setComments(sortComments((data ?? []).map((row) => toComment(row as CommentRow))));
      setIsLoading(false);
    });
  }, [client, normalizedProjectId, tableName]);

  const syncPath = useCallback(() => {
    const nextPath = getActivePath(pagePath);
    setCurrentPath((previous) => (previous === nextPath ? previous : nextPath));
  }, [pagePath]);

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

  // Wer bin ich auf dieser Seite? Reihenfolge: persönlicher Link, gespeicherter Schlüssel,
  // Projekt-Link (dann fragt das Overlay nach dem Namen). Ohne Treffer bleibt das Overlay unsichtbar.
  useEffect(() => {
    let isActive = true;
    const args = { p_host: window.location.host, p_project_id: projectOverride };
    const whoami = async (key: string) => {
      if (!key) {
        return null;
      }
      const { data } = await getSupabaseClient(supabaseUrl, supabaseAnonKey, key).rpc(
        "annotation_whoami",
        args,
      );
      return (data as Session[] | null)?.[0] ?? null;
    };

    void (async () => {
      if (linkKey && linkKey !== accessKey && (await whoami(linkKey))) {
        if (isActive) {
          writeStoredString(keyStorageKey, linkKey);
          setAccessKey(linkKey);
        }
        return;
      }

      const me = await whoami(accessKey);
      if (!isActive) {
        return;
      }
      setSession(me);
      if (me) {
        setPendingProjectKey(null);
        return;
      }

      setIsLoading(false);
      if (linkKey) {
        const { data } = await getSupabaseClient(supabaseUrl, supabaseAnonKey, "").rpc(
          "annotation_project_key_ok",
          { ...args, p_key: linkKey },
        );
        if (isActive) {
          setPendingProjectKey(data === true ? linkKey : null);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [
    accessKey,
    keyStorageKey,
    linkKey,
    projectOverride,
    sessionCheck,
    supabaseAnonKey,
    supabaseUrl,
  ]);

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

  // postgres_changes sieht den Schlüssel nicht. Die DB pingt ein geheimes Topic, das nur whoami mit
  // gültigem Schlüssel verrät; nach einem Entzug wird es neu gewürfelt, deshalb auch whoami neu prüfen.
  const realtimeTopic = session?.realtime_topic ?? null;
  useEffect(() => {
    if (!realtimeTopic) {
      return;
    }

    const channel = client
      .channel(`annotation:${realtimeTopic}`)
      .on("broadcast", { event: "changed" }, () => {
        setSessionCheck((value) => value + 1);
        void loadComments();
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, loadComments, realtimeTopic]);

  const joinAsGuest = useCallback(
    async (name: string) => {
      if (!pendingProjectKey) {
        return false;
      }

      setErrorMessage(null);
      const { data, error } = await getSupabaseClient(supabaseUrl, supabaseAnonKey, "").rpc(
        "annotation_join",
        { p_key: pendingProjectKey, p_display_name: name },
      );

      if (error || typeof data !== "string") {
        setErrorMessage(error?.message ?? "Joining failed.");
        return false;
      }

      writeStoredString(keyStorageKey, data);
      setAccessKey(data);
      return true;
    },
    [keyStorageKey, pendingProjectKey, supabaseAnonKey, supabaseUrl],
  );

  const renameSelf = useCallback(
    async (name: string) => {
      const next = name.trim();
      if (!session?.is_guest || next === session.display_name) {
        return false;
      }

      setErrorMessage(null);
      const { error } = await client.rpc("annotation_rename", { p_display_name: next });

      if (error) {
        setErrorMessage(error.message);
        return false;
      }

      setSessionCheck((value) => value + 1);
      void loadComments();
      return true;
    },
    [client, loadComments, session],
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
    setActiveThreadId(null);
  }, []);

  const startAnnotationMode = useCallback(() => {
    if (!session) {
      return;
    }

    setComposer(null);
    setActiveThreadId(null);
    setAnnotationMode(true);
  }, [session]);

  const cancelAnnotationMode = useCallback(() => {
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
      if (!session) {
        return;
      }

      const target = commentMap.get(threadId);
      setComposer({
        parentId: threadId,
        selector: target?.selector ?? null,
        rect,
      });
      setActiveThreadId(threadId);
    },
    [commentMap, session],
  );

  const updateThreadRect = useCallback(
    async (commentId: string, rect: AnnotationRect, selector?: string | null) => {
      if (!canWriteComments()) {
        return false;
      }

      const threadId = getThreadRootId(commentId, commentMap);
      const target = commentMap.get(threadId);
      // Verschieben darf nur der Autor; die DB prüft das ebenfalls.
      if (!target || target.author_id !== personId) {
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
    [canWriteComments, client, commentMap, normalizedProjectId, personId, tableName],
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
      if (!nextText) {
        return false;
      }

      setErrorMessage(null);

      const payload = {
        page_path: currentPath,
        selector: composer.parentId ? null : composer.selector,
        rect: composer.parentId ? null : composer.rect,
        text: nextText,
        parent_id: composer.parentId,
        project_id: normalizedProjectId,
      };

      const { data, error } = await client
        .from(tableName)
        .insert(payload)
        .select(COMMENT_SELECT)
        .single();

      if (error) {
        setErrorMessage(error.message);
        return false;
      }

      const inserted = toComment(data as CommentRow);
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
    [canWriteComments, client, commentMap, composer, currentPath, normalizedProjectId, tableName],
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

      // Antworten fallen per Cascade mit; RLS löscht nur eigene Threads.
      const { data, error } = await client
        .from(tableName)
        .delete()
        .eq("id", threadId)
        .eq("project_id", normalizedProjectId ?? "")
        .select("id");

      if (error || !data?.length) {
        setErrorMessage(error?.message ?? "Only the author can remove this thread.");
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
    [canWriteComments, client, closeComposer, commentMap, composer, normalizedProjectId, tableName],
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
    let query = client.from(tableName).update({ resolved: true }).in("id", openThreadIds);
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
      let query = client.from(tableName).update({ resolved: nextResolved }).eq("id", threadId);
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
    composer,
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
      isGuest: session?.is_guest ?? false,
      joinAsGuest,
      personId,
      phase,
      closeComposer,
      composer,
      currentPath,
      errorMessage,
      isLoading,
      isMarkerHovered,
      storageKeyPrefix,
      openThreadComposer,
      removeThread,
      resolveAllComments,
      scrollToComment,
      selectElement,
      renameSelf,
      setMarkerHovered,
      setShowResolved,
      showResolved,
      startAnnotationMode,
      submitComment,
      toggleResolved,
      updateThreadRect,
    }),
    [
      activeThreadId,
      annotationMode,
      author,
      cancelAnnotationMode,
      comments,
      joinAsGuest,
      personId,
      phase,
      session,
      closeComposer,
      composer,
      currentPath,
      errorMessage,
      isLoading,
      isMarkerHovered,
      storageKeyPrefix,
      openThreadComposer,
      removeThread,
      resolveAllComments,
      scrollToComment,
      selectElement,
      renameSelf,
      setMarkerHovered,
      setShowResolved,
      showResolved,
      startAnnotationMode,
      submitComment,
      toggleResolved,
      updateThreadRect,
    ],
  );

  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
}
