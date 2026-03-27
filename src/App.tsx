import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AnnotationOverlay } from "@/lib/annotation-overlay/AnnotationOverlay";
import logo from "@/logo.svg";

const annotationSupabaseUrl = import.meta.env.VITE_ANNOTATION_SUPABASE_URL ?? "";
const annotationSupabaseAnonKey = import.meta.env.VITE_ANNOTATION_SUPABASE_ANON_KEY ?? "";

const steps = [
  {
    title: "Installation",
    description: "Install the overlay package alongside the Supabase client.",
    code: "npm install @dayone/annotation @supabase/supabase-js",
  },
  {
    title: "Database",
    description: "Create a comments table in Supabase.",
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
    title: "Environment",
    description: "Set Supabase credentials in your environment.",
    code: `ANNOTATION_SUPABASE_URL=your-supabase-url
ANNOTATION_SUPABASE_ANON_KEY=your-supabase-anon-key`,
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
    <div className="-ml-2 flex flex-wrap gap-2">
      <Button
        onClick={() => onNavigate("/")}
        type="button"
        variant={currentPath === "/" ? "secondary" : "ghost"}
      >
        Home
      </Button>
      {contentPages.map((page) => (
        <Button
          key={page.path}
          onClick={() => onNavigate(page.path)}
          type="button"
          variant={currentPath === page.path ? "secondary" : "ghost"}
        >
          {page.label}
        </Button>
      ))}
    </div>
  );
}

function HomePage() {
  return (
    <div className="flex flex-col gap-16">
      <img src={logo} alt="Annotation" className="h-12 w-fit" />
      <header className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-balance">Annotate your interface</h2>
        <p className="text-muted-foreground">
          This package mounts an overlay, lets an annotator click real DOM targets, and stores
          page-scoped threads in Supabase without turning the app itself into a product feature.
        </p>
      </header>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Getting started</h2>
        {steps.map((step) => (
          <div key={step.title} className="flex flex-col gap-4 rounded-md bg-muted/50 p-4">
            <div className="flex flex-col ">
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
            <pre className="overflow-x-auto rounded-md border border-border p-4 font-mono text-xs">
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
    <div className="flex flex-col gap-16">
      <header className="flex flex-col gap-4">
        <h1 className="text-4xl font-semibold text-balance">{title}</h1>
        <p className="text-muted-foreground">{intro}</p>
      </header>
      <div className="flex flex-col gap-10">
        {sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-4">
            <h2 className="text-2xl font-semibold">{section.heading}</h2>
            <div className="flex flex-col gap-4 text-muted-foreground">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="leading-7">
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
    <div className="min-h-screen p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-32">
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
