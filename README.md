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

One central Supabase database serves all projects. Apply `supabase/migrations/` once
(`supabase db push`); `supabase/tests/` holds the pgTAP tests (`supabase test db`).

- **Projects** have a name and one or more domains (host incl. port). The overlay finds its project
  by `location.host`; the optional `projectId` prop overrides that.
- **Staff** (DAYONE e-mail, first name, optional last name) get a personal link that works in every
  project. Their name comes from the list and cannot be changed in the overlay.
- **Guests** use one link per project. On first visit they only enter a name; the browser then gets
  its own key and is recognised without the link. Guests are marked as external and may rename
  themselves. A new project link disables the old link and every guest who joined through it.

Links carry the key in the fragment (`#key=…`). The overlay removes it from the address bar, keeps
its key in `localStorage` and sends it with every request (`x-annotation-key` header). Keys are
stored hashed; row level security checks person and project. Without a valid key the overlay is
not rendered at all. Display names are resolved when reading, so a rename also changes old
comments. Threads with replies from others can be resolved but not removed; only the author can
move a thread.

```bash
export SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=…
node scripts/annotation-admin.mjs projekt --id marketing-site --name "Marketing site" --domain example.com
node scripts/annotation-admin.mjs projekt-link --id marketing-site --url https://example.com
node scripts/annotation-admin.mjs mitarbeiter --email anna@dayone.de --vorname Anna --url https://example.com
node scripts/annotation-admin.mjs neuer-schluessel --person <id> --url https://example.com
node scripts/annotation-admin.mjs entziehen --person <id>
```

Each link is printed once.

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
- Dock positioning in all four corners
- Personal and per-project access keys, project isolation and server-side authors via row level security
- Guests rename themselves in the settings; the new name applies to all of their comments
- Optional `pagePath`, `position`, `storageKeyPrefix`, and `tableName` props for advanced integration
