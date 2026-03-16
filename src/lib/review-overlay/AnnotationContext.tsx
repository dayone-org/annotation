import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AnnotationContext, type AnnotationContextValue } from './review-context'
import { querySelectorSafely } from './selector'
import {
  ANNOTATION_AUTHOR_KEY,
  ANNOTATION_SHOW_RESOLVED_KEY,
  readStoredBoolean,
  readStoredString,
  writeStoredBoolean,
  writeStoredString,
} from './storage'
import type { AnnotationComment, AnnotationOverlayProps, AnnotationRect, PendingAnnotation } from './types'
import {
  getCommentMap,
  getThreadRootId,
  measureRect,
  normalizeComment,
  rectToViewport,
  sortComments,
} from './utils'

function createSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function getActivePath(pathOverride?: string): string {
  if (pathOverride) {
    return pathOverride
  }

  return typeof window === 'undefined' ? '/' : window.location.pathname
}

export function AnnotationProvider({
  children,
  supabaseAnonKey,
  supabaseUrl,
  pagePath,
  initialPanelOpen = false,
}: PropsWithChildren<AnnotationOverlayProps>) {
  const [client] = useState(() => createSupabaseClient(supabaseUrl, supabaseAnonKey))
  const [author, setAuthorState] = useState(() => readStoredString(ANNOTATION_AUTHOR_KEY))
  const [showResolved, setShowResolvedState] = useState(() => readStoredBoolean(ANNOTATION_SHOW_RESOLVED_KEY, false))
  const [currentPath, setCurrentPath] = useState(() => getActivePath(pagePath))
  const [comments, setComments] = useState<AnnotationComment[]>([])
  const [hoveredRect, setHoveredRect] = useState<AnnotationRect | null>(null)
  const [flashRect, setFlashRect] = useState<AnnotationRect | null>(null)
  const [composer, setComposer] = useState<PendingAnnotation | null>(null)
  const [commentMode, setCommentMode] = useState(false)
  const [isPanelOpen, setPanelOpen] = useState(initialPanelOpen)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const commentMap = useMemo(() => getCommentMap(comments), [comments])

  const loadComments = useCallback(
    async (path: string) => {
      setIsLoading(true)
      setErrorMessage(null)

      const { data, error } = await client
        .from('comments')
        .select('*')
        .eq('page_path', path)
        .order('created_at', { ascending: true })

      if (error) {
        setComments([])
        setErrorMessage(error.message)
        setIsLoading(false)
        return
      }

      startTransition(() => {
        setComments(
          sortComments(
            (data ?? []).map((row) =>
              normalizeComment(row as Partial<AnnotationComment> & { id: string }),
            ),
          ),
        )
        setIsLoading(false)
      })
    },
    [client],
  )

  const syncPath = useCallback(() => {
    const nextPath = getActivePath(pagePath)
    setCurrentPath((previous) => (previous === nextPath ? previous : nextPath))
  }, [pagePath])

  useEffect(() => {
    setCurrentPath(getActivePath(pagePath))
  }, [pagePath])

  useEffect(() => {
    void loadComments(currentPath)
  }, [currentPath, loadComments])

  useEffect(() => {
    if (pagePath) {
      return
    }

    window.addEventListener('popstate', syncPath)
    const intervalId = window.setInterval(syncPath, 500)

    return () => {
      window.removeEventListener('popstate', syncPath)
      window.clearInterval(intervalId)
    }
  }, [pagePath, syncPath])

  useEffect(() => {
    const channel = client
      .channel(`annotation-comments:${currentPath}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `page_path=eq.${currentPath}`,
        },
        () => {
          void loadComments(currentPath)
        },
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [client, currentPath, loadComments])

  useEffect(() => {
    if (!flashRect) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setFlashRect(null)
    }, 1200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [flashRect])

  const setAuthor = useCallback((value: string) => {
    const nextValue = value.trim()
    writeStoredString(ANNOTATION_AUTHOR_KEY, nextValue)
    setAuthorState(nextValue)
  }, [])

  const setShowResolved = useCallback((value: boolean) => {
    writeStoredBoolean(ANNOTATION_SHOW_RESOLVED_KEY, value)
    setShowResolvedState(value)
  }, [])

  const closeComposer = useCallback(() => {
    setComposer(null)
    setCommentMode(false)
    setHoveredRect(null)
  }, [])

  const ensureAuthor = useCallback(() => {
    if (author) {
      return true
    }

    setPanelOpen(true)
    return false
  }, [author])

  const startCommentMode = useCallback(() => {
    if (!ensureAuthor()) {
      return
    }

    setComposer(null)
    setHoveredRect(null)
    setCommentMode(true)
    setPanelOpen(true)
  }, [ensureAuthor])

  const cancelCommentMode = useCallback(() => {
    setCommentMode(false)
    setHoveredRect(null)
    setComposer(null)
  }, [])

  const selectElement = useCallback((selector: string, rect: AnnotationRect) => {
    setComposer({
      parentId: null,
      selector,
      rect,
    })
    setCommentMode(false)
    setHoveredRect(rect)
    setPanelOpen(true)
  }, [])

  const openReplyComposer = useCallback(
    (parentId: string) => {
      if (!ensureAuthor()) {
        return
      }

      const threadId = getThreadRootId(parentId, commentMap)
      const parent = commentMap.get(threadId) ?? commentMap.get(parentId) ?? null
      setComposer({
        parentId,
        selector: null,
        rect: parent?.rect ?? null,
      })
      setActiveThreadId(threadId)
      setPanelOpen(true)
      setCommentMode(false)
    },
    [commentMap, ensureAuthor],
  )

  const scrollToComment = useCallback(
    (commentId: string) => {
      const targetComment = commentMap.get(commentId)
      if (!targetComment) {
        return
      }

      const threadId = getThreadRootId(commentId, commentMap)
      const anchorComment = commentMap.get(threadId) ?? targetComment
      const targetElement = querySelectorSafely(anchorComment.selector)

      setActiveThreadId(threadId)
      setPanelOpen(true)

      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center',
        })
        setFlashRect(measureRect(targetElement))
        return
      }

      if (anchorComment.rect) {
        const nextTop = Math.max(anchorComment.rect.pageY - window.innerHeight / 2, 0)
        window.scrollTo({
          top: nextTop,
          behavior: 'smooth',
        })
        setFlashRect(rectToViewport(anchorComment.rect))
      }
    },
    [commentMap],
  )

  const submitComment = useCallback(
    async (text: string) => {
      if (!composer) {
        return false
      }

      const nextText = text.trim()
      if (!nextText || !author) {
        return false
      }

      setErrorMessage(null)

      const payload = {
        page_path: currentPath,
        selector: composer.parentId ? null : composer.selector,
        rect: composer.parentId ? null : composer.rect,
        text: nextText,
        author,
        resolved: false,
        parent_id: composer.parentId,
      }

      const { data, error } = await client.from('comments').insert(payload).select().single()

      if (error) {
        setErrorMessage(error.message)
        return false
      }

      const inserted = normalizeComment(data as Partial<AnnotationComment> & { id: string })
      startTransition(() => {
        setComments((previous) => sortComments([...previous, inserted]))
      })
      setComposer(null)
      setCommentMode(false)
      setHoveredRect(null)
      setActiveThreadId(inserted.parent_id ? getThreadRootId(inserted.parent_id, commentMap) : inserted.id)
      return true
    },
    [author, client, commentMap, composer, currentPath],
  )

  const toggleResolved = useCallback(
    async (commentId: string) => {
      const threadId = getThreadRootId(commentId, commentMap)
      const target = commentMap.get(threadId)
      if (!target) {
        return
      }

      const nextResolved = !target.resolved
      const resolvedAt = nextResolved ? new Date().toISOString() : null
      const { error } = await client
        .from('comments')
        .update({
          resolved: nextResolved,
          resolved_at: resolvedAt,
        })
        .eq('id', threadId)

      if (error) {
        setErrorMessage(error.message)
        return
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
        )
      })
      setActiveThreadId(threadId)
    },
    [client, commentMap],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      const target = event.target instanceof HTMLElement ? event.target : null
      const isTyping =
        Boolean(target?.isContentEditable) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')

      if ((event.key === 'c' || event.key === 'C') && !isTyping) {
        event.preventDefault()
        startCommentMode()
        return
      }

      if (event.key === 'Escape') {
        if (commentMode || composer) {
          event.preventDefault()
          cancelCommentMode()
        }
        return
      }

      if ((event.key === 'r' || event.key === 'R') && !isTyping && activeThreadId) {
        event.preventDefault()
        void toggleResolved(activeThreadId)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activeThreadId, cancelCommentMode, commentMode, composer, startCommentMode, toggleResolved])

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
      flashRect,
      hoveredRect,
      isLoading,
      isPanelOpen,
      openReplyComposer,
      scrollToComment,
      selectElement,
      setAuthor,
      setHoveredRect,
      setPanelOpen,
      setShowResolved,
      showResolved,
      startCommentMode,
      submitComment,
      toggleResolved,
    }),
    [
      activeThreadId,
      author,
      cancelCommentMode,
      commentMode,
      comments,
      closeComposer,
      composer,
      currentPath,
      errorMessage,
      flashRect,
      hoveredRect,
      isLoading,
      isPanelOpen,
      openReplyComposer,
      scrollToComment,
      selectElement,
      setAuthor,
      setShowResolved,
      showResolved,
      startCommentMode,
      submitComment,
      toggleResolved,
    ],
  )

  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>
}
