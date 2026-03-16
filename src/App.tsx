import { useState } from 'react'
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

function App() {
  const [isAnnotationEnabled, setAnnotationEnabled] = useState(() => Boolean(annotationSupabaseUrl && annotationSupabaseAnonKey))

  return (
    <div className="mx-auto w-[min(1180px,calc(100vw-40px))] px-0 pt-7 pb-[72px] max-[960px]:w-[min(calc(100vw-24px),1180px)] max-[960px]:pt-3">
      <header className="relative mb-6 grid gap-6 overflow-hidden rounded-[28px] border border-slate-400/25 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.88))] p-[34px] shadow-[0_24px_60px_rgba(15,23,42,0.08)] md:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)] max-[960px]:grid-cols-1 max-[960px]:p-[22px]">
        <div className="grid gap-[18px]">
          <p className="m-0 text-[0.78rem] font-bold tracking-[0.18em] text-teal-700 uppercase">Annotation package</p>
          <h1 className="m-0 max-w-[13ch] text-[clamp(2.6rem,6vw,5rem)] leading-[0.94] font-semibold tracking-[-0.06em]">
            Annotate live UI directly on the page you are debugging.
          </h1>
          <p className="max-w-[62ch] text-[1.05rem] text-slate-700">
            This package mounts an overlay, lets an annotator click real DOM targets, and stores page-scoped threads in
            Supabase without turning the app itself into a product feature.
          </p>
        </div>

        <div className="grid content-between gap-[18px] rounded-[22px] bg-slate-900/95 p-[22px] text-slate-200">
          <div className="flex items-center gap-[10px]">
            <span
              className={[
                'h-3 w-3 rounded-full shadow-[0_0_0_6px_rgba(249,115,22,0.16)]',
                isAnnotationEnabled ? 'bg-green-500 shadow-[0_0_0_6px_rgba(34,197,94,0.16)]' : 'bg-orange-500',
              ].join(' ')}
            ></span>
            <strong>{isAnnotationEnabled ? 'Overlay enabled' : 'Overlay disabled'}</strong>
          </div>
          <p className="m-0 text-slate-200/85">
            Pass `supabaseUrl` and `supabaseAnonKey` into <code>{'<AnnotationOverlay />'}</code>. In this Vite demo, set
            <code> VITE_ANNOTATION_SUPABASE_URL</code> and <code>VITE_ANNOTATION_SUPABASE_ANON_KEY</code>.
          </p>
          <button
            className="justify-self-start rounded-full bg-slate-50 px-[18px] py-3 text-[0.92rem] leading-none font-bold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!annotationSupabaseUrl || !annotationSupabaseAnonKey}
            onClick={() => setAnnotationEnabled((current) => !current)}
            type="button"
          >
            {isAnnotationEnabled ? 'Unmount annotation overlay' : 'Mount annotation overlay'}
          </button>
        </div>
      </header>

      <main className="grid gap-6 md:grid-cols-12">
        <section className="relative grid gap-[18px] overflow-hidden rounded-[28px] border border-slate-400/25 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.88))] p-[26px] shadow-[0_24px_60px_rgba(15,23,42,0.08)] md:col-span-8">
          <div className="grid gap-2">
            <p className="m-0 text-[0.78rem] font-bold tracking-[0.18em] text-teal-700 uppercase">Implementation shape</p>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">What this first pass already covers</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(210px,1fr))]">
            {featureCards.map((card) => (
              <article
                className="rounded-[20px] border border-slate-400/20 bg-white/80 p-[18px]"
                key={card.title}
              >
                <h3 className="m-0 text-lg font-semibold text-slate-950">{card.title}</h3>
                <p className="m-0 text-slate-700">{card.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="relative grid gap-[18px] overflow-hidden rounded-[28px] border border-slate-400/25 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.88))] p-[26px] shadow-[0_24px_60px_rgba(15,23,42,0.08)] md:col-span-4">
          <div className="grid gap-2">
            <p className="m-0 text-[0.78rem] font-bold tracking-[0.18em] text-teal-700 uppercase">Checklist</p>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">Database contract</h2>
          </div>
          <div className="rounded-[20px] border border-slate-400/20 bg-white/80 p-[18px]">
            <pre className="m-0 whitespace-pre-wrap font-mono text-[0.92rem] leading-[1.6] text-slate-950">{`comments(
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

        <section className="relative grid gap-[18px] overflow-hidden rounded-[28px] border border-slate-400/25 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.88))] p-[26px] shadow-[0_24px_60px_rgba(15,23,42,0.08)] md:col-span-8">
          <div className="grid gap-2">
            <p className="m-0 text-[0.78rem] font-bold tracking-[0.18em] text-teal-700 uppercase">Release notes</p>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">Annotation interaction decisions</h2>
          </div>
          <ul className="m-0 grid gap-[14px] pl-5 text-slate-700 marker:text-teal-700">
            {releaseNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>

        <section className="relative grid gap-[18px] overflow-hidden rounded-[28px] border border-slate-400/25 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.88))] p-[26px] shadow-[0_24px_60px_rgba(15,23,42,0.08)] md:col-span-4">
          <div className="grid gap-2">
            <p className="m-0 text-[0.78rem] font-bold tracking-[0.18em] text-teal-700 uppercase">Try the surface</p>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">Use this page as your local annotation sandbox.</h2>
          </div>
          <p className="m-0 text-slate-700">
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
