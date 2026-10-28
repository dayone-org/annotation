export type AnnotationRect = {
  x: number;
  y: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  pageX: number;
  pageY: number;
  anchorXPercent?: number;
  anchorYPercent?: number;
};

export type AnnotationComment = {
  id: string;
  page_path: string;
  project_id?: string | null;
  selector: string | null;
  rect: AnnotationRect | null;
  text: string;
  author: string;
  author_id?: string | null;
  author_is_guest?: boolean;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
  parent_id: string | null;
  /** IDs of mentioned staff. */
  mentions: string[];
};

export type StaffMember = { person_id: string; display_name: string };

/** A "For you" entry: a mention of me or a reply in a thread I started, from any accessible project. */
export type ForYouEntry = {
  project_id: string;
  project_name: string;
  project_domain: string | null;
  page_path: string;
  thread_id: string;
  comment_id: string;
  kind: "mention" | "reply";
  actor_name: string;
  /** First 140 characters of the comment that created the entry (cut by the database). */
  text_start: string;
  created_at: string;
  is_read: boolean;
};

export type AnnotationPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type MarkerPosition = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PendingAnnotation = {
  parentId: string | null;
  selector: string | null;
  rect: AnnotationRect | null;
};

export type AnnotationOverlayProps = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  pagePath?: string;
  position?: AnnotationPosition;
  /** Overrides the project that is otherwise found by the domain (location.host). */
  projectId?: string;
  storageKeyPrefix?: string;
};

export type AnnotationProps = AnnotationOverlayProps;
