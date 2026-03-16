# Review Overlay — Implementation Plan

## Overview

A lightweight annotation layer that mounts on top of any React application, allowing team members to comment on live UI elements directly. Comments are scoped per page, support threading, and persist in Supabase.

This is a debugging overlay, not a product feature. It should remain small, self-contained, and easy to remove.

---

## 1. Mounting

The system is on when the component is mounted. No internal feature flag. The consuming app controls when and whether it renders:

```tsx
{isReviewEnabled && (
  <ReviewOverlay
    supabaseUrl="..."
    supabaseAnonKey="..."
  />
)}
```

Works in any React 19 application. Framework-specific routing or build tooling is the consuming app's concern.

---

## 2. Environment Variables

```
ANNOTATION_SUPABASE_URL=
ANNOTATION_SUPABASE_ANON_KEY=
```

No other env configuration. Everything else is either a prop or a user preference stored in `localStorage`.

---

## 3. Data Model

```sql
create table comments (
  id           uuid primary key default gen_random_uuid(),
  page_path    text not null,
  selector     text,
  rect         jsonb,
  text         text not null,
  author       text not null,
  resolved     boolean default false,
  created_at   timestamptz default now(),
  resolved_at  timestamptz,
  parent_id    uuid references comments(id)
);
```

Key decisions:

- `page_path` scopes comments per route
- `selector` + `rect` together handle element targeting with positional fallback
- `parent_id` null = top-level comment with its own marker; non-null = reply anchored to parent's marker
- No `app_id` — each project has its own Supabase database

---

## 4. localStorage Keys

```
review_author           string — set on first open, persists across sessions
review_show_resolved    boolean — default false, user-controlled at runtime
```

---

## 5. React Architecture

```
ReviewOverlay
 └── ReviewProvider
      ├── AuthorGate
      ├── InteractionLayer
      ├── HighlightBox
      ├── CommentMarkers
      │    └── MarkerThread
      └── ReviewPanel
           ├── CommentForm
           ├── CommentList
           └── CommentThread
```

All state lives in `ReviewProvider`. Components are client-side only.

### shadcn/ui Components

The overlay uses shadcn/ui primitives. The consuming project must have shadcn installed and compatible with React 19.

| shadcn Component | Used For |
|---|---|
| `Sheet` | ReviewPanel (fixed side panel) |
| `Button` | Actions — new comment, resolve, toggle resolved |
| `Input` | Author name gate |
| `Textarea` | Comment text input |
| `Badge` | Open / resolved state labels |
| `Separator` | Panel section dividers |
| `ScrollArea` | Comment list |
| `Avatar` | Author initials on markers and comments |
| `Tooltip` | Marker hover labels |

---

## 6. Selector Algorithm

No special data attributes assumed. Generates a structural CSS path from the DOM, stopping as soon as the path uniquely resolves to one element.

```ts
function generateSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`

  const parts: string[] = []

  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.tagName.toLowerCase()

    if (el.classList.length) {
      const cls = [...el.classList]
        .filter(c =>
          !c.startsWith("css-") &&
          !c.startsWith("emotion") &&
          !/[0-9]{3,}/.test(c)
        )
        .slice(0, 2)
      if (cls.length) selector += "." + cls.join(".")
    }

    const index = [...el.parentNode!.children].indexOf(el) + 1
    selector += `:nth-child(${index})`
    parts.unshift(selector)

    const full = parts.join(" > ")
    if (document.querySelectorAll(full).length === 1) return full

    el = el.parentElement!
  }

  return parts.join(" > ")
}
```

Filtered class prefixes: `css-`, `emotion-`, and any class containing 3+ consecutive digits (hash-like).

Selector is computed once at comment creation time, not continuously.

---

## 7. Position Fallback

Selectors will break after UI changes. The stored `rect` acts as a fallback:

```ts
const el = document.querySelector(comment.selector)
const rect = el
  ? el.getBoundingClientRect()
  : comment.rect // fall back to stored position
```

This keeps markers visible and usable during active iteration.

---

## 8. Marker Positioning

Markers reposition dynamically on scroll, resize, and DOM mutations:

```ts
window.addEventListener("scroll", updateMarkers)
window.addEventListener("resize", updateMarkers)

new MutationObserver(debounce(updateMarkers, 32)).observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
})
```

Only markers whose target element changed are repositioned, not all markers on every mutation.

---

## 9. Comment Creation Flow

```
Press C
→ Enter comment mode
→ Hover element → HighlightBox outlines it
→ Click element
→ selector + rect captured
→ CommentForm appears
→ User submits text
→ Insert to Supabase
→ Marker appears on element
```

Replies skip element selection entirely — they attach to the parent comment's marker. Only top-level comments create new markers.

---

## 10. Author Gate

On first panel open, if `review_author` is absent from `localStorage`:

```
"What's your name?"
[ text input        ]
[ Continue          ]
```

Name stored in `localStorage`. Used as `author` on every insert. No re-prompt after that.

---

## 11. Review Panel

Fixed right-side `Sheet`. Filtered to current `page_path` only.

```
Review Panel
──────────────────────
[ + New Comment  (C) ]
──────────────────────
Open
  ● comment
    └ reply
  ● comment
──────────────────────
Resolved  [show/hide]
  ● comment
```

Features:

- Click comment → scroll element into view + briefly highlight it. If selector is broken, scroll to approximate `rect.y` with a visual indicator.
- Resolve / unresolve action per top-level comment
- Show/hide resolved toggle — persisted in `localStorage` as `review_show_resolved`
- Resolving a thread marks the top-level comment only; replies inherit the state

---

## 12. Resolved State

```ts
await supabase
  .from("comments")
  .update({ resolved: true, resolved_at: new Date().toISOString() })
  .eq("id", id)
```

Resolved markers render at `opacity: 0.35`. Hidden by default, shown when `review_show_resolved` is `true`.

---

## 13. Element Highlight Layer

Renders on hover during comment mode. Non-interactive, positioned over the target element:

```css
pointer-events: none;
position: fixed;
outline: 2px solid #4da3ff;
background: rgba(77, 163, 255, 0.08);
border-radius: 3px;
transition: all 80ms ease;
```

Also used briefly when scrolling to a comment from the panel.

---

## 14. Keyboard Shortcuts

```
C      Enter comment mode
Esc    Cancel / exit comment mode
R      Resolve focused comment
```

```ts
window.addEventListener("keydown", handler)
```

---

## 15. Supabase Integration

**Load comments for current page:**

```ts
supabase
  .from("comments")
  .select("*")
  .eq("page_path", location.pathname)
  .order("created_at", { ascending: true })
```

**Insert comment:**

```ts
await supabase.from("comments").insert({
  page_path: location.pathname,
  selector,
  rect,
  text,
  author,
  resolved: false,
  parent_id: parentId ?? null,
})
```

**Realtime subscription:**

```ts
supabase
  .channel("comments")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "comments",
    filter: `page_path=eq.${location.pathname}`,
  }, handleChange)
  .subscribe()
```

---

## 16. Route Change Handling

Framework-agnostic. Reload comments when the pathname changes:

```ts
window.addEventListener("popstate", () => loadComments(location.pathname))
```

For frameworks with client-side routers that don't fire `popstate` (e.g. Next.js App Router), the consuming app should handle triggering a reload — or the overlay can poll `location.pathname` on a short interval as a fallback.

---

## 17. Estimated Size

| Module | ~Lines |
|---|---|
| ReviewProvider + state | 90 |
| Selector algorithm | 70 |
| InteractionLayer | 50 |
| HighlightBox | 30 |
| CommentMarkers | 60 |
| ReviewPanel | 130 |
| Supabase integration | 60 |
| **Total** | **~490** |

---

## 18. Requirements

- React 19+
- shadcn/ui (installed in consuming project, React 19 compatible)
- Supabase project with the comments table above
- Tailwind CSS (shadcn dependency)
