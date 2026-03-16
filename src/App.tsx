import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AnnotationOverlay } from './index'

const annotationSupabaseUrl = import.meta.env.VITE_ANNOTATION_SUPABASE_URL ?? ''
const annotationSupabaseAnonKey = import.meta.env.VITE_ANNOTATION_SUPABASE_ANON_KEY ?? ''

const featureCards = [
  {
    title: 'Live DOM targeting',
    detail: 'Click any element on the page, capture a resilient selector, and keep the annotation pinned while the UI shifts.',
  },
  {
    title: 'Threaded annotations',
    detail: 'Top-level comments own the marker; replies stay attached to the same thread so context does not scatter.',
  },
  {
    title: 'Realtime sync',
    detail: 'Supabase broadcasts inserts and resolution changes so page annotations stay shared instead of drifting into screenshots or chat.',
  },
]

const releaseNotes = [
  'Anchored marker fallback uses stored rects when selectors break.',
  'Resolved threads can stay visible at lower opacity during active QA.',
  'Keyboard flow supports C for capture mode, Esc to exit, and R to resolve.',
]

const surfaceClass =
  'relative grid gap-[18px] overflow-hidden rounded-[28px] border border-border/70 bg-card/95 p-[26px] shadow-lg backdrop-blur'

const eyebrowClass = 'justify-self-start rounded-full px-3 font-semibold uppercase tracking-[0.18em]'

function App() {
  const [isAnnotationEnabled, setAnnotationEnabled] = useState(() => Boolean(annotationSupabaseUrl && annotationSupabaseAnonKey))

  return (
    <div className="mx-auto w-[min(1180px,calc(100vw-40px))] px-0 pt-7 pb-[72px] text-foreground max-[960px]:w-[min(calc(100vw-24px),1180px)] max-[960px]:pt-3">
      <header
        className={cn(
          surfaceClass,
          'mb-6 p-[34px] md:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)] max-[960px]:grid-cols-1 max-[960px]:p-[22px]',
        )}
      >
        <div className="grid gap-[18px]">
          <Badge className={eyebrowClass} variant="outline">
            Annotation package
          </Badge>
          <h1 className="m-0 max-w-[13ch] text-[clamp(2.6rem,6vw,5rem)] leading-[0.94] font-semibold tracking-[-0.06em]">
            Annotate live UI directly on the page you are debugging.
          </h1>
          <p className="max-w-[62ch] text-[1.05rem] text-muted-foreground">
            This package mounts an overlay, lets an annotator click real DOM targets, and stores page-scoped threads in
            Supabase without turning the app itself into a product feature.
          </p>
        </div>

        <div className="grid content-between gap-[18px] rounded-[22px] border border-border/70 bg-muted/50 p-[22px]">
          <div className="flex items-center gap-[10px]">
            <span
              className={cn(
                'size-3 rounded-full ring-4 ring-background/80',
                isAnnotationEnabled ? 'bg-primary' : 'bg-muted-foreground',
              )}
            ></span>
            <strong>{isAnnotationEnabled ? 'Overlay enabled' : 'Overlay disabled'}</strong>
          </div>
          <p className="m-0 text-muted-foreground">
            Pass `supabaseUrl` and `supabaseAnonKey` into <code>{'<AnnotationOverlay />'}</code>. In this Vite demo, set
            <code> VITE_ANNOTATION_SUPABASE_URL</code> and <code>VITE_ANNOTATION_SUPABASE_ANON_KEY</code>.
          </p>
          <Button
            className="justify-self-start rounded-full"
            disabled={!annotationSupabaseUrl || !annotationSupabaseAnonKey}
            onClick={() => setAnnotationEnabled((current) => !current)}
            size="lg"
            type="button"
          >
            {isAnnotationEnabled ? 'Unmount annotation overlay' : 'Mount annotation overlay'}
          </Button>
        </div>
      </header>

      <main className="grid gap-6 md:grid-cols-12">
        <section className={cn(surfaceClass, 'md:col-span-8')}>
          <div className="grid gap-2">
            <Badge className={eyebrowClass} variant="outline">
              Implementation shape
            </Badge>
            <h2 className="m-0 text-2xl font-semibold">What this first pass already covers</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(210px,1fr))]">
            {featureCards.map((card) => (
              <article className="rounded-[20px] border border-border/70 bg-background/80 p-[18px]" key={card.title}>
                <h3 className="m-0 text-lg font-semibold">{card.title}</h3>
                <p className="m-0 text-muted-foreground">{card.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={cn(surfaceClass, 'md:col-span-4')}>
          <div className="grid gap-2">
            <Badge className={eyebrowClass} variant="outline">
              Checklist
            </Badge>
            <h2 className="m-0 text-2xl font-semibold">Database contract</h2>
          </div>
          <div className="rounded-[20px] border border-border/70 bg-muted/30 p-[18px]">
            <pre className="m-0 whitespace-pre-wrap font-mono text-[0.92rem] leading-[1.6] text-foreground">{`comments(
  id uuid primary key,
  page_path text not null,
  selector text,
  rect jsonb,
  text text not null,
  author text not null,
  resolved boolean default false,
  created_at timestamptz default now(),
  resolved_at timestamptz,
  parent_id uuid references comments(id)
)`}</pre>
          </div>
        </section>

        <section className={cn(surfaceClass, 'md:col-span-8')}>
          <div className="grid gap-2">
            <Badge className={eyebrowClass} variant="outline">
              Release notes
            </Badge>
            <h2 className="m-0 text-2xl font-semibold">Annotation interaction decisions</h2>
          </div>
          <ul className="m-0 grid gap-[14px] pl-5 text-muted-foreground marker:text-primary">
            {releaseNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>

        <section className={cn(surfaceClass, 'md:col-span-4')}>
          <div className="grid gap-2">
            <Badge className={eyebrowClass} variant="outline">
              Try the surface
            </Badge>
            <h2 className="m-0 text-2xl font-semibold">Use this page as your local annotation sandbox.</h2>
          </div>
          <p className="m-0 text-muted-foreground">
            Annotate headers, cards, list items, or this CTA block itself. The overlay is independent from the demo
            content so the package stays easy to lift into another React app.
          </p>
        </section>
      </main>

      {isAnnotationEnabled ? (
        <AnnotationOverlay supabaseAnonKey={annotationSupabaseAnonKey} supabaseUrl={annotationSupabaseUrl} />
      ) : null}
    </div>
  )
}

export default App
