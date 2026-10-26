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
          projectId="marketing-site"
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

Access works with a personal key per person, without Supabase Auth:

- **Staff** (DAYONE e-mail, first name, optional last name): the key works in every project.
- **External people** (display name, one project): the key works only in that project.

The key is stored hashed. It reaches the browser once via the link fragment `#key=…`; the overlay
saves it in `localStorage`, removes it from the address bar and sends it with every request
(`x-annotation-key` header). Row level security checks person and project. Without a valid key
nothing can be read or written. Display names are resolved when reading, so a rename also changes
old comments.

```bash
export SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=…
node scripts/annotation-admin.mjs mitarbeiter --email anna@dayone.de --vorname Anna --url https://example.com
node scripts/annotation-admin.mjs extern --projekt marketing-site --name "Jane Doe" --url https://example.com
node scripts/annotation-admin.mjs neuer-schluessel --person <id> --url https://example.com
node scripts/annotation-admin.mjs entziehen --person <id>
```

Each command prints the link once. A new key invalidates the old one; `entziehen` deletes it.

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
- Personal access keys, project isolation and server-side authors via row level security
- Rename in the settings, applied to all of a person's comments
- Optional `pagePath`, `position`, `storageKeyPrefix`, and `tableName` props for advanced integration
