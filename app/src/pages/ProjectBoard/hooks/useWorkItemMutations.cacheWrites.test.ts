// Pins the board-cache WRITE behavior of useWorkItemMutations that the sibling
// boardHooks.invalidation.test.ts does NOT cover. (Despite most of these paths
// being non-optimistic straight cache writes, hence the .cacheWrites name — only
// moveMutation is truly optimistic.)
//
// That file covers:
//   - the cross-cutting invalidation sets (['workItems'] + ['myTasks'] + comments)
//   - moveMutation's onError ROLLBACK (reject → status returns to 'todo' + toast).
//
// This file OWNS:
//   - createItemMutation: the request BODY apiFetch POSTs (captured per-test via
//     server.use) — the payload-shaping branch (task vs story hours) is pure
//     logic with no other coverage.
//   - logHoursMutation.onSuccess: writes the server's logged/remaining hours back
//     into the board cache for the matching item only.
//   - saveEditMutation.onSuccess: merges edits + server response into the board
//     cache; onError leaves the cache untouched (no optimistic write to roll back).
//   - moveMutation's OPTIMISTIC write: onMutate flips the item at the exact board
//     key ['workItems', filters, 'board'], while cancelling by the ['workItems']
//     PREFIX (F-C3) — the prefix-cancel vs exact-write asymmetry, pinned by
//     spying on cancelQueries. (Rollback is owned by the sibling file above.)
//
// Network is faked at the wire by MSW (default board handlers resolve 2xx);
// per-test server.use(...) captures request bodies or injects failures, so the
// real apiFetch pipeline (ApiError mapping) runs. Uses createElement (not JSX)
// so the file stays .ts, mirroring boardHooks.invalidation.test.ts.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// sonner toast + react-router navigate are UI side effects, not the network
// boundary — stub them so the hook runs outside a real router/toaster.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { API_BASE } from '@/mocks/handlers/constants';
import { server } from '@/mocks/node';
import type { WorkItem } from '@/types/workItems';
import type { CreateItemFormValues } from '../modals/CreateItemModal';
import { useWorkItemMutations } from './useWorkItemMutations';

const ID = '7';
const FILTERS = { project_id: ID };
const BOARD_KEY = ['workItems', FILTERS, 'board'];

function makeHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

// Mirror the orchestrator wiring the invalidation-test uses; the invalidate
// callbacks are no-op here (invalidation is asserted elsewhere) — this file
// asserts the cache CONTENTS the mutations write.
function args(queryClient: QueryClient, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    workItemFilters: FILTERS,
    invalidateWorkItems: () => queryClient.invalidateQueries({ queryKey: ['workItems'] }),
    invalidateProject: () => queryClient.invalidateQueries({ queryKey: ['project', ID] }),
    selectedItem: { id: 'w1' } as never,
    onCreateSuccess: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// Minimal WorkItem factory — only the fields these tests read matter; the rest
// satisfy the view-model shape.
const wi = (id: string, patch: Partial<WorkItem> = {}): WorkItem =>
  ({
    id,
    key: `TP-${id}`,
    type: 'task',
    title: `Item ${id}`,
    description: '',
    status: 'todo',
    assigned_hours: 0,
    remaining_hours: 0,
    logged_hours: 0,
    story_points: 0,
    priority: 'medium',
    assignee: '',
    assignee_id: null,
    sprint: '',
    sprint_id: null,
    product_id: '',
    tags: [],
    epic: '',
    ...patch,
  }) as WorkItem;

const board = (qc: QueryClient) => qc.getQueryData<WorkItem[]>(BOARD_KEY) ?? [];
const item = (qc: QueryClient, id: string) => board(qc).find((w) => w.id === id);

describe('useWorkItemMutations — createItemMutation request body', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POSTs a task payload: story_points forced to 0, hours mirror estimated_hours', async () => {
    const { queryClient, wrapper } = makeHarness();
    let captured: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE}/workitems/`, async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'w99' });
      }),
    );
    const { result } = renderHook(() => useWorkItemMutations(ID, args(queryClient)), { wrapper });

    await act(async () => {
      result.current.createItemMutation.mutate({
        type: 'task',
        title: 'A task',
        description: 'd',
        priority: 'high',
        story_points: 5, // ignored for tasks
        assignee_id: 3,
        sprint: 'Backlog',
        epic_id: null,
        parent_id: null,
        due_date: '',
        estimated_hours: '8',
        tags: ['x'],
      } satisfies CreateItemFormValues);
    });
    await waitFor(() => expect(captured).toBeDefined());

    expect(captured).toMatchObject({
      type: 'task',
      title: 'A task',
      priority: 'high',
      story_points: 0, // tasks force 0 regardless of the form value
      assignee_id: 3,
      project_id: ID, // route id, not the form's numeric project
      status: 'todo',
      estimated_hours: 8, // parseInt('8')
      assigned_hours: 8, // task branch: mirrors estimated_hours
      remaining_hours: 8,
      due_date: null, // '' → null
    });
  });

  it('POSTs a non-task payload: keeps story_points, derives hours as points*4', async () => {
    const { queryClient, wrapper } = makeHarness();
    let captured: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE}/workitems/`, async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'w99' });
      }),
    );
    const { result } = renderHook(() => useWorkItemMutations(ID, args(queryClient)), { wrapper });

    await act(async () => {
      result.current.createItemMutation.mutate({
        type: 'user_story',
        title: 'A story',
        description: '',
        priority: 'medium',
        story_points: 3,
        assignee_id: null,
        sprint: 'Backlog',
        epic_id: 0, // falsy → null
        parent_id: null,
        due_date: '2026-01-01',
        estimated_hours: '',
        tags: [],
      } satisfies CreateItemFormValues);
    });
    await waitFor(() => expect(captured).toBeDefined());

    expect(captured).toMatchObject({
      type: 'user_story',
      story_points: 3, // kept for non-tasks
      assigned_hours: 12, // points * 4
      remaining_hours: 12,
      estimated_hours: 0, // '' → parseInt not run → 0
      epic_id: null, // 0 is falsy → coalesced to null
      due_date: '2026-01-01',
    });
  });

  it('calls onCreateSuccess when the create resolves', async () => {
    const { queryClient, wrapper } = makeHarness();
    const onCreateSuccess = vi.fn();
    const { result } = renderHook(
      () => useWorkItemMutations(ID, args(queryClient, { onCreateSuccess })),
      { wrapper },
    );

    await act(async () => {
      result.current.createItemMutation.mutate({
        type: 'task',
        title: 'x',
        description: '',
        priority: 'medium',
        story_points: 0,
        assignee_id: null,
        sprint: 'Backlog',
        epic_id: null,
        parent_id: null,
        due_date: '',
        estimated_hours: '',
        tags: [],
      } satisfies CreateItemFormValues);
    });
    await waitFor(() => expect(onCreateSuccess).toHaveBeenCalledTimes(1));
  });
});

describe('useWorkItemMutations — logHours cache write', () => {
  beforeEach(() => vi.clearAllMocks());

  it('onSuccess writes server logged/remaining hours to the matching item only', async () => {
    const { queryClient, wrapper } = makeHarness();
    queryClient.setQueryData<WorkItem[]>(BOARD_KEY, [
      wi('w1', { logged_hours: 0, remaining_hours: 10 }),
      wi('w2', { logged_hours: 1, remaining_hours: 5 }),
    ]);
    server.use(
      http.post(`${API_BASE}/workitems/:id/log-hours`, () =>
        HttpResponse.json({ logged_hours: 4, remaining_hours: 6 }),
      ),
    );
    const { result } = renderHook(() => useWorkItemMutations(ID, args(queryClient)), { wrapper });

    await act(async () => {
      result.current.handleLogHours(wi('w1'), 4);
    });

    await waitFor(() => expect(item(queryClient, 'w1')?.logged_hours).toBe(4));
    expect(item(queryClient, 'w1')?.remaining_hours).toBe(6);
    // Sibling item untouched.
    expect(item(queryClient, 'w2')?.logged_hours).toBe(1);
    expect(item(queryClient, 'w2')?.remaining_hours).toBe(5);
  });

  it('onError leaves the board cache unchanged (no optimistic write to roll back)', async () => {
    const { queryClient, wrapper } = makeHarness();
    queryClient.setQueryData<WorkItem[]>(BOARD_KEY, [wi('w1', { logged_hours: 2 })]);
    server.use(
      http.post(`${API_BASE}/workitems/:id/log-hours`, () =>
        HttpResponse.json({ detail: 'nope' }, { status: 400 }),
      ),
    );
    const { result } = renderHook(() => useWorkItemMutations(ID, args(queryClient)), { wrapper });

    await act(async () => {
      result.current.handleLogHours(wi('w1'), 4);
    });

    // Settled without touching the cache — logged_hours stays at the seed.
    await waitFor(() => expect(result.current.logHoursMutation.isPending).toBe(false));
    expect(item(queryClient, 'w1')?.logged_hours).toBe(2);
  });
});

describe('useWorkItemMutations — saveEdit cache merge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('onSuccess merges edits + server response into the board cache', async () => {
    const { queryClient, wrapper } = makeHarness();
    queryClient.setQueryData<WorkItem[]>(BOARD_KEY, [
      wi('w1', { title: 'Old', priority: 'low' }),
      wi('w2'),
    ]);
    // Server echoes only the title; the local `edits` (priority) must still win
    // via the onSuccess merge {...wi, ...edits, ...updated}.
    server.use(
      http.put(`${API_BASE}/workitems/:id`, () =>
        HttpResponse.json({ id: 'w1', title: 'Server Title' }),
      ),
    );
    const { result } = renderHook(() => useWorkItemMutations(ID, args(queryClient)), { wrapper });

    await act(async () => {
      result.current.saveEditMutation.mutate({
        itemId: 'w1',
        edits: { title: 'Edited', priority: 'high' },
      });
    });

    await waitFor(() => expect(item(queryClient, 'w1')?.title).toBe('Server Title'));
    expect(item(queryClient, 'w1')?.priority).toBe('high'); // edit preserved
    expect(item(queryClient, 'w2')?.title).toBe('Item w2'); // untouched
  });

  it('handleSaveEdit no-ops when there is no selected item', async () => {
    const { queryClient, wrapper } = makeHarness();
    queryClient.setQueryData<WorkItem[]>(BOARD_KEY, [wi('w1', { title: 'Old' })]);
    const { result } = renderHook(
      () => useWorkItemMutations(ID, args(queryClient, { selectedItem: null })),
      { wrapper },
    );

    await act(async () => {
      result.current.handleSaveEdit({ title: 'Edited' });
    });

    // No mutation fired → cache is exactly the seed.
    expect(result.current.saveEditMutation.isPending).toBe(false);
    expect(item(queryClient, 'w1')?.title).toBe('Old');
  });
});

describe('useWorkItemMutations — move prefix-cancel asymmetry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('onMutate cancels by the ["workItems"] PREFIX but writes only the exact board key', async () => {
    const { queryClient, wrapper } = makeHarness();
    // Two DIFFERENT filter objects → two different exact keys under the same
    // ['workItems'] prefix. onMutate cancels by prefix but writes only the exact
    // key it was given, so the sibling filter's data must remain.
    const siblingFilters = { project_id: 'other' };
    const SIBLING_KEY = ['workItems', siblingFilters, 'board'];
    queryClient.setQueryData<WorkItem[]>(BOARD_KEY, [wi('w1', { status: 'todo' })]);
    queryClient.setQueryData<WorkItem[]>(SIBLING_KEY, [wi('w1', { status: 'todo' })]);

    // Pin the prefix-cancel directly: spy on cancelQueries and assert onMutate
    // cancels the WHOLE ['workItems'] prefix (F-C3) — not the exact board key
    // ['workItems', filters, 'board']. Without this, the "sibling stays 'todo'"
    // assertion below is guaranteed by setQueryData touching a single key
    // regardless of any cancel, so it proves nothing about the cancel scope.
    const cancelSpy = vi.spyOn(queryClient, 'cancelQueries');

    // PUT never settles → the optimistic write stays in place for the assertion.
    server.use(http.put(`${API_BASE}/workitems/:id`, () => new Promise(() => {})));
    const { result } = renderHook(() => useWorkItemMutations(ID, args(queryClient)), { wrapper });

    await act(async () => {
      result.current.moveMutation.mutate({ itemId: 'w1', newStatus: 'done' });
    });

    await waitFor(() => expect(item(queryClient, 'w1')?.status).toBe('done'));

    // Prefix-cancel: cancelled the ['workItems'] prefix, NOT the exact board key.
    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ['workItems'] });
    expect(cancelSpy).not.toHaveBeenCalledWith({ queryKey: BOARD_KEY });

    // Exact-write: only the exact board key was rewritten; the sibling filter's
    // query (same prefix, different exact key) was cancelled but left as-is.
    const sibling = (queryClient.getQueryData<WorkItem[]>(SIBLING_KEY) ?? []).find(
      (w) => w.id === 'w1',
    );
    expect(sibling?.status).toBe('todo');
  });
});
