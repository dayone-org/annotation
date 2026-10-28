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
  try {
    linkKey = match ? decodeURIComponent(match[1]).trim() : "";
  } catch {
    // Malformed escape such as "%E0": ignore the key instead of crashing the host page.
    linkKey = "";
  }
  if (match) {
    const rest = hash.replace(match[0], "").replace(/^#?&?/, "");
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${search}${rest ? `#${rest}` : ""}`,
    );
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
