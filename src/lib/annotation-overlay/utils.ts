import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { AnnotationComment, AnnotationRect, MarkerPosition } from "./types";
import { querySelectorSafely } from "./selector";

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
    project_id: row.project_id ?? null,
    selector: row.selector ?? null,
    rect: row.rect ?? null,
    text: row.text ?? "",
    author: row.author ?? "Unknown",
    author_id: row.author_id ?? null,
    author_is_guest: row.author_is_guest ?? false,
    resolved: Boolean(row.resolved),
    created_at: row.created_at ?? new Date(0).toISOString(),
    resolved_at: row.resolved_at ?? null,
    parent_id: row.parent_id ?? null,
    mentions: row.mentions ?? [],
  };
}

// Same rule as the database (comments_page_path_plain): one leading slash but not two, no # ? or
// backslash, no whitespace or control characters, no . or .. segment (also as %2e). Older rows may
// break it, so check before using a path.
export function isPlainPagePath(path: string): boolean {
  return (
    path.length <= 512 &&
    /^\/(?:[^/#?\\\s\p{Cc}][^#?\\\s\p{Cc}]*)?$/u.test(path) &&
    !/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(path)
  );
}

// The URL of a page path on `origin`, or null when the path is not plain or the browser would not keep
// it exactly as written there (another origin, a normalized path, a query or hash).
export function pageUrlOn(path: string, origin: string): URL | null {
  if (!isPlainPagePath(path)) {
    return null;
  }
  try {
    const url = new URL(path, origin);
    const asWritten = url.pathname === path && !url.search && !url.hash;
    return asWritten && url.origin === new URL(origin).origin ? url : null;
  } catch {
    return null;
  }
}

// A page path the overlay may navigate to: plain and staying on this site exactly as written.
export function isSameSitePath(path: string): boolean {
  return pageUrlOn(path, window.location.origin) !== null;
}

// Same rule as the database: at most 48 characters, at least 2 letters or digits (the database also strips invisible characters).
export function isValidName(name: string): boolean {
  const value = name.trim().normalize("NFC");
  return [...value].length <= 48 && (value.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 2;
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

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength = 160): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function getElementText(target: HTMLElement): string | null {
  const value =
    target.innerText ||
    target.textContent ||
    target.getAttribute("aria-label") ||
    target.getAttribute("title") ||
    target.getAttribute("alt") ||
    "";
  const normalized = normalizeWhitespace(value);

  return normalized ? truncateText(normalized) : null;
}

function getThreadComments(
  root: AnnotationComment,
  comments: AnnotationComment[],
): AnnotationComment[] {
  return [root, ...getReplies(comments, root.id)].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
}

function formatThreadMessages(root: AnnotationComment, comments: AnnotationComment[]): string[] {
  const threadComments = getThreadComments(root, comments);
  const lines = ["**Feedback Thread**:"];

  threadComments.forEach((comment, index) => {
    lines.push(
      `${index + 1}. ${comment.author}: ${normalizeWhitespace(comment.text) || "(empty comment)"}`,
    );
  });

  lines.push("");

  return lines;
}

function formatElementSummary(comment: AnnotationComment, currentPath: string): string[] {
  const target = comment.page_path === currentPath ? querySelectorSafely(comment.selector) : null;
  const selectorLabel = comment.selector ? `\`${comment.selector}\`` : "Unavailable";
  const tagLabel = target ? `\`${target.tagName.toLowerCase()}\`` : "Unavailable";
  const lines = [
    `**Route**: \`${comment.page_path}\``,
    "",
    `**Status**: \`${comment.resolved ? "resolved" : "open"}\``,
    "",
    `**Element**: ${selectorLabel}`,
    "",
    `**Tag**: ${tagLabel}`,
  ];

  const text = target ? getElementText(target) : null;
  if (text) {
    lines.push("", `**Text**: \`${text}\``);
  }

  lines.push("");

  return lines;
}

function formatThreadSection(
  root: AnnotationComment,
  comments: AnnotationComment[],
  currentPath: string,
  heading: string,
): string[] {
  return [
    heading,
    "",
    ...formatElementSummary(root, currentPath),
    ...formatThreadMessages(root, comments),
  ];
}

export function formatAnnotationThreadMarkdown(
  root: AnnotationComment,
  comments: AnnotationComment[],
  currentPath: string,
): string {
  return [
    "# Annotations Page Feedback",
    "",
    ...formatThreadSection(root, comments, currentPath, "## Annotation 1"),
  ]
    .join("\n")
    .trim();
}

export function formatAnnotationCollectionMarkdown(
  roots: AnnotationComment[],
  comments: AnnotationComment[],
  currentPath: string,
): string {
  const sortedRoots = [...roots].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  const lines = ["# Annotations Page Feedback", ""];

  sortedRoots.forEach((root, index) => {
    lines.push(...formatThreadSection(root, comments, currentPath, `## Annotation ${index + 1}`));
  });

  return lines.join("\n").trim();
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

// Splits a comment text into plain parts and "@Name" parts of the mentioned people (longest name first,
// so "@Anna Muster" wins over "@Anna"). Names that are not in the text are simply not found.
export function splitMentions(
  text: string,
  names: string[],
): Array<{ text: string; mention: boolean }> {
  const tokens = [...new Set(names)]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .map((name) => `@${name}`);
  const parts: Array<{ text: string; mention: boolean }> = [];
  let rest = text;
  while (tokens.length > 0 && rest) {
    let best = -1;
    let token = "";
    for (const candidate of tokens) {
      const index = rest.indexOf(candidate);
      if (index !== -1 && (best === -1 || index < best)) {
        best = index;
        token = candidate;
      }
    }
    if (best === -1) {
      break;
    }
    if (best > 0) {
      parts.push({ text: rest.slice(0, best), mention: false });
    }
    parts.push({ text: token, mention: true });
    rest = rest.slice(best + token.length);
  }
  if (rest) {
    parts.push({ text: rest, mention: false });
  }
  return parts;
}

// Page of a "For you" entry in another project; http for local hosts. Null without a domain.
export function getForYouHref(
  domain: string | null,
  pagePath: string,
  threadId: string,
): string | null {
  if (!domain) {
    return null;
  }
  const host = domain.replace(/:\d+$/, "");
  const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
  return `${isLocal ? "http" : "https"}://${domain}${pagePath}#annotation-thread=${threadId}`;
}
