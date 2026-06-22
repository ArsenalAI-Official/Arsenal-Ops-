// Render helpers — how to mount the thing under test. A small ladder, each rung
// adding one concern, so a test pulls in only what it needs
// (docs/frontend-testing-guide.md §4).
//
//   renderPlain(ui)              no providers (component uses no queries/router)
//   renderWithQueryClient(ui)    + QueryClient
//   renderWithRouter(ui, opts)   + QueryClient + MemoryRouter
//   renderPage(ui, opts)         + a route pattern so useParams resolves
//
// Each returns `{ user, queryClient, ...renderResult }` so a test gets a ready
// userEvent handle and can inspect/seed the cache without re-instantiating.
import { type ReactElement, type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createTestQueryClient } from './queryClient';

export type RenderResultWithExtras = RenderResult & {
  user: UserEvent;
  queryClient: QueryClient;
};

function finalize(result: RenderResult, queryClient: QueryClient): RenderResultWithExtras {
  return Object.assign(result, {
    user: userEvent.setup(),
    queryClient,
  });
}

/** No providers — for components that use neither react-query nor the router. */
export function renderPlain(ui: ReactElement): RenderResultWithExtras {
  const queryClient = createTestQueryClient();
  return finalize(render(ui), queryClient);
}

/** QueryClient only. */
export function renderWithQueryClient(
  ui: ReactElement,
  queryClient: QueryClient = createTestQueryClient(),
): RenderResultWithExtras {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return finalize(render(ui, { wrapper: Wrapper }), queryClient);
}

export interface RouterRenderOptions {
  /** Initial URL. Default `/`. */
  route?: string;
  /** Route pattern the `ui` is mounted under (so `useParams` resolves). Default `*`. */
  path?: string;
  /** Provide to inspect/seed the cache from the test. A fresh one is made otherwise. */
  queryClient?: QueryClient;
}

/** QueryClient + MemoryRouter (no explicit route pattern). */
export function renderWithRouter(
  ui: ReactElement,
  { route = '/', queryClient = createTestQueryClient() }: Omit<RouterRenderOptions, 'path'> = {},
): RenderResultWithExtras {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return finalize(render(ui, { wrapper: Wrapper }), queryClient);
}

/** QueryClient + a MemoryRouter route pattern, for page components using useParams. */
export function renderPage(
  ui: ReactElement,
  { route = '/', path = '*', queryClient = createTestQueryClient() }: RouterRenderOptions = {},
): RenderResultWithExtras {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return finalize(render(ui, { wrapper: Wrapper }), queryClient);
}
