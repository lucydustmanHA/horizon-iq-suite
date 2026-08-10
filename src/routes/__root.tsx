import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppShell } from "../components/app-shell";
import { Toaster } from "../components/ui/sonner";
import { usePortfolio } from "../lib/store";
import { $loadUseCases, $reportError } from "../lib/use-cases.server";
import { UserProvider } from "../lib/user-context";
import { AIChat } from "../components/ai-chat";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  $reportError({ data: { message: String(error?.message ?? error), stack: String(error?.stack ?? "") } }).catch(() => {});
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Horizon QX — AI & Innovation Portal" },
      {
        name: "description",
        content:
          "Manage AI, automation, and innovation use cases through their lifecycle — a modern portal built for portfolio, pipeline, and executive reporting.",
      },
      { name: "author", content: "Horizon QX" },
      { property: "og:title", content: "Horizon QX — AI & Innovation Portal" },
      {
        property: "og:description",
        content:
          "Portfolio, pipeline, and executive reporting for AI and automation use cases.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/logo.svg" },
      { rel: "shortcut icon", href: "/logo.svg" },
      { rel: "icon", href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%234f46e5'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-family='system-ui,sans-serif' font-size='10' font-weight='700' fill='white'%3EHQX%3C/text%3E%3C/svg%3E", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [mounted, setMounted] = useState(false);
  const initialized = usePortfolio((s) => s.initialized);
  const setUseCases = usePortfolio((s) => s.setUseCases);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;

    // Fetch fresh data from DB — cached localStorage renders instantly;
    // this overwrites with live data for cross-user sync.
    const load = () => {
      $loadUseCases()
        .then(setUseCases)
        .catch((err) => console.error("[DB] poll load failed:", err));
    };

    // Initial load with retry
    const fetchWithRetry = (attempt = 0) => {
      $loadUseCases()
        .then(setUseCases)
        .catch((err) => {
          console.error(`[DB] load attempt ${attempt + 1} failed:`, err);
          if (attempt < 2) setTimeout(() => fetchWithRetry(attempt + 1), 1500);
        });
    };
    fetchWithRetry();

    // Poll every 30s for app-wide live sync (pauses when tab hidden)
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);

    return () => clearInterval(interval);
  }, [mounted, setUseCases]);

  // During SSR, render a minimal shell to avoid hydration errors from
  // browser-only libraries (@dnd-kit, Zustand persist, etc.)
  if (!mounted) {
    return (
      <QueryClientProvider client={queryClient}>
        <div id="ssr-placeholder" />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <AppShell>
          <Outlet />
        </AppShell>
        <Toaster />
        <AIChat />
      </UserProvider>
    </QueryClientProvider>
  );
}
