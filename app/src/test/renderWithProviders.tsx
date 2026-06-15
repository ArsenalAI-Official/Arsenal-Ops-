// Reusable render harness for component tests (jsdom). Wraps the UI in a fresh
// QueryClient + a MemoryRouter route so components using react-query and
// `useParams`/`useNavigate` mount cleanly. Importing this module also installs
// the jsdom polyfills that Radix UI primitives (Popover/DropdownMenu/Tooltip)
// and assorted layout code expect — jsdom ships none of them.
//
// Use under `// @vitest-environment jsdom`. Mock `@/contexts/AuthContext`,
// `@/lib/api`, and `sonner` in the test file (see ProjectBoard.characterization).
import { type ReactElement, type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ── jsdom polyfills (install once on import) ────────────────────────────────
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }

  class StubObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  // Assign jsdom stubs through an untyped view to avoid constructor-shape noise.
  const g = window as unknown as Record<string, unknown>;
  g.ResizeObserver ??= StubObserver;
  g.IntersectionObserver ??= StubObserver;

  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.scrollIntoView ??= () => {};
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
}

/** A QueryClient tuned for tests: no retries, no refetch noise. */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export interface RenderOptions {
  /** Initial URL. Default `/`. */
  route?: string;
  /** Route pattern the `ui` is mounted under (so `useParams` resolves). Default `*`. */
  path?: string;
  /** Provide to inspect/seed the cache from the test. A fresh one is made otherwise. */
  queryClient?: QueryClient;
}

export type RenderWithProvidersResult = RenderResult & { queryClient: QueryClient };

/** Render `ui` inside QueryClientProvider + a MemoryRouter route. */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', path = '*', queryClient = makeTestQueryClient() }: RenderOptions = {},
): RenderWithProvidersResult {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return Object.assign(render(ui, { wrapper: Wrapper }), { queryClient });
}
