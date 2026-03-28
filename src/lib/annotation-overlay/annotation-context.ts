import { createContext } from "react";
import type { AnnotationComment, AnnotationRect, PendingAnnotation } from "./types";

export type AnnotationContextValue = {
  activeThreadId: string | null;
  author: string;
  commentMode: boolean;
  comments: AnnotationComment[];
  composer: PendingAnnotation | null;
  currentPath: string;
  errorMessage: string | null;
  isLoading: boolean;
  isAuthorGateOpen: boolean;
  isPanelOpen: boolean;
  closeAuthorGate: () => void;
  setPanelOpen: (open: boolean) => void;
  setAuthor: (value: string) => void;
  submitAuthorGate: (name: string) => void;
  setShowResolved: (value: boolean) => void;
  showResolved: boolean;
  startCommentMode: () => void;
  cancelCommentMode: () => void;
  selectElement: (selector: string, rect: AnnotationRect) => void;
  openThreadComposer: (threadId: string, rect: AnnotationRect) => void;
  updateThreadRect: (
    commentId: string,
    rect: AnnotationRect,
    selector?: string | null,
  ) => Promise<boolean>;
  closeComposer: () => void;
  submitComment: (text: string) => Promise<boolean>;
  scrollToComment: (commentId: string) => void;
  removeThread: (commentId: string) => Promise<boolean>;
  toggleResolved: (commentId: string) => Promise<void>;
};

export const AnnotationContext = createContext<AnnotationContextValue | null>(null);
