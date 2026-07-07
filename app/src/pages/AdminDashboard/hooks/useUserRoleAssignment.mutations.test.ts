// Request-level coverage for per-user role assignment (useUserRoleAssignment).
// The invalidation KEY sets after a toggle are pinned in
// adminHooks.invalidation.test.ts; this file asserts the OTHER half — that
// assigning POSTs and removing DELETEs the exact
// /auth/admin/users/{userId}/roles/{roleId} endpoint, that the current user's
// capabilities are refreshed only when they edit their OWN roles, and that a
// server error surfaces a toast.
//
// Network is faked at the wire by MSW. The default admin handlers already serve
// 204 for both the POST and DELETE assignment routes; per-test we install
// capturing/erroring overrides via server.use.
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import type { RoleResponse, UserListItemResponse } from '@/client';
import { server } from '@/mocks/node';
import { API_BASE } from '@/mocks/handlers/constants';
import { setMockAuthState } from '@/test-utils/authMocks';
import { authActionMocks } from '@/test-utils/authMocks';
import { useUserRoleAssignment } from './useUserRoleAssignment';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: vi.fn(), message: vi.fn() },
  Toaster: () => null,
}));

function makeHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper };
}

const targetUser = (id: number): UserListItemResponse =>
  ({ id, name: 'Target', email: 't@b.com' }) as UserListItemResponse;
const role = (id: number): RoleResponse =>
  ({ id, name: 'qa', is_system: false, capability_keys: [] }) as RoleResponse;

describe('useUserRoleAssignment — assign/remove requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Current user id 999 ≠ the targeted user id, so the self-cap-refresh path
    // stays out of these two request-shape tests.
    setMockAuthState({
      user: { id: 999, name: 'Me', email: 'me@b.com', role: 'admin', is_first_login: false },
    });
  });

  it('assigning a role POSTs to /auth/admin/users/{userId}/roles/{roleId}', async () => {
    let method: string | undefined;
    let hitUrl: string | undefined;
    server.use(
      http.post(`${API_BASE}/auth/admin/users/:userId/roles/:roleId`, ({ request }) => {
        method = request.method;
        hitUrl = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useUserRoleAssignment(), { wrapper });

    await act(async () => {
      result.current.handleToggleUserRoleById(targetUser(42), role(3), true);
    });

    await waitFor(() => expect(hitUrl).toBeDefined());
    expect(method).toBe('POST');
    expect(hitUrl).toBe('/api/auth/admin/users/42/roles/3');
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('removing a role DELETEs the same endpoint', async () => {
    let method: string | undefined;
    let hitUrl: string | undefined;
    server.use(
      http.delete(`${API_BASE}/auth/admin/users/:userId/roles/:roleId`, ({ request }) => {
        method = request.method;
        hitUrl = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useUserRoleAssignment(), { wrapper });

    await act(async () => {
      result.current.handleToggleUserRoleById(targetUser(42), role(3), false);
    });

    await waitFor(() => expect(hitUrl).toBeDefined());
    expect(method).toBe('DELETE');
    expect(hitUrl).toBe('/api/auth/admin/users/42/roles/3');
  });

  it('refreshes the current user capabilities when they edit their OWN roles', async () => {
    // Current user id matches the toggle target → self-refresh path fires.
    setMockAuthState({
      user: { id: 7, name: 'Me', email: 'me@b.com', role: 'admin', is_first_login: false },
    });
    server.use(
      http.post(
        `${API_BASE}/auth/admin/users/:userId/roles/:roleId`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useUserRoleAssignment(), { wrapper });

    await act(async () => {
      result.current.handleToggleUserRoleById(targetUser(7), role(2), true);
    });

    await waitFor(() => expect(authActionMocks.refreshCapabilities).toHaveBeenCalled());
  });

  it('does NOT refresh own capabilities when editing a DIFFERENT user', async () => {
    // Capture a POSITIVE settle signal: the assign request landed. Awaiting
    // this (not a bare `.not.toHaveBeenCalled()`, which is satisfied instantly)
    // guarantees onSettled has run before we assert the self-refresh was skipped.
    let hit = false;
    server.use(
      http.post(`${API_BASE}/auth/admin/users/:userId/roles/:roleId`, () => {
        hit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useUserRoleAssignment(), { wrapper });

    // current user is 999; target is 42.
    await act(async () => {
      result.current.handleToggleUserRoleById(targetUser(42), role(2), true);
    });

    // Await the request landing FIRST (positive settle), then assert no
    // self-refresh — the current user (999) did not edit their own roles.
    await waitFor(() => expect(hit).toBe(true));
    expect(authActionMocks.refreshCapabilities).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('surfaces an error toast when the assignment request fails', async () => {
    server.use(
      http.post(`${API_BASE}/auth/admin/users/:userId/roles/:roleId`, () =>
        HttpResponse.json({ detail: 'User already has this role' }, { status: 409 }),
      ),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useUserRoleAssignment(), { wrapper });

    await act(async () => {
      result.current.handleToggleUserRoleById(targetUser(42), role(3), true);
    });

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls.flat().join(' ')).toMatch(/User already has this role/i);
  });
});
