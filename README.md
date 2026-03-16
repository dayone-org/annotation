# Annotation Overlay

Lightweight React overlay for attaching annotations to live DOM elements.

The overlay UI is built with Tailwind CSS and shadcn-style primitives.

## Usage

```tsx
import { AnnotationOverlay } from './src'

function App() {
  return (
    <>
      <YourApp />
      <AnnotationOverlay
        supabaseUrl={process.env.ANNOTATION_SUPABASE_URL!}
        supabaseAnonKey={process.env.ANNOTATION_SUPABASE_ANON_KEY!}
      />
    </>
  )
}
```

## Required env

```bash
ANNOTATION_SUPABASE_URL=
ANNOTATION_SUPABASE_ANON_KEY=
```

For the local Vite demo page, mirror them as:

```bash
VITE_ANNOTATION_SUPABASE_URL=
VITE_ANNOTATION_SUPABASE_ANON_KEY=
```

## Supabase schema

```sql
create table comments (
  id uuid primary key default gen_random_uuid(),
  page_path text not null,
  selector text,
  rect jsonb,
  text text not null,
  author text not null,
  resolved boolean default false,
  created_at timestamptz default now(),
  resolved_at timestamptz,
  parent_id uuid references comments(id)
);
```

## Included behavior

- Current-page comment loading and realtime sync via Supabase
- `C`, `Esc`, and `R` keyboard shortcuts
- Selector generation with stored rect fallback
- Marker repositioning on scroll, resize, and DOM mutations
- Local annotator name and resolved-thread visibility preferences

## Demo app

There is a standalone Vite demo in [demo/package.json](/Users/Bean.Duong/Desktop/dev/annotation/demo/package.json) with multiple routes for testing the overlay against cards, tables, sticky panels, and forms.

```bash
cd demo
npm install
npm run dev
```
