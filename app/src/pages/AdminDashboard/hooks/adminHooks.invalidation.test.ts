// Pins the highest-drift-risk behavior of the extracted admin hooks: the
// cross-cutting cache-invalidation sets (see app/CLAUDE.md "Cross-cutting
// invalidation rule"). These have no other automated coverage — the extraction
// was validated by manual diff-audit only — so a regression in an invalidation
// key would otherwise merge silently. Uses createElement (not JSX) so the file
// stays .ts and needs no JSX-transform config in vitest.config.ts.
//
// The network surface is intercepted at the wire by MSW; the default admin
// handlers resolve the mutation acks so each mutation reaches its
// onSettled/onSuccess invalidation. Auth comes from the global hoisted mock
// (src/setupTests.ts), overridden below to a user id that never matches the
// role-toggle target so the conditional self-refresh path stays out of the test.
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { setMockAuthState } from '@/test-utils/authMocks';
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
  beforeEach(() => {
    vi.clearAllMocks();
    // id ≠ the role-toggle target (id 1) below, so useUserRoleAssignment skips
    // the self-cap-refresh path and we assert only the invalidation set.
    setMockAuthState({
      user: {
        id: 999,
        name: 'Other',
        email: 'o@b.com',
        role: 'admin',
        is_first_login: false,
        is_external: false,
      },
    });
  });

  it('category create invalidates the full category scope', async () => {
    const { wrapper, spy } = makeHarness();
    const { result } = renderHook(() => useProjectsAdmin(async () => true), { wrapper });

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
    const { result } = renderHook(() => useUsersAdmin(async () => true), { wrapper });

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
    const { result } = renderHook(() => useEmployeesAdmin(async () => true), { wrapper });

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
    const { result } = renderHook(() => useEmployeesAdmin(async () => true), { wrapper });

    await act(async () => {
      await result.current.handleDeleteEmployee(42);
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
