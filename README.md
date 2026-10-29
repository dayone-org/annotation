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

## From a new site to the first comment

1. **Once per admin:** add yourself as staff and flag yourself as admin with the admin script
   (`staff`, then `admin --person <id>`). Keep your link like a password. `staff-list` shows who
   is staff and admin; `admin --person <id> --off` takes the admin flag away again.
2. **Developer:** install the package and mount `<Annotation />` with the URL and key of the central
   database (see Usage). No `projectId` needed.
3. **Admin:** open the new site with your key appended (`https://new-site.com/#key=…`). The site has
   no project yet, so only the admin tile shows. Create the project there: type the ID once
   (it can't be changed later, so Create asks to confirm it); the domain is prefilled.
4. **Admin:** in the admin tile, create the guest link and add staff who are not on the list yet.
5. **Send the links** by mail or Slack. Staff open their personal link, guests open the project
   link and enter their name. Without a link the overlay stays hidden.

A new guest link locks out the old one and every guest who joined through it, so the tile asks
before creating it. A lost staff link is replaced with `new-key`.

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
stored hashed (the current guest link also in plain text, readable only by admins); row level security checks person and project. Without a valid key the overlay is
not rendered at all. Display names are resolved when reading, so a rename also changes old
comments. Threads with any reply can be resolved but not removed; only the author can
move a thread.

```bash
export SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=…
node scripts/annotation-admin.mjs project --id marketing-site --name "Marketing site" --domain example.com
node scripts/annotation-admin.mjs project-link --id marketing-site --url https://example.com
node scripts/annotation-admin.mjs staff --email anna@dayone.de --first-name Anna --url https://example.com
node scripts/annotation-admin.mjs new-key --person <id> --url https://example.com
node scripts/annotation-admin.mjs revoke --person <id>
node scripts/annotation-admin.mjs admin --person <id> [--off]
node scripts/annotation-admin.mjs staff-list
node scripts/annotation-admin.mjs orphan-images [--delete]
```

Each link is printed once; admins can show the current guest link again in the admin tile.

**Admins** are staff members flagged with `admin --person <id>` (service role only). Their overlay
shows an admin tile in the dock that can create or change the project of the page (it loads the
stored name and domains), show or renew its guest link and add staff members (their link is shown
once). "Import CSV" adds up to 200 staff members from a file with a header row `email`,
`first_name`, `last_name` (any case; comma or semicolon; UTF-8 with or without BOM). A preview
shows each row as OK or with the reason it is skipped (no @dayone.de address, invalid name, already
registered, duplicate in the file); "Import N" creates only the valid ones and offers a file
`name,email,link` once for download. It holds access links: delete it after sending. The links are
not kept in the tile and are gone when it closes. The ID is fixed on a page that has a project; the tile cannot take over another project by
its ID ("ID already in use by another project"), only the admin script can. The domain of the
page stays in its project's list, so the tile keeps finding the project. `admin --person <id> --off`
removes only the flag; the person keeps their key. `staff-list` prints every staff member with
e-mail, name, ID, admin yes/no and key yes/no, never a key or hash. `revoke` also removes
the admin flag, so a later `new-key` gives a plain staff key. Guest links created before the plain text was stored cannot be shown, only renewed. The database checks the key on
every call; the flag cannot be read or set through the overlay. On a page without a project the
overlay shows admins only this tile, so they can register the page.

**Images on comments** are files in the public storage bucket `comment-images`, at
`<project>/<person>/<random UUID>.webp|jpg`; anyone with the address can open them, without a key.
Uploading and deleting need a valid key: own folder in a project of the key, WebP or JPEG, at most
5 MiB. A comment takes up to 5 of its author's own uploads in the same project
(`annotation_add_comment_with_images`); the table `annotation_images` holds the references and is
readable like the comment. Deleting a comment deletes its references; the uploader may then delete the
files. A stored file never changes (also not through a signed upload URL), and its type must match its
extension; a comment takes only uploads younger than an hour. `orphan-images` lists files no comment uses
that are older than 24 hours; `--delete` removes them.

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
- Mentions: staff type `@` in a comment or reply and pick a colleague; the name is highlighted.
  Only staff can mention and be mentioned; for guests `@` is plain text
- Comment list tabs: "All" (open threads on all pages), "For you" and "Resolved" (resolved threads on
  all pages, also shown as markers). The chosen tab is kept
- "For you" tab: mentions of you and replies in threads you started, from all
  projects your key can access (guests: their project only). The unread count also shows on the list
  button. Each entry shows the start of the comment (first 140 characters). Opening a thread marks
  its entries read; "Mark all as read" clears the rest; entries that arrive meanwhile stay unread;
  resolved threads drop out. An entry from another project links to its first domain and opens the
  thread there. A click there signs you in on that domain with a one-time code
  (`#annotation-handoff=<code>&annotation-thread=<id>`; staff only, valid 2 minutes, usable once, only
  on that project's domain, never through the `projectId` prop; the database stores only its hash and the
  key encrypted with it). The code is used up on landing in any case; a key that is current for anyone
  stays (also a guest key of another project, or with a `projectId` prop) and only the thread opens, so a link from someone else cannot replace it. Opened in a new
  tab, the link carries no code and needs the key stored on that domain
- Known limit: a browser without a working key takes the key of whoever made the link, like with
  `#key=…`. `#key=…` itself still replaces a stored key on purpose, to switch people
- Optional `projectId`, `pagePath`, `position`, and `storageKeyPrefix` props for advanced integration

**Breaking change:** the `tableName` prop is gone. The overlay always uses the `comments` table of
the central schema.
