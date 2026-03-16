import { AnnotationOverlay } from '@/lib/annotation-overlay/AnnotationOverlay'

const annotationSupabaseUrl = import.meta.env.VITE_ANNOTATION_SUPABASE_URL ?? ''
const annotationSupabaseAnonKey = import.meta.env.VITE_ANNOTATION_SUPABASE_ANON_KEY ?? ''

const steps = [
  {
    title: 'Installation',
    description: 'Install the overlay package alongside the Supabase client.',
    code: 'npm install @dayone/annotation @supabase/supabase-js',
  },
  {
    title: 'Database',
    description: 'Create a comments table in Supabase.',
    code: `comments(
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
)`,
  },
  {
    title: 'Environment',
    description: 'Set Supabase credentials in your environment.',
    code: `ANNOTATION_SUPABASE_URL=your-supabase-url
ANNOTATION_SUPABASE_ANON_KEY=your-supabase-anon-key`,
  },
]

function App() {
  return (
      <div className="mx-auto max-w-3xl px-8 py-32 flex flex-col gap-16">
        <header className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold text-balance">
          Annotate your interface.
          </h1>
          <p className="text-muted-foreground">
            This package mounts an overlay, lets an annotator click real DOM targets, and stores page-scoped threads in
            Supabase without turning the app itself into a product feature.
          </p>
        </header>
          <section className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">
                Getting started
                </h2>
              {steps.map((step) => (
                <div key={step.title} className="rounded-md bg-muted/50 p-4 flex flex-col gap-4">
                  <div className="flex flex-col ">
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                  <pre className="overflow-x-auto rounded-md border border-border p-4 text-xs font-mono">{step.code}</pre>
                </div>
              ))}
          </section>
        <AnnotationOverlay supabaseAnonKey={annotationSupabaseAnonKey} supabaseUrl={annotationSupabaseUrl} />
      </div>
  )
}

export default App
