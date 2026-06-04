// @vitest-environment jsdom
//
// Pins the highest-drift-risk behavior of the extracted admin hooks: the
// cross-cutting cache-invalidation sets (see app/CLAUDE.md "Cross-cutting
// invalidation rule"). These have no other automated coverage — the extraction
// was validated by manual diff-audit only — so a regression in an invalidation
// key would otherwise merge silently. Uses createElement (not JSX) so the file
// stays .ts and needs no JSX-transform config in vitest.config.ts.
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// apiFetch is the only network surface these hooks touch — resolve it so the
// mutations reach their onSettled/onSuccess invalidation.
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }));

import { useProjectsAdmin } from './useProjectsAdmin';
import { useUsersAdmin } from './useUsersAdmin';

function makeHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const spy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, spy };
}

// Loose structural type — the precise vi.spyOn generic on an overloaded method
// (invalidateQueries) doesn't survive `tsc -b`; we only need `.mock.calls`.
const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls
    .map((c) => (c[0] as { queryKey?: unknown[] } | undefined)?.queryKey)
    .filter(Boolean);

describe('admin hook cache invalidation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('category create invalidates the full category scope', async () => {
    const { wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useProjectsAdmin(), { wrapper });

    await act(async () => {
      result.current.createCategoryMutation.mutate({ name: 'X', description: null });
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(['admin', 'projectCategories']);
    expect(keys).toContainEqual(['admin', 'projects']);
    expect(keys).toContainEqual(['admin', 'projectsWeeklyReport']);
  });

  it('user create invalidates users + employees + stats + developers (cross-cutting)', async () => {
    const { wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useUsersAdmin(), { wrapper });

    // handleSaveUser validates name/email, so seed a valid form first.
    act(() => result.current.setUserForm({ email: 'a@b.com', name: 'Test', roles: ['developer'] }));
    await act(async () => {
      result.current.handleSaveUser();
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(['admin', 'users']);
    expect(keys).toContainEqual(['admin', 'employees']); // CLAUDE.md: users writes touch employees
    expect(keys).toContainEqual(['admin', 'stats']);
    expect(keys).toContainEqual(['developers']);
  });
});
