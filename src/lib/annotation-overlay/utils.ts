import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { AnnotationComment, AnnotationRect, MarkerPosition } from "./types";

dayjs.extend(relativeTime);

export function measureRect(target: HTMLElement | DOMRect): AnnotationRect {
  const rect = target instanceof DOMRect ? target : target.getBoundingClientRect();
  const pageX = rect.left + window.scrollX;
  const pageY = rect.top + window.scrollY;

  return {
    x: rect.x,
    y: rect.y,
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    pageX,
    pageY,
  };
}

export function measurePoint(
  clientX: number,
  clientY: number,
  target?: HTMLElement | DOMRect,
): AnnotationRect {
  const targetRect = target instanceof DOMRect ? target : target?.getBoundingClientRect();
  const pageX = clientX + window.scrollX;
  const pageY = clientY + window.scrollY;
  const anchorXPercent =
    targetRect && targetRect.width > 0 ? (clientX - targetRect.left) / targetRect.width : undefined;
  const anchorYPercent =
    targetRect && targetRect.height > 0
      ? (clientY - targetRect.top) / targetRect.height
      : undefined;

  return {
    x: clientX,
    y: clientY,
    top: clientY,
    left: clientX,
    right: clientX + 1,
    bottom: clientY + 1,
    width: 1,
    height: 1,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    pageX,
    pageY,
    anchorXPercent,
    anchorYPercent,
  };
}

export function rectToViewport(rect: AnnotationRect): AnnotationRect {
  const left = rect.pageX - window.scrollX;
  const top = rect.pageY - window.scrollY;

  return {
    ...rect,
    x: left,
    y: top,
    left,
    top,
    right: left + rect.width,
    bottom: top + rect.height,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

export function normalizeComment(
  row: Partial<AnnotationComment> & { id: string },
): AnnotationComment {
  return {
    id: row.id,
    page_path: row.page_path ?? window.location.pathname,
    selector: row.selector ?? null,
    rect: row.rect ?? null,
    text: row.text ?? "",
    author: row.author ?? "Unknown",
    resolved: Boolean(row.resolved),
    created_at: row.created_at ?? new Date(0).toISOString(),
    resolved_at: row.resolved_at ?? null,
    parent_id: row.parent_id ?? null,
  };
}

export function sortComments(comments: AnnotationComment[]): AnnotationComment[] {
  return [...comments].sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export function getTopLevelComments(comments: AnnotationComment[]): AnnotationComment[] {
  return comments.filter((comment) => comment.parent_id === null);
}

export function getReplies(comments: AnnotationComment[], parentId: string): AnnotationComment[] {
  return comments.filter((comment) => comment.parent_id === parentId);
}

export function getCommentMap(comments: AnnotationComment[]): Map<string, AnnotationComment> {
  return new Map(comments.map((comment) => [comment.id, comment]));
}

export function getThreadRootId(
  commentId: string,
  commentMap: Map<string, AnnotationComment>,
): string {
  let current = commentMap.get(commentId);

  while (current?.parent_id) {
    current = commentMap.get(current.parent_id);
  }

  return current?.id ?? commentId;
}

export function getThreadCount(comments: AnnotationComment[], rootId: string): number {
  return comments.reduce((count, comment) => {
    if (comment.id === rootId || comment.parent_id === rootId) {
      return count + 1;
    }

    return count;
  }, 0);
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return "?";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function formatTimestamp(value: string): string {
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return value;
  }

  return parsed.fromNow();
}

export function getMarkerPagePosition(
  rect: AnnotationRect | null,
  target?: HTMLElement | null,
): MarkerPosition | null {
  if (!rect) {
    return null;
  }

  if (target && rect.anchorXPercent !== undefined && rect.anchorYPercent !== undefined) {
    const targetRect = target.getBoundingClientRect();

    return {
      x: targetRect.left + window.scrollX + targetRect.width * rect.anchorXPercent,
      y: targetRect.top + window.scrollY + targetRect.height * rect.anchorYPercent,
      width: 1,
      height: 1,
    };
  }

  return {
    x: rect.pageX,
    y: rect.pageY,
    width: 1,
    height: 1,
  };
}

export function getMarkerPosition(
  rect: AnnotationRect | null,
  target?: HTMLElement | null,
): MarkerPosition | null {
  const pagePosition = getMarkerPagePosition(rect, target);
  if (!pagePosition) {
    return null;
  }

  return {
    ...pagePosition,
    x: pagePosition.x - window.scrollX,
    y: pagePosition.y - window.scrollY,
  };
}

export function markerPositionsEqual(
  left: MarkerPosition | undefined,
  right: MarkerPosition | null,
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}
