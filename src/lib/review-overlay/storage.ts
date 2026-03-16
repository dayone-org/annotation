export const ANNOTATION_AUTHOR_KEY = 'annotation_author'
export const ANNOTATION_SHOW_RESOLVED_KEY = 'annotation_show_resolved'

export function readStoredString(key: string): string {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.localStorage.getItem(key)?.trim() ?? ''
}

export function writeStoredString(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return
  }

  if (value) {
    window.localStorage.setItem(key, value)
    return
  }

  window.localStorage.removeItem(key)
}

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') {
    return fallback
  }

  const value = window.localStorage.getItem(key)
  if (value === null) {
    return fallback
  }

  return value === 'true'
}

export function writeStoredBoolean(key: string, value: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(key, value ? 'true' : 'false')
}
