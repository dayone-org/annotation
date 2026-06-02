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
  screenshot: AnnotationScreenshot | null;
  author: string;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
  parent_id: string | null;
};

export type AnnotationScreenshot = {
  id: string;
  name: string;
  type: string;
  size: number;
  data_url: string;
  created_at: string;
  viewport?: {
    width: number;
    height: number;
    scroll_x: number;
    scroll_y: number;
    device_pixel_ratio: number;
  };
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
  projectId?: string;
  storageKeyPrefix?: string;
  tableName?: string;
};

export type AnnotationProps = AnnotationOverlayProps;
