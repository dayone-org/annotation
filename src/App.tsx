import { useEffect, useState } from "react";
import { AnnotationOverlay } from "@/lib/annotation-overlay/AnnotationOverlay";
import logo from "@/logo.svg";

const annotationSupabaseUrl = import.meta.env.VITE_ANNOTATION_SUPABASE_URL ?? "";
const annotationSupabaseAnonKey = import.meta.env.VITE_ANNOTATION_SUPABASE_ANON_KEY ?? "";

const steps = [
  {
    title: "Installation",
    description: "Install the package and mount the client component once.",
    code: `npm install github:dayone-org/annotation#main`,
  },
  {
    title: "Database",
    description: "Create a comments table in Supabase. Add project_id if you want one table for multiple projects.",
    code: `comments(
  id uuid primary key,
  page_path text not null,
  project_id text,
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
    title: "Environment",
    description: "Set Supabase credentials in your environment.",
    code: `NEXT_PUBLIC_ANNOTATION_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_ANNOTATION_SUPABASE_ANON_KEY=your-supabase-anon-key`,
  },
  {
    title: "Usage",
    description: "Render the annotation widget from your app layout.",
    code: `import { Annotation } from "annotation";

<Annotation
  supabaseUrl={process.env.NEXT_PUBLIC_ANNOTATION_SUPABASE_URL!}
  supabaseAnonKey={process.env.NEXT_PUBLIC_ANNOTATION_SUPABASE_ANON_KEY!}
  position="bottom-right"
/>`,
  },
];

const contentPages = [
  {
    path: "/content-1",
    label: "Content",
    title: "Lorem ipsum",
    intro:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    sections: [
      {
        heading: "Section one",
        paragraphs: [
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
          "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
        ],
      },
      {
        heading: "Section two",
        paragraphs: [
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio. Praesent libero. Sed cursus ante dapibus diam. Sed nisi. Nulla quis sem at nibh elementum imperdiet.",
          "Duis sagittis ipsum. Praesent mauris. Fusce nec tellus sed augue semper porta. Mauris massa. Vestibulum lacinia arcu eget nulla. Class aptent taciti sociosqu ad litora torquent per conubia nostra.",
        ],
      },
      {
        heading: "Section three",
        paragraphs: [
          "Curabitur sodales ligula in libero. Sed dignissim lacinia nunc. Curabitur tortor. Pellentesque nibh. Aenean quam. In scelerisque sem at dolor. Maecenas mattis.",
          "Sed convallis tristique sem. Proin ut ligula vel nunc egestas porttitor. Morbi lectus risus, iaculis vel, suscipit quis, luctus non, massa. Fusce ac turpis quis ligula lacinia aliquet.",
        ],
      },
      {
        heading: "Section four",
        paragraphs: [
          "Mauris ipsum. Nulla metus metus, ullamcorper vel, tincidunt sed, euismod in, nibh. Quisque volutpat condimentum velit. Class aptent taciti sociosqu ad litora torquent per conubia nostra.",
          "Nam nec ante. Sed lacinia, urna non tincidunt mattis, tortor neque adipiscing diam, a cursus ipsum ante quis turpis. Nulla facilisi. Ut fringilla. Suspendisse potenti.",
        ],
      },
      {
        heading: "Section five",
        paragraphs: [
          "Nunc feugiat mi a tellus consequat imperdiet. Vestibulum sapien. Proin quam. Etiam ultrices. Suspendisse in justo eu magna luctus suscipit. Sed lectus.",
          "Integer euismod lacus luctus magna. Quisque cursus, metus vitae pharetra auctor, sem massa mattis sem, at interdum magna augue eget diam. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae.",
        ],
      },
      {
        heading: "Section six",
        paragraphs: [
          "Morbi lacinia molestie dui. Praesent blandit dolor. Sed non quam. In vel mi sit amet augue congue elementum. Morbi in ipsum sit amet pede facilisis laoreet.",
          "Donec lacus nunc, viverra nec, blandit vel, egestas et, augue. Vestibulum tincidunt malesuada tellus. Ut ultrices ultrices enim. Curabitur sit amet mauris. Morbi in dui quis est pulvinar ullamcorper.",
        ],
      },
    ],
  },
] as const;

const validPaths = ["/", ...contentPages.map((page) => page.path)] as const;

function getNormalizedPath(pathname: string) {
  return validPaths.includes(pathname as (typeof validPaths)[number]) ? pathname : "/";
}

function RouteNavigation({
  currentPath,
  onNavigate,
}: {
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="demo-nav">
      <button
        className="demo-nav-button"
        data-active={currentPath === "/"}
        onClick={() => onNavigate("/")}
        type="button"
      >
        Home
      </button>
      {contentPages.map((page) => (
        <button
          className="demo-nav-button"
          data-active={currentPath === page.path}
          key={page.path}
          onClick={() => onNavigate(page.path)}
          type="button"
        >
          {page.label}
        </button>
      ))}
    </div>
  );
}

function HomePage() {
  return (
    <div className="demo-stack demo-stack-lg">
      <img alt="Annotation" className="demo-logo" src={logo} />
      <header className="demo-stack">
        <h2 className="demo-heading demo-heading-md">Annotate your interface</h2>
        <p className="demo-muted">
          This package mounts an overlay, lets an annotator click real DOM targets, and stores
          page-scoped threads in Supabase without turning the app itself into a product feature.
        </p>
      </header>
      <section className="demo-stack">
        <h2 className="demo-heading demo-heading-md">Getting started</h2>
        {steps.map((step) => (
          <div className="demo-step" key={step.title}>
            <div className="demo-stack">
              <h3 className="demo-heading demo-heading-sm">{step.title}</h3>
              <p className="demo-muted demo-small">{step.description}</p>
            </div>
            <pre className="demo-code-block">
              {step.code}
            </pre>
          </div>
        ))}
      </section>
    </div>
  );
}

function ContentPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: readonly {
    heading: string;
    paragraphs: readonly string[];
  }[];
}) {
  return (
    <div className="demo-stack demo-stack-lg">
      <header className="demo-stack demo-stack-md">
        <h1 className="demo-heading demo-heading-xl">{title}</h1>
        <p className="demo-muted">{intro}</p>
      </header>
      <div className="demo-stack demo-stack-xl">
        {sections.map((section) => (
          <section className="demo-stack demo-stack-md" key={section.heading}>
            <h2 className="demo-heading demo-heading-lg">{section.heading}</h2>
            <div className="demo-stack demo-stack-md demo-muted">
              {section.paragraphs.map((paragraph) => (
                <p className="demo-paragraph" key={paragraph}>
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [currentPath, setCurrentPath] = useState(() =>
    typeof window === "undefined" ? "/" : getNormalizedPath(window.location.pathname),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncPath = () => {
      setCurrentPath(getNormalizedPath(window.location.pathname));
    };

    const normalizedPath = getNormalizedPath(window.location.pathname);
    if (window.location.pathname !== normalizedPath) {
      window.history.replaceState({}, "", normalizedPath);
    }

    syncPath();
    window.addEventListener("popstate", syncPath);

    return () => {
      window.removeEventListener("popstate", syncPath);
    };
  }, []);

  const navigateTo = (path: string) => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.location.pathname === path) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    window.history.pushState({}, "", path);
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const currentContentPage = contentPages.find((page) => page.path === currentPath);

  return (
    <div className="demo-app-shell">
      <div className="demo-app-frame">
        <RouteNavigation currentPath={currentPath} onNavigate={navigateTo} />
        {currentContentPage ? (
          <ContentPage
            intro={currentContentPage.intro}
            sections={currentContentPage.sections}
            title={currentContentPage.title}
          />
        ) : (
          <HomePage />
        )}
        <AnnotationOverlay
          pagePath={currentPath}
          supabaseAnonKey={annotationSupabaseAnonKey}
          supabaseUrl={annotationSupabaseUrl}
        />
      </div>
    </div>
  );
}

export default App;
