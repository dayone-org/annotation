import type { PostgrestError } from "@supabase/supabase-js";
import { createContext } from "react";
import type {
  AnnotationComment,
  AnnotationRect,
  CommentListTab,
  ForYouEntry,
  PendingAnnotation,
  StaffMember,
} from "./types";

export type AdminFunction =
  | "annotation_admin_project"
  | "annotation_admin_set_project"
  | "annotation_admin_new_project_key"
  | "annotation_admin_add_staff"
  | "annotation_admin_add_staff_bulk";

export type AnnotationContextValue = {
  activeThreadId: string | null;
  annotationMode: boolean;
  author: string;
  callAdmin: (
    fn: AdminFunction,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: PostgrestError | null }>;
  comments: AnnotationComment[];
  composer: PendingAnnotation | null;
  /** One-time code for a jump into another project, null if refused. */
  createHandoff: (projectId: string) => Promise<string | null>;
  currentPath: string;
  /** Staff for the mention picker; empty for guests. */
  directory: StaffMember[];
  errorMessage: string | null;
  forYou: ForYouEntry[];
  isLoading: boolean;
  isAdmin: boolean;
  isGuest: boolean;
  isJoining: boolean;
  joinAsGuest: (name: string) => Promise<boolean>;
  /**
   * hidden: no valid key, overlay invisible; join: guest with a project link enters a name;
   * admin: an admin on a page without a project, only the admin tile.
   */
  phase: "hidden" | "join" | "admin" | "ready";
  /** Project of the page, null without access. */
  projectId: string | null;
  isMarkerHovered: boolean;
  markAllRead: () => Promise<void>;
  /** Goes to the thread (page switch included) and opens it. */
  openThread: (threadId: string) => void;
  personId: string | null;
  storageKeyPrefix: string;
  setMarkerHovered: (hovered: boolean) => void;
  renameSelf: (name: string) => Promise<boolean>;
  /** Tab of the comment list; "resolved" also shows resolved markers on the page. */
  listTab: CommentListTab;
  setListTab: (value: CommentListTab) => void;
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
  submitComment: (text: string, mentionIds?: string[]) => Promise<boolean>;
  scrollToComment: (commentId: string) => void;
  removeThread: (commentId: string) => Promise<boolean>;
  resolveAllComments: () => Promise<boolean>;
  toggleResolved: (commentId: string) => Promise<void>;
};

export const AnnotationContext = createContext<AnnotationContextValue | null>(null);
