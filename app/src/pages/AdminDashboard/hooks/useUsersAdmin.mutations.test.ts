// Payload + error coverage for the Users-tab create/update/delete mutations
// (useUsersAdmin). The invalidation KEY sets are pinned in
// adminHooks.invalidation.test.ts; here we lock down the request BODY/endpoint
// and the toast-on-error path. create-user is authorization-granting, so the
// exact body (notably the roles→comma-joined `role` field the backend expects)
// is load-bearing.
//
// Network faked at the wire by MSW; default handlers serve create-user (200)
// and user delete (204). Per-test we install capturing/erroring overrides.
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import type { UserListItemResponse } from '@/client';
import { server } from '@/mocks/node';
import { API_BASE } from '@/mocks/handlers/constants';
import { useUsersAdmin } from './useUsersAdmin';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
  Toaster: () => null,
}));

// toastErrorHandler(action)(err) reads err.message via permissionAwareError;
// it ends up calling toast.error, which our mock captures.

function makeHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper };
}

const alwaysConfirm = async () => true;

describe('useUsersAdmin — user write payloads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('CREATE posts email/name and joins roles into a comma-separated `role`', async () => {
    let body: unknown;
    server.use(
      http.post(`${API_BASE}/auth/admin/create-user`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ status: 'created' });
      }),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useUsersAdmin(alwaysConfirm), { wrapper });

    act(() =>
      result.current.setUserForm({
        email: 'new@arsenalai.com',
        name: 'New Hire',
        roles: ['developer', 'admin'],
      }),
    );
    await act(async () => {
      result.current.handleSaveUser();
    });

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual({
      email: 'new@arsenalai.com',
      name: 'New Hire',
      roles: ['developer', 'admin'],
      role: 'developer,admin', // backend expects the comma-joined string too
    });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });

  it('CREATE is blocked client-side when name or email is blank (no request)', async () => {
    let hit = false;
    server.use(
      http.post(`${API_BASE}/auth/admin/create-user`, () => {
        hit = true;
        return HttpResponse.json({ status: 'created' });
      }),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useUsersAdmin(alwaysConfirm), { wrapper });

    act(() => result.current.setUserForm({ email: '  ', name: '', roles: ['developer'] }));
    await act(async () => {
      result.current.handleSaveUser();
    });

    expect(hit).toBe(false);
    expect(toastErrorMock).toHaveBeenCalled();
    expect(toastErrorMock.mock.calls.flat().join(' ')).toMatch(/required/i);
  });

  it('CREATE error surfaces a toast', async () => {
    server.use(
      http.post(`${API_BASE}/auth/admin/create-user`, () =>
        HttpResponse.json({ detail: 'Email already authorized' }, { status: 400 }),
      ),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useUsersAdmin(alwaysConfirm), { wrapper });

    act(() =>
      result.current.setUserForm({ email: 'dupe@x.com', name: 'Dupe', roles: ['developer'] }),
    );
    await act(async () => {
      result.current.handleSaveUser();
    });

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it('UPDATE profile PUTs name/email/github_username to /auth/admin/users/{id}', async () => {
    let body: unknown;
    let hitId: string | undefined;
    server.use(
      http.put(`${API_BASE}/auth/admin/users/:id`, async ({ request, params }) => {
        hitId = params.id as string;
        body = await request.json();
        return HttpResponse.json({ id: 12, name: 'Renamed', email: 'r@x.com' });
      }),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useUsersAdmin(alwaysConfirm), { wrapper });

    act(() =>
      result.current.handleOpenEditUser({
        id: 12,
        name: 'Old',
        email: 'old@x.com',
      } as UserListItemResponse),
    );
    act(() =>
      result.current.setEditUserForm({
        name: '  Renamed  ',
        email: '  r@x.com  ',
        github_username: '  ghuser  ',
      }),
    );
    await act(async () => {
      result.current.handleSaveEditUser();
    });

    await waitFor(() => expect(body).toBeDefined());
    expect(hitId).toBe('12');
    expect(body).toEqual({ name: 'Renamed', email: 'r@x.com', github_username: 'ghuser' });

    // Success side effects (useUsersAdmin.ts onSuccess): a success toast fires
    // and the edit modal's `editingUser` resets to null so the form closes.
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current.editingUser).toBeNull());
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('UPDATE error surfaces a toast and leaves editingUser set', async () => {
    server.use(
      http.put(`${API_BASE}/auth/admin/users/:id`, () =>
        HttpResponse.json({ detail: 'Email already in use' }, { status: 400 }),
      ),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useUsersAdmin(alwaysConfirm), { wrapper });

    act(() =>
      result.current.handleOpenEditUser({
        id: 12,
        name: 'Old',
        email: 'old@x.com',
      } as UserListItemResponse),
    );
    act(() =>
      result.current.setEditUserForm({
        name: 'Renamed',
        email: 'dupe@x.com',
        github_username: '',
      }),
    );
    await act(async () => {
      result.current.handleSaveEditUser();
    });

    // onError (toastErrorHandler('update user')) fires; onSuccess did NOT, so
    // the edit stays open (editingUser still set) for the admin to correct.
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(result.current.editingUser).not.toBeNull();
  });

  it('DELETE user DELETEs /auth/admin/users/{id} after confirmation', async () => {
    let hitId: string | undefined;
    server.use(
      http.delete(`${API_BASE}/auth/admin/users/:id`, ({ params }) => {
        hitId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useUsersAdmin(alwaysConfirm), { wrapper });

    await act(async () => {
      await result.current.handleDeleteUser({
        id: 55,
        name: 'X',
        email: 'x@x.com',
      } as UserListItemResponse);
    });

    await waitFor(() => expect(hitId).toBe('55'));
  });

  it('DELETE is aborted when the confirm dialog is declined (no request)', async () => {
    let hit = false;
    server.use(
      http.delete(`${API_BASE}/auth/admin/users/:id`, () => {
        hit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const declineConfirm = async () => false;
    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useUsersAdmin(declineConfirm), { wrapper });

    await act(async () => {
      await result.current.handleDeleteUser({
        id: 55,
        name: 'X',
        email: 'x@x.com',
      } as UserListItemResponse);
    });

    expect(hit).toBe(false);
  });
});
