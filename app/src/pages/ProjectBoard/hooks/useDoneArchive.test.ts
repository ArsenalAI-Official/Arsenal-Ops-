// Pins the Done-column archive contract: the aggregates probe (limit=0) runs
// with the board and NEVER loads rows; pages load only after loadOlder() —
// first call fetches page 1, subsequent calls page forward by offset — and
// `archivedRemaining` counts down from the probe's total as pages arrive.
// The network surface is the real apiFetch pipeline against MSW (the default
// done-archive handler returns an empty archive; these tests override it with
// a stateful 30-item fixture that honors limit/offset).
// Uses createElement (not JSX) so the file stays .ts.
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { SlimWorkItem } from '@/client';
import { server } from '@/mocks/node';
import { API_BASE } from '@/mocks/handlers/constants';
import { DONE_ARCHIVE_PAGE_SIZE } from '../lib/boardConstants';
import { useDoneArchive } from './useDoneArchive';

const ID = '7';
const FILTERS = { project_id: ID };
const TOTAL = 30; // page 1 = 25, page 2 = the remaining 5

function slimDone(i: number): SlimWorkItem {
  return {
    id: `a${i}`,
    key: `TP-a${i}`,
    title: `Archived item ${i}`,
    status: 'done',
    type: 'task',
    priority: 'medium',
    story_points: 2,
    tags: [],
    completed_at: '2026-01-01T00:00:00',
  };
}

/** Stateful override honoring limit/offset, newest-first like the backend. */
function installArchiveFixture() {
  const requests: { limit: number; offset: number }[] = [];
  server.use(
    http.get(`${API_BASE}/workitems/board/done-archive`, ({ request }) => {
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get('limit') ?? 25);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      requests.push({ limit, offset });
      const items = Array.from({ length: TOTAL }, (_, i) => slimDone(i)).slice(
        offset,
        offset + limit,
      );
      return HttpResponse.json({ items, total: TOTAL, total_points: TOTAL * 2 });
    }),
  );
  return requests;
}

function makeHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

// (server.resetHandlers in the global afterEach drops the fixture override.)
describe('useDoneArchive', () => {
  it('probes aggregates on mount (limit=0) without loading any rows', async () => {
    const requests = installArchiveFixture();
    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useDoneArchive(ID, FILTERS), { wrapper });

    await waitFor(() => expect(result.current.archivedTotal).toBe(TOTAL));
    expect(result.current.archivedTotalPoints).toBe(TOTAL * 2);
    expect(result.current.archivedRemaining).toBe(TOTAL);
    expect(result.current.archivedItems).toEqual([]);
    // Exactly one request, and it was the count-only probe.
    expect(requests).toEqual([{ limit: 0, offset: 0 }]);
  });

  it('loadOlder pages forward and counts remaining down to zero', async () => {
    const requests = installArchiveFixture();
    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useDoneArchive(ID, FILTERS), { wrapper });
    await waitFor(() => expect(result.current.archivedTotal).toBe(TOTAL));

    // First click: enables the pages query → page 1 (offset 0).
    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.archivedItems).toHaveLength(DONE_ARCHIVE_PAGE_SIZE));
    expect(result.current.archivedRemaining).toBe(TOTAL - DONE_ARCHIVE_PAGE_SIZE);
    // Normalized to the WorkItem view-model at the fetch boundary.
    expect(result.current.archivedItems[0]).toMatchObject({
      id: 'a0',
      status: 'done',
      description: '',
    });

    // Second click: next page by offset → all loaded, nothing remaining.
    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.archivedItems).toHaveLength(TOTAL));
    expect(result.current.archivedRemaining).toBe(0);
    expect(requests).toEqual([
      { limit: 0, offset: 0 },
      { limit: DONE_ARCHIVE_PAGE_SIZE, offset: 0 },
      { limit: DONE_ARCHIVE_PAGE_SIZE, offset: DONE_ARCHIVE_PAGE_SIZE },
    ]);

    // Fully loaded: further clicks must not fire another request.
    act(() => result.current.loadOlder());
    expect(requests).toHaveLength(3);
  });
});
