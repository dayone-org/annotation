# Annotation Overlay

Drop-in React annotation overlay backed by Supabase.

## Installation

```bash
npm install @dayone/annotation
```

## Usage

```tsx
import { Annotation } from "@dayone/annotation";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Annotation
          supabaseUrl={process.env.NEXT_PUBLIC_ANNOTATION_SUPABASE_URL!}
          supabaseAnonKey={process.env.NEXT_PUBLIC_ANNOTATION_SUPABASE_ANON_KEY!}
        />
      </body>
    </html>
  );
}
```

## Database

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

## Environment Variables

```bash
NEXT_PUBLIC_ANNOTATION_SUPABASE_URL=
NEXT_PUBLIC_ANNOTATION_SUPABASE_ANON_KEY=
```

## Features

- Realtime comment loading and sync via Supabase
- Keyboard shortcuts for create, close, and resolve flows
- Element selection anchored to live DOM targets
- Marker repositioning on scroll and resize
- Threaded comments with resolve, remove, and bulk copy actions
- Cross-page thread browsing from the dock
- Local annotator name and resolved-thread visibility preferences
- Optional `tableName`, `storageKeyPrefix`, and `pagePath` props for advanced integration
