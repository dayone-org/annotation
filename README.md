# Annotation Overlay

Drop-in React annotation overlay backed by Supabase.

## Installation

```bash
npm install github:dayone-org/annotation#main
```

## Usage

```tsx
import "annotation/styles.css";
import { Annotation } from "annotation";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Annotation
          supabaseUrl={process.env.NEXT_PUBLIC_ANNOTATION_SUPABASE_URL!}
          supabaseAnonKey={process.env.NEXT_PUBLIC_ANNOTATION_SUPABASE_ANON_KEY!}
          position="bottom-right"
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
  screenshot jsonb,
  author text not null,
  resolved boolean default false,
  created_at timestamptz default now(),
  resolved_at timestamptz,
  parent_id uuid references comments(id)
);
```

### Table Modes

For one project per comments table, use the base schema above and omit `projectId`.

If you want one comments table to back multiple projects, add a `project_id` column and pass
`projectId` to `<Annotation />`.

```sql
alter table comments
  add column project_id text not null default 'default-project';
```

To add the screenshot column to an existing table:

```sql
alter table comments
  add column screenshot jsonb;
```

If you already added `screenshot` as `not null`, relax it so comments can still save when
browser-side capture fails. If you previously used the plural `screenshots` draft schema, also
remove the old array default and clean up existing `[]` values:

```sql
alter table comments
  alter column screenshot drop not null,
  alter column screenshot drop default;

update comments
set screenshot = null
where screenshot = '[]'::jsonb;
```

```tsx
<Annotation
  supabaseUrl={process.env.NEXT_PUBLIC_ANNOTATION_SUPABASE_URL!}
  supabaseAnonKey={process.env.NEXT_PUBLIC_ANNOTATION_SUPABASE_ANON_KEY!}
  projectId="marketing-site"
/>
```

When a table has a `project_id` column, `<Annotation />` requires `projectId`. This prevents
loading comments from every project in a shared table by accident.

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
- Automatic viewport screenshot attached to each comment
- Cross-page thread browsing from the dock
- Dock positioning in all four corners
- Optional shared-table scoping with `projectId`
- Local annotator name and resolved-thread visibility preferences
- Optional `pagePath`, `position`, `projectId`, `storageKeyPrefix`, and `tableName` props for advanced integration
