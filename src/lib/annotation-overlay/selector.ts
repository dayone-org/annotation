const HASH_LIKE_CLASS = /[0-9]{3,}/;

function isStableClassName(token: string): boolean {
  return !token.startsWith("css-") && !token.startsWith("emotion-") && !HASH_LIKE_CLASS.test(token);
}

function escapeToken(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value;
}

export function generateSelector(element: HTMLElement): string {
  if (element.id) {
    return `#${escapeToken(element.id)}`;
  }

  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();

    if (current.classList.length) {
      const stableClasses = Array.from(current.classList).filter(isStableClassName).slice(0, 2);

      if (stableClasses.length > 0) {
        selector += stableClasses.map((className) => `.${escapeToken(className)}`).join("");
      }
    }

    const parentElement: HTMLElement | null = current.parentElement;
    if (parentElement) {
      const index = Array.from(parentElement.children).indexOf(current) + 1;
      selector += `:nth-child(${index})`;
    }

    parts.unshift(selector);
    const fullSelector = parts.join(" > ");

    try {
      if (document.querySelectorAll(fullSelector).length === 1) {
        return fullSelector;
      }
    } catch {
      return parts.join(" > ");
    }

    current = parentElement;
  }

  return parts.join(" > ");
}

export function querySelectorSafely(selector: string | null): HTMLElement | null {
  if (!selector) {
    return null;
  }

  try {
    const result = document.querySelector(selector);
    return result instanceof HTMLElement ? result : null;
  } catch {
    return null;
  }
}

export function getSelectableElementAtPoint(clientX: number, clientY: number): HTMLElement | null {
  const elements = document.elementsFromPoint(clientX, clientY);

  for (const element of elements) {
    if (!(element instanceof HTMLElement)) {
      continue;
    }

    if (element.closest('[data-annotation-overlay-root="true"]')) {
      continue;
    }

    if (element === document.body || element === document.documentElement) {
      continue;
    }

    return element;
  }

  return null;
}
