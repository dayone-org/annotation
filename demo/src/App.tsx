import { useState, type ReactNode } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { AnnotationOverlay } from '@dayone/annotation'

const annotationSupabaseUrl = import.meta.env.VITE_ANNOTATION_SUPABASE_URL ?? ''
const annotationSupabaseAnonKey = import.meta.env.VITE_ANNOTATION_SUPABASE_ANON_KEY ?? ''

console.log({ annotationSupabaseUrl, annotationSupabaseAnonKey })

type ContentSection = {
  title: string
  body: string
}

type RoutePageProps = {
  title: string
  sections: ContentSection[]
}

function RoutePage({ title, sections }: RoutePageProps) {
  return (
    <main className="page">
      <h2>{title}</h2>
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
        </section>
      ))}
    </main>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const [overlayEnabled, setOverlayEnabled] = useState(() => Boolean(annotationSupabaseUrl && annotationSupabaseAnonKey))

  return (
    <div className="app">
      <header className="site-header">
        <h1>Header</h1>
      </header>

      <nav className="site-nav">
        <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/">
          Home
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/board">
          Board
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/catalog">
          Catalog
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/settings">
          Settings
        </NavLink>
      </nav>

      <section className="toolbar">
        <p>Mount the overlay here if env vars are set.</p>
        <button
          disabled={!annotationSupabaseUrl || !annotationSupabaseAnonKey}
          onClick={() => setOverlayEnabled((current) => !current)}
          type="button"
        >
          {overlayEnabled ? 'Unmount overlay' : 'Mount overlay'}
        </button>
      </section>

      {children}

      {overlayEnabled ? (
        <AnnotationOverlay supabaseAnonKey={annotationSupabaseAnonKey} supabaseUrl={annotationSupabaseUrl} />
      ) : null}
    </div>
  )
}

const homeSections: ContentSection[] = [
  {
    title: 'Subheader 1',
    body: 'Body 1 for the home route.',
  },
  {
    title: 'Subheader 2',
    body: 'Body 2 for the home route.',
  },
  {
    title: 'Subheader 3',
    body: 'Body 3 for the home route.',
  },
]

const boardSections: ContentSection[] = [
  {
    title: 'Subheader 1',
    body: 'Body 1 for the board route.',
  },
  {
    title: 'Subheader 2',
    body: 'Body 2 for the board route.',
  },
  {
    title: 'Subheader 3',
    body: 'Body 3 for the board route.',
  },
]

const catalogSections: ContentSection[] = [
  {
    title: 'Subheader 1',
    body: 'Body 1 for the catalog route.',
  },
  {
    title: 'Subheader 2',
    body: 'Body 2 for the catalog route.',
  },
  {
    title: 'Subheader 3',
    body: 'Body 3 for the catalog route.',
  },
]

const settingsSections: ContentSection[] = [
  {
    title: 'Subheader 1',
    body: 'Body 1 for the settings route.',
  },
  {
    title: 'Subheader 2',
    body: 'Body 2 for the settings route.',
  },
  {
    title: 'Subheader 3',
    body: 'Body 3 for the settings route.',
  },
]

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route element={<RoutePage sections={homeSections} title="Home" />} path="/" />
        <Route element={<RoutePage sections={boardSections} title="Board" />} path="/board" />
        <Route element={<RoutePage sections={catalogSections} title="Catalog" />} path="/catalog" />
        <Route element={<RoutePage sections={settingsSections} title="Settings" />} path="/settings" />
      </Routes>
    </Shell>
  )
}
