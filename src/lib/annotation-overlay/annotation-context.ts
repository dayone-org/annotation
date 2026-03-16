import { createContext } from 'react'
import type { AnnotationComment, AnnotationRect, PendingAnnotation } from './types'

export type AnnotationContextValue = {
  activeThreadId: string | null
  author: string
  commentMode: boolean
  comments: AnnotationComment[]
  composer: PendingAnnotation | null
  currentPath: string
  errorMessage: string | null
  isLoading: boolean
  isPanelOpen: boolean
  setPanelOpen: (open: boolean) => void
  setAuthor: (value: string) => void
  setShowResolved: (value: boolean) => void
  showResolved: boolean
  startCommentMode: () => void
  cancelCommentMode: () => void
  selectElement: (selector: string, rect: AnnotationRect) => void
  openThreadComposer: (threadId: string, rect: AnnotationRect) => void
  closeComposer: () => void
  submitComment: (text: string) => Promise<boolean>
  scrollToComment: (commentId: string) => void
  toggleResolved: (commentId: string) => Promise<void>
}

export const AnnotationContext = createContext<AnnotationContextValue | null>(null)
