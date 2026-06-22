// Pins the highest-drift-risk behavior of the extracted board mutation hooks:
// the cross-cutting cache-invalidation sets (see app/CLAUDE.md "Cross-cutting
// invalidation rule" + plan R10). A work-item write must invalidate the
// work-item scope (['workItems'] + ['myTasks'] via invalidateWorkItemScope)
// AND, for status/log-hours, the per-item ['workItem', id, 'comments']
// auto-comment cache; a sprint write must invalidate the sprint/work-item
// scope. These have no other automated coverage, so a regression would merge
// silently. Mirrors AdminDashboard/hooks/adminHooks.invalidation.test.ts.
// Uses createElement (not JSX) so the file stays .ts.
//
// The network surface is intercepted at the wire by MSW (the default board
// handlers resolve 2xx). The optimistic tests inject a hanging or rejecting PUT
// per-test with server.use(...) — exercising the real apiFetch pipeline
// (ApiError mapping included) rather than a stubbed fetch fn.
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

// sonner toast + react-router navigate are UI side effects (not the network
// boundary); stub them so the hooks run outside a real router/toaster.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { toast } from 'sonner';
import { server } from '@/mocks/node';
import { API_BASE } from '@/mocks/handlers/constants';
import { invalidateProjectScope, invalidateWorkItemScope } from '@/lib/invalidations';
import { useWorkItemMutations } from './useWorkItemMutations';
import { useSprintMutations } from './useSprintMutations';
import { useCommentMutation } from './useCommentMutation';

const ID = '7';

function makeHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const spy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper, spy };
}

// Loose structural type — the precise vi.spyOn generic on an overloaded method
// (invalidateQueries) doesn't survive `tsc -b`; we only need `.mock.calls`.
const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls
    .map((c) => (c[0] as { queryKey?: unknown[] } | undefined)?.queryKey)
    .filter(Boolean);

// Mirror the orchestrator's wiring (useBoardInvalidations): invalidateWorkItems
// busts the full work-item scope (+ the open item's detail cache);
// invalidateProject busts the full project scope. We pass the real shared
// helpers so the test asserts the production key set, not a stub.
function workItemArgs(queryClient: QueryClient) {
  return {
    workItemFilters: { project_id: ID },
    invalidateWorkItems: () => {
      invalidateWorkItemScope(queryClient, ID);
      queryClient.invalidateQueries({ queryKey: ['workItem', 'w1', 'detail'] });
    },
    invalidateProject: () => invalidateProjectScope(queryClient, ID),
    selectedItem: { id: 'w1' } as never,
    onCreateSuccess: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true),
  };
}

function sprintArgs(queryClient: QueryClient) {
  return {
    sprints: [],
    invalidateWorkItems: () => invalidateWorkItemScope(queryClient, ID),
    editingSprint: { id: 3, name: 'S3' } as never,
    completingSprintId: 3,
    deletingSprintId: 3,
    setShowCreateSprintModal: vi.fn(),
    setEditingSprint: vi.fn(),
    setCompletingSprintId: vi.fn(),
    setDeletingSprintId: vi.fn(),
  };
}

describe('board hook cache invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('status change invalidates work-item scope + the item comments cache (R10)', async () => {
    const { queryClient, wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useWorkItemMutations(ID, workItemArgs(queryClient)), {
      wrapper,
    });

    await act(async () => {
      result.current.handleStatusChange({ id: 'w1' } as never, 'done');
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(['workItems']); // invalidateWorkItemScope
    expect(keys).toContainEqual(['myTasks']); // CLAUDE.md cross-cutting rule
    expect(keys).toContainEqual(['workItem', 'w1', 'comments']); // R10 auto-comment
  });

  it('log hours invalidates work-item scope + the item comments cache (R10)', async () => {
    const { queryClient, wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useWorkItemMutations(ID, workItemArgs(queryClient)), {
      wrapper,
    });

    await act(async () => {
      result.current.handleLogHours({ id: 'w1' } as never, 2);
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(['workItems']);
    expect(keys).toContainEqual(['myTasks']);
    expect(keys).toContainEqual(['workItem', 'w1', 'comments']); // R10 auto-comment
  });

  it('move (drag status change) invalidates work-item scope + the item comments cache (R10)', async () => {
    const { queryClient, wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useWorkItemMutations(ID, workItemArgs(queryClient)), {
      wrapper,
    });

    await act(async () => {
      result.current.moveMutation.mutate({ itemId: 'w1', newStatus: 'done' });
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(['workItems']);
    expect(keys).toContainEqual(['myTasks']);
    expect(keys).toContainEqual(['workItem', 'w1', 'comments']); // R10 auto-comment
  });

  it('create item invalidates work-item + project scope', async () => {
    const { queryClient, wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useWorkItemMutations(ID, workItemArgs(queryClient)), {
      wrapper,
    });

    await act(async () => {
      result.current.createItemMutation.mutate({ type: 'task', story_points: 0 } as never);
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(['workItems']);
    expect(keys).toContainEqual(['myTasks']);
    expect(keys).toContainEqual(['project', ID]); // invalidateProjectScope
    expect(keys).toContainEqual(['sprints', ID]);
  });

  it('delete item invalidates work-item + project scope', async () => {
    const { queryClient, wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useWorkItemMutations(ID, workItemArgs(queryClient)), {
      wrapper,
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true); // handleDeleteItem guards on confirm()
    await act(async () => {
      result.current.handleDeleteItem('w1');
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(['workItems']);
    expect(keys).toContainEqual(['myTasks']);
    expect(keys).toContainEqual(['project', ID]);
  });

  it('complete sprint invalidates project + work-item scope', async () => {
    const { queryClient, wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useSprintMutations(ID, sprintArgs(queryClient)), {
      wrapper,
    });

    await act(async () => {
      result.current.handleCompleteSprint();
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(['project', ID]); // invalidateProjectScope
    expect(keys).toContainEqual(['sprints', ID]);
    expect(keys).toContainEqual(['workItems']); // invalidateWorkItemScope
    expect(keys).toContainEqual(['myTasks']);
  });

  it('delete sprint invalidates work-item + project scope', async () => {
    const { queryClient, wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useSprintMutations(ID, sprintArgs(queryClient)), {
      wrapper,
    });

    await act(async () => {
      result.current.handleDeleteSprint();
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(['workItems']); // invalidateWorkItemScope
    expect(keys).toContainEqual(['myTasks']);
    expect(keys).toContainEqual(['project', ID]); // invalidateProjectScope
    expect(keys).toContainEqual(['sprints', ID]);
  });

  it('submit comment invalidates the item comments cache (R10)', async () => {
    const { wrapper, spy } = makeHarness();
    const { result } = renderHook(
      () => useCommentMutation({ selectedItem: { id: 'w1' } as never, project: null }),
      { wrapper },
    );

    await act(async () => {
      result.current.handleSubmitComment('hello', 'comment');
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(['workItem', 'w1', 'comments']); // R10
  });
});

// Pins R2: the optimistic mutations (drag `move` + StatusDotMenu `statusChange`)
// must read/write/rollback the cache at the EXACT key shape
// ['workItems', { project_id }, 'board']. The DOM characterization test covers
// the statusChange path black-box; this covers BOTH paths at the cache level —
// notably `move`, which has no DOM coverage (jsdom can't drive HTML5 drag). A
// regression that targeted a wrong key shape, or dropped the optimistic
// flip/rollback, would be caught here. (Query keys match structurally, so this
// pins the key SHAPE + the flip/rollback logic — the real failure modes.)
describe('board optimistic status cache (R2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const FILTERS = { project_id: ID };
  const BOARD_KEY = ['workItems', FILTERS, 'board'];
  const seed = (qc: QueryClient) =>
    qc.setQueryData(BOARD_KEY, [
      { id: 'w1', status: 'todo' },
      { id: 'w2', status: 'in_progress' },
    ]);
  const statusOf = (qc: QueryClient, itemId: string) =>
    (qc.getQueryData(BOARD_KEY) as Array<{ id: string; status: string }> | undefined)?.find(
      (t) => t.id === itemId,
    )?.status;

  it('move: optimistic write flips the item at the exact board key', async () => {
    const { queryClient, wrapper } = makeHarness();
    seed(queryClient);
    // PUT never settles → the optimistic write stays in place.
    server.use(http.put(`${API_BASE}/workitems/:id`, () => new Promise(() => {})));
    const { result } = renderHook(
      () => useWorkItemMutations(ID, { ...workItemArgs(queryClient), workItemFilters: FILTERS }),
      { wrapper },
    );

    await act(async () => {
      result.current.moveMutation.mutate({ itemId: 'w1', newStatus: 'done' });
    });

    // If onMutate targeted a different key shape, w1 would still read 'todo'.
    await waitFor(() => expect(statusOf(queryClient, 'w1')).toBe('done'));
    expect(statusOf(queryClient, 'w2')).toBe('in_progress'); // untouched
  });

  it('move: rejected PUT rolls the exact board key back + toasts the error', async () => {
    const { queryClient, wrapper } = makeHarness();
    seed(queryClient);
    // PUT rejects → onError rolls the optimistic write back + toasts the detail.
    server.use(
      http.put(`${API_BASE}/workitems/:id`, () =>
        HttpResponse.json({ detail: 'Subtask still open' }, { status: 400 }),
      ),
    );
    const { result } = renderHook(
      () => useWorkItemMutations(ID, { ...workItemArgs(queryClient), workItemFilters: FILTERS }),
      { wrapper },
    );

    await act(async () => {
      result.current.moveMutation.mutate({ itemId: 'w1', newStatus: 'done' });
    });

    await waitFor(() => expect(statusOf(queryClient, 'w1')).toBe('todo')); // rolled back
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Subtask still open');
  });

  it('status change: rejected PUT rolls the exact board key back', async () => {
    const { queryClient, wrapper } = makeHarness();
    seed(queryClient);
    server.use(
      http.put(`${API_BASE}/workitems/:id`, () =>
        HttpResponse.json({ detail: 'nope' }, { status: 400 }),
      ),
    );
    const { result } = renderHook(
      () => useWorkItemMutations(ID, { ...workItemArgs(queryClient), workItemFilters: FILTERS }),
      { wrapper },
    );

    await act(async () => {
      result.current.handleStatusChange({ id: 'w1' } as never, 'done');
    });

    await waitFor(() => expect(statusOf(queryClient, 'w1')).toBe('todo'));
  });
});
