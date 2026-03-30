import { createContext } from "react";
import type { AnnotationComment, AnnotationRect, PendingAnnotation } from "./types";

export type AnnotationContextValue = {
  activeThreadId: string | null;
  annotationMode: boolean;
  author: string;
  comments: AnnotationComment[];
  composer: PendingAnnotation | null;
  currentPath: string;
  errorMessage: string | null;
  isLoading: boolean;
  isAuthorGateOpen: boolean;
  isMarkerHovered: boolean;
  closeAuthorGate: () => void;
  setMarkerHovered: (hovered: boolean) => void;
  setAuthor: (value: string) => void;
  submitAuthorGate: (name: string) => void;
  setShowResolved: (value: boolean) => void;
  showResolved: boolean;
  startAnnotationMode: () => void;
  cancelAnnotationMode: () => void;
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
  resolveAllComments: () => Promise<boolean>;
  toggleResolved: (commentId: string) => Promise<void>;
};

export const AnnotationContext = createContext<AnnotationContextValue | null>(null);
