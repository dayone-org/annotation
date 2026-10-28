export const DEFAULT_STORAGE_KEY_PREFIX = "annotation";

export function getStorageKey(prefix: string, key: string): string {
  return `${prefix}_${key}`;
}

export function readStoredString(key: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(key)?.trim() ?? "";
}

export function writeStoredString(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  if (value) {
    window.localStorage.setItem(key, value);
    return;
  }

  window.localStorage.removeItem(key);
}

// Take the key from the link (#key=…) and remove it from the address bar. Kept per page load, so a
// second caller gets the same key; a later link in the same tab (hash change) replaces it.
let linkKey: string | undefined;

export function takeLinkKey(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const match = window.location.hash.match(/[#&]key=([^&]*)/);
  if (!match && linkKey !== undefined) {
    return linkKey;
  }
  // Keys are 64 lowercase hex characters. Anything else (bad escape, non-Latin-1, megabytes) is dropped
  // here instead of failing later as a request header.
  linkKey = match && /^[0-9a-f]{64}$/.test(match[1]) ? match[1] : "";
  if (match) {
    dropHashParts("key=");
  }

  return linkKey;
}

// Removes every part of the hash that starts with prefix, so "#key=A&key=B" leaves nothing behind.
function dropHashParts(prefix: string): void {
  const { hash, pathname, search } = window.location;
  const rest = hash
    .slice(1)
    .split("&")
    .filter((part) => !part.startsWith(prefix))
    .join("&");
  // replaceState throws when the pathname reads as another origin (//host); the part stays in the
  // address bar, the overlay has read it anyway.
  try {
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${search}${rest ? `#${rest}` : ""}`,
    );
  } catch {
    // Nothing else to do.
  }
}

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window.localStorage.getItem(key);
  if (value === null) {
    return fallback;
  }

  return value === "true";
}

export function writeStoredBoolean(key: string, value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, value ? "true" : "false");
}

// The key was taken over or used to join: a later hash change without a key brings nothing back.
export function forgetLinkKey(): void {
  linkKey = "";
}

// Jump from "For you" in another project: #annotation-thread=<id> opens that thread once.
export function readLinkThread(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const match = window.location.hash.match(/[#&]annotation-thread=([0-9a-f-]{36})(?=&|$)/i);
  return match ? match[1].toLowerCase() : "";
}

export function dropLinkThread(): void {
  if (/[#&]annotation-thread=/.test(window.location.hash)) {
    dropHashParts("annotation-thread=");
  }
}
