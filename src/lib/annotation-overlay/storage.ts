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

  const { hash, pathname, search } = window.location;
  const match = hash.match(/[#&]key=([^&]*)/);
  if (!match && linkKey !== undefined) {
    return linkKey;
  }
  // Keys are 64 lowercase hex characters. Anything else (bad escape, non-Latin-1, megabytes) is dropped
  // here instead of failing later as a request header.
  linkKey = match && /^[0-9a-f]{64}$/.test(match[1]) ? match[1] : "";
  if (match) {
    // Remove every key= part, so "#key=A&key=B" leaves nothing behind.
    const rest = hash
      .slice(1)
      .split("&")
      .filter((part) => !part.startsWith("key="))
      .join("&");
    // replaceState throws when the pathname reads as another origin (//host); the key is taken anyway.
    try {
      window.history.replaceState(
        window.history.state,
        "",
        `${pathname}${search}${rest ? `#${rest}` : ""}`,
      );
    } catch {
      // The key stays in the address bar; it is still used only for this site.
    }
  }

  return linkKey;
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
