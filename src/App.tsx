import { useState } from 'react'
import { AnnotationOverlay } from './index'
import './App.css'

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
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Annotation package</p>
          <h1>Annotate live UI directly on the page you are debugging.</h1>
          <p className="lede">
            This package mounts an overlay, lets an annotator click real DOM targets, and stores page-scoped threads in
            Supabase without turning the app itself into a product feature.
          </p>
        </div>

        <div className="hero-panel">
          <div className="status-row">
            <span className={`status-dot${isAnnotationEnabled ? ' status-dot--on' : ''}`}></span>
            <strong>{isAnnotationEnabled ? 'Overlay enabled' : 'Overlay disabled'}</strong>
          </div>
          <p>
            Pass `supabaseUrl` and `supabaseAnonKey` into <code>{'<AnnotationOverlay />'}</code>. In this Vite demo, set
            <code> VITE_ANNOTATION_SUPABASE_URL</code> and <code>VITE_ANNOTATION_SUPABASE_ANON_KEY</code>.
          </p>
          <button
            className="hero-button"
            disabled={!annotationSupabaseUrl || !annotationSupabaseAnonKey}
            onClick={() => setAnnotationEnabled((current) => !current)}
            type="button"
          >
            {isAnnotationEnabled ? 'Unmount annotation overlay' : 'Mount annotation overlay'}
          </button>
        </div>
      </header>

      <main className="content-grid">
        <section className="panel panel--feature">
          <div className="panel-heading">
            <p className="eyebrow">Implementation shape</p>
            <h2>What this first pass already covers</h2>
          </div>
          <div className="card-grid">
            {featureCards.map((card) => (
              <article className="info-card" key={card.title}>
                <h3>{card.title}</h3>
                <p>{card.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel panel--rail">
          <div className="panel-heading">
            <p className="eyebrow">Checklist</p>
            <h2>Database contract</h2>
          </div>
          <div className="schema-card">
            <pre>{`comments(
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

        <section className="panel panel--timeline">
          <div className="panel-heading">
            <p className="eyebrow">Release notes</p>
            <h2>Annotation interaction decisions</h2>
          </div>
          <ul className="timeline">
            {releaseNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>

        <section className="panel panel--cta">
          <div className="panel-heading">
            <p className="eyebrow">Try the surface</p>
            <h2>Use this page as your local annotation sandbox.</h2>
          </div>
          <p>
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
