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

// Schlüssel aus dem Link (#key=…) übernehmen, speichern und aus der Adresszeile entfernen.
export function readAccessKey(storageKey: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  const { hash, pathname, search } = window.location;
  const match = hash.match(/[#&]key=([^&]*)/);
  if (match) {
    const fromLink = decodeURIComponent(match[1]).trim();
    if (fromLink) {
      writeStoredString(storageKey, fromLink);
    }
    const rest = hash.replace(match[0], "").replace(/^#?&?/, "");
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${search}${rest ? `#${rest}` : ""}`,
    );
  }

  return readStoredString(storageKey);
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
