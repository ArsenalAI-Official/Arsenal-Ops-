// Payload + error-path coverage for the role editor's write path
// (useRolesAdmin.handleSaveRole). The invalidation-key sets are already pinned
// in adminHooks.invalidation.test.ts; this file asserts the OTHER half — that
// create/update fire the RIGHT request BODY to the RIGHT endpoint, and that a
// server error surfaces a toast instead of silently closing the modal.
//
// This is the privileged, backend-mutating RBAC surface, so the request body is
// the load-bearing thing to lock down. Network is faked at the wire by MSW; the
// default admin handlers do NOT register the role-CRUD routes (only role
// *assignment*), so each test installs a capturing handler via server.use —
// which doubles as the request-body probe.
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { server } from '@/mocks/node';
import { API_BASE } from '@/mocks/handlers/constants';
import { setMockAuthState } from '@/test-utils/authMocks';
import { useRolesAdmin } from './useRolesAdmin';

// sonner is a UI side effect, not the network boundary — stub it so the error
// path can be asserted without a real toaster in the tree.
const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
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

// Always-confirm stub for the ConfirmFn dependency (delete path uses it; the
// save paths under test don't, but the hook requires the arg).
const alwaysConfirm = async () => true;

describe('useRolesAdmin — role write payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A user id that never matches an edited role's holders, keeping the
    // self-cap-refresh timer path incidental (it's a mocked no-op regardless).
    setMockAuthState({
      user: { id: 999, name: 'Other', email: 'o@b.com', role: 'admin', is_first_login: false },
    });
  });

  it('CREATE posts name + description + capability_keys to /auth/admin/roles', async () => {
    let body: unknown;
    server.use(
      http.post(`${API_BASE}/auth/admin/roles`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          id: 7,
          name: 'qa_lead',
          description: 'QA leads',
          is_system: false,
          capability_keys: ['admin.employees', 'project.board'],
        });
      }),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useRolesAdmin(alwaysConfirm), { wrapper });

    act(() =>
      result.current.setRoleForm({
        name: '  qa_lead  ', // trimmed by handleSaveRole
        description: '  QA leads  ',
        capability_keys: ['admin.employees', 'project.board'],
      }),
    );
    await act(async () => {
      await result.current.handleSaveRole();
    });

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual({
      name: 'qa_lead',
      description: 'QA leads',
      capability_keys: ['admin.employees', 'project.board'],
    });
    // Success toast + no error toast on the happy path.
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('CREATE sends description=null when the field is blank', async () => {
    let body: { description?: unknown } | undefined;
    server.use(
      http.post(`${API_BASE}/auth/admin/roles`, async ({ request }) => {
        body = (await request.json()) as { description?: unknown };
        return HttpResponse.json({
          id: 8,
          name: 'finance_viewer',
          description: null,
          is_system: false,
          capability_keys: [],
        });
      }),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useRolesAdmin(alwaysConfirm), { wrapper });

    act(() =>
      result.current.setRoleForm({
        name: 'finance_viewer',
        description: '   ',
        capability_keys: [],
      }),
    );
    await act(async () => {
      await result.current.handleSaveRole();
    });

    await waitFor(() => expect(body).toBeDefined());
    expect(body?.description).toBeNull();
  });

  it('CREATE error surfaces a toast and does NOT close the modal', async () => {
    server.use(
      http.post(`${API_BASE}/auth/admin/roles`, () =>
        HttpResponse.json({ detail: 'Role name already exists' }, { status: 400 }),
      ),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useRolesAdmin(alwaysConfirm), { wrapper });

    // Open the create modal so we can assert it stays open on failure.
    act(() => result.current.handleOpenCreateRole());
    expect(result.current.showRoleModal).toBe(true);

    act(() => result.current.setRoleForm({ name: 'dupe', description: '', capability_keys: [] }));
    await act(async () => {
      await result.current.handleSaveRole();
    });

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls.flat().join(' ')).toMatch(/Role name already exists/i);
    // The modal must NOT close silently on error — the admin gets to fix + retry.
    expect(result.current.showRoleModal).toBe(true);
  });

  it('UPDATE of a non-system role PUTs meta then replaces capabilities', async () => {
    const metaBodies: unknown[] = [];
    const capsBodies: unknown[] = [];
    server.use(
      http.put(`${API_BASE}/auth/admin/roles/:id`, async ({ request, params }) => {
        metaBodies.push({ id: params.id, body: await request.json() });
        return HttpResponse.json({
          id: 5,
          name: 'qa_lead',
          description: 'Updated',
          is_system: false,
          capability_keys: ['admin.users'],
        });
      }),
      http.put(`${API_BASE}/auth/admin/roles/:id/capabilities`, async ({ request, params }) => {
        capsBodies.push({ id: params.id, body: await request.json() });
        return HttpResponse.json({
          id: 5,
          name: 'qa_lead',
          description: 'Updated',
          is_system: false,
          capability_keys: ['admin.users', 'admin.users_write'],
        });
      }),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useRolesAdmin(alwaysConfirm), { wrapper });

    // Seed the editor from an existing role, then change name+desc+caps.
    act(() =>
      result.current.handleOpenEditRole({
        id: 5,
        name: 'qa',
        description: 'old',
        is_system: false,
        capability_keys: ['admin.users'],
      }),
    );
    act(() =>
      result.current.setRoleForm({
        name: 'qa_lead',
        description: 'Updated',
        capability_keys: ['admin.users', 'admin.users_write'],
      }),
    );
    await act(async () => {
      await result.current.handleSaveRole();
    });

    // Meta PUT carries the changed name/description (not capability_keys).
    await waitFor(() => expect(metaBodies.length).toBe(1));
    expect(metaBodies[0]).toEqual({
      id: '5',
      body: { name: 'qa_lead', description: 'Updated' },
    });
    // Capabilities PUT carries the full replacement set.
    await waitFor(() => expect(capsBodies.length).toBe(1));
    expect(capsBodies[0]).toEqual({
      id: '5',
      body: { capability_keys: ['admin.users', 'admin.users_write'] },
    });
    expect(result.current.showRoleModal).toBe(false);
  });

  it('UPDATE of a SYSTEM role keeps the original name (name is locked)', async () => {
    const capsBodies: unknown[] = [];
    let metaBody: { name?: unknown } | undefined;
    server.use(
      http.put(`${API_BASE}/auth/admin/roles/:id`, async ({ request }) => {
        metaBody = (await request.json()) as { name?: unknown };
        return HttpResponse.json({
          id: 1,
          name: 'admin',
          description: 'changed desc',
          is_system: true,
          capability_keys: ['*'],
        });
      }),
      http.put(`${API_BASE}/auth/admin/roles/:id/capabilities`, async ({ request }) => {
        capsBodies.push(await request.json());
        return HttpResponse.json({
          id: 1,
          name: 'admin',
          description: 'changed desc',
          is_system: true,
          capability_keys: ['*'],
        });
      }),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useRolesAdmin(alwaysConfirm), { wrapper });

    act(() =>
      result.current.handleOpenEditRole({
        id: 1,
        name: 'admin',
        description: 'old desc',
        is_system: true,
        capability_keys: ['*'],
      }),
    );
    // Attempt to rename a system role via the form; the description change forces
    // a meta PUT, but the name sent must remain the original 'admin'.
    act(() =>
      result.current.setRoleForm({
        name: 'super_admin',
        description: 'changed desc',
        capability_keys: ['*'],
      }),
    );
    await act(async () => {
      await result.current.handleSaveRole();
    });

    await waitFor(() => expect(metaBody).toBeDefined());
    expect(metaBody?.name).toBe('admin'); // locked, not 'super_admin'
    await waitFor(() => expect(capsBodies.length).toBe(1));
  });

  it('SAVE with a blank name is blocked client-side (no request, error toast)', async () => {
    let hit = false;
    server.use(
      http.post(`${API_BASE}/auth/admin/roles`, () => {
        hit = true;
        return HttpResponse.json({ id: 1 });
      }),
    );

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useRolesAdmin(alwaysConfirm), { wrapper });

    act(() => result.current.setRoleForm({ name: '   ', description: '', capability_keys: [] }));
    await act(async () => {
      await result.current.handleSaveRole();
    });

    expect(hit).toBe(false);
    expect(toastErrorMock).toHaveBeenCalled();
    expect(toastErrorMock.mock.calls.flat().join(' ')).toMatch(/name is required/i);
  });
});
