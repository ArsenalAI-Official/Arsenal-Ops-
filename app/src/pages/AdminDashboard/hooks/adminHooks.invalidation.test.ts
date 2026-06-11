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
// mutations reach their onSettled/onSuccess invalidation. Resolve `[]` (not
// `{}`): the list queries backing these hooks map over their data, so an array
// keeps an incidental re-render from throwing before invalidation is asserted.
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue([]) }));

// useUserRoleAssignment reads the current user (to decide whether to refresh its
// own caps) via useAuth. Mock it with an id that never matches the target user
// below, so the conditional refreshCapsTwice/setTimeout path stays out of the
// test and we assert only the invalidation set.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 999 }, refreshCapabilities: vi.fn() }),
}));

import { useProjectsAdmin } from './useProjectsAdmin';
import { useUsersAdmin } from './useUsersAdmin';
import { useEmployeesAdmin } from './useEmployeesAdmin';
import { useUserRoleAssignment } from './useUserRoleAssignment';

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

  it('employee save invalidates employees + stats + capacity + developers', async () => {
    const { wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useEmployeesAdmin(), { wrapper });

    // handleSaveEmployee guards on name+email, so seed a valid form first.
    act(() =>
      result.current.setEmployeeForm({
        name: 'Test',
        email: 'a@b.com',
        github_username: '',
        specialization: '',
      }),
    );
    await act(async () => {
      result.current.handleSaveEmployee();
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(['admin', 'employees']);
    expect(keys).toContainEqual(['admin', 'stats']);
    expect(keys).toContainEqual(['admin', 'developers-capacity']);
    expect(keys).toContainEqual(['developers']); // CLAUDE.md: employee writes touch developers
  });

  it('employee delete invalidates employees + stats + capacity + developers', async () => {
    const { wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useEmployeesAdmin(), { wrapper });

    vi.spyOn(window, 'confirm').mockReturnValue(true); // handleDeleteEmployee guards on confirm()
    await act(async () => {
      result.current.handleDeleteEmployee(42);
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(['admin', 'employees']);
    expect(keys).toContainEqual(['admin', 'stats']);
    expect(keys).toContainEqual(['admin', 'developers-capacity']);
    expect(keys).toContainEqual(['developers']);
  });

  it('role assignment invalidates roles + the full user-role impact set', async () => {
    const { wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useUserRoleAssignment(), { wrapper });

    await act(async () => {
      result.current.handleToggleUserRoleById(
        { id: 1 } as never,
        { id: 2 } as never,
        true, // assign
      );
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const keys = invalidatedKeys(spy);
    // invalidateAdminRoles
    expect(keys).toContainEqual(['admin', 'roles']);
    expect(keys).toContainEqual(['admin', 'users']);
    // invalidateAdminUserRoleImpact — role changes can resurface/hide employees + capacity
    expect(keys).toContainEqual(['admin', 'employees']);
    expect(keys).toContainEqual(['admin', 'developers-capacity']);
  });
});
