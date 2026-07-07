// Behavior coverage for the project-category manager. The modal itself is a
// controlled presentational component (its four onCreate/onUpdate/onDelete
// callbacks own the round-trips), so we mount it wired to the REAL
// useProjectsAdmin category mutations. That exercises the whole path — form →
// callback → apiFetch → MSW — and lets us assert the actual request BODY and
// endpoint for add / rename / delete, plus the empty-name validation guard.
//
// Network is faked at the wire by MSW; per-test we install capturing handlers
// via server.use so the request body is the probe. sonner is stubbed so the
// error path is observable.
import { createElement, useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { server } from '@/mocks/node';
import { API_BASE } from '@/mocks/handlers/constants';
import type { ProjectCategory } from '../types';
import { useProjectsAdmin } from '../hooks/useProjectsAdmin';
import CategoryManagerModal from './CategoryManagerModal';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: vi.fn(), message: vi.fn() },
  Toaster: () => null,
}));

const alwaysConfirm = async () => true;

/**
 * Mounts the modal wired to the real useProjectsAdmin category mutations. Seed
 * the category list via the passed handler override; the modal always renders
 * open.
 */
function HarnessInner() {
  const admin = useProjectsAdmin(alwaysConfirm);
  const [open, setOpen] = useState(true);
  const categories = admin.categoriesQuery.data ?? [];
  return createElement(CategoryManagerModal, {
    open,
    onOpenChange: setOpen,
    categories: categories as ProjectCategory[],
    isLoading: admin.categoriesQuery.isLoading,
    isMutating:
      admin.createCategoryMutation.isPending ||
      admin.updateCategoryMutation.isPending ||
      admin.deleteCategoryMutation.isPending,
    // Mirror production (ProjectsContainer) EXACTLY: `.then(() => undefined)`
    // with no error callback, so a mutation rejection PROPAGATES. The hook's
    // onError toasts, and the rejected promise flows back to the modal's
    // awaited handleCreate — which then skips its clear-on-success step, so the
    // form stays intact. A `.then(ok, err)` error-swallowing wrapper would
    // resolve the rejection and let the component wrongly clear the form.
    onCreate: (payload) => admin.createCategoryMutation.mutateAsync(payload).then(() => undefined),
    onUpdate: (id, payload) =>
      admin.updateCategoryMutation.mutateAsync({ id, payload }).then(() => undefined),
    onDelete: (id) => admin.deleteCategoryMutation.mutateAsync(id).then(() => undefined),
  });
}

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(createElement(HarnessInner), { wrapper });
}

function seedCategories(cats: ProjectCategory[]) {
  server.use(http.get(`${API_BASE}/admin/project-categories/`, () => HttpResponse.json(cats)));
}

const cat = (over: Partial<ProjectCategory>): ProjectCategory => ({
  id: 1,
  name: 'Internal',
  description: null,
  project_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('CategoryManagerModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adding a category POSTs {name, description} to project-categories', async () => {
    seedCategories([]);
    let body: unknown;
    server.use(
      http.post(`${API_BASE}/admin/project-categories/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(cat({ id: 9, name: 'Client', description: 'External work' }));
      }),
    );

    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByPlaceholderText(/Category name/i), 'Client');
    await user.type(screen.getByPlaceholderText(/Description \(optional\)/i), 'External work');
    await user.click(screen.getByRole('button', { name: /Add category/i }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual({ name: 'Client', description: 'External work' });
  });

  it('add sends description=null when the description field is blank', async () => {
    seedCategories([]);
    let body: { description?: unknown } | undefined;
    server.use(
      http.post(`${API_BASE}/admin/project-categories/`, async ({ request }) => {
        body = (await request.json()) as { description?: unknown };
        return HttpResponse.json(cat({ id: 9, name: 'Solo' }));
      }),
    );

    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByPlaceholderText(/Category name/i), 'Solo');
    await user.click(screen.getByRole('button', { name: /Add category/i }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body?.description).toBeNull();
  });

  it('blocks add with an empty/whitespace name — button disabled, no request', async () => {
    seedCategories([]);
    let hit = false;
    server.use(
      http.post(`${API_BASE}/admin/project-categories/`, () => {
        hit = true;
        return HttpResponse.json(cat({}));
      }),
    );

    const user = userEvent.setup();
    renderModal();

    const addBtn = screen.getByRole('button', { name: /Add category/i });
    // Empty → disabled.
    expect(addBtn).toBeDisabled();
    // Whitespace-only → still disabled (name.trim() is empty).
    await user.type(screen.getByPlaceholderText(/Category name/i), '   ');
    expect(addBtn).toBeDisabled();
    expect(hit).toBe(false);
  });

  it('renaming a category PUTs the new name to project-categories/{id}', async () => {
    seedCategories([cat({ id: 4, name: 'Old Name', description: 'desc' })]);
    let body: unknown;
    let hitId: string | undefined;
    server.use(
      http.put(`${API_BASE}/admin/project-categories/:id`, async ({ request, params }) => {
        hitId = params.id as string;
        body = await request.json();
        return HttpResponse.json(cat({ id: 4, name: 'New Name', description: 'desc' }));
      }),
    );

    const user = userEvent.setup();
    renderModal();

    // Wait for the seeded row, then enter inline edit via its (now labelled)
    // pencil button — queried by accessible name, scoped to the row.
    const row = (await screen.findByText('Old Name')).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /edit/i }));

    const nameInput = within(row).getByDisplayValue('Old Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');
    await user.click(within(row).getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(body).toBeDefined());
    expect(hitId).toBe('4');
    expect(body).toEqual({ name: 'New Name', description: 'desc' });
  });

  it('deleting a category DELETEs project-categories/{id} after confirmation', async () => {
    seedCategories([cat({ id: 6, name: 'Trash Me' })]);
    let hitId: string | undefined;
    server.use(
      http.delete(`${API_BASE}/admin/project-categories/:id`, ({ params }) => {
        hitId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderModal();

    const row = (await screen.findByText('Trash Me')).closest('li') as HTMLElement;
    // Click the (now labelled) delete button by accessible name, scoped to the
    // row — this opens the AlertDialog.
    await user.click(within(row).getByRole('button', { name: /delete/i }));

    // Confirm in the alert dialog.
    const confirmBtn = await screen.findByRole('button', { name: /^Delete$/i });
    await user.click(confirmBtn);

    await waitFor(() => expect(hitId).toBe('6'));
  });

  it('surfaces an error toast when a create request fails', async () => {
    seedCategories([]);
    server.use(
      http.post(`${API_BASE}/admin/project-categories/`, () =>
        HttpResponse.json({ detail: 'Category name already exists' }, { status: 409 }),
      ),
    );

    const user = userEvent.setup();
    renderModal();

    const nameInput = screen.getByPlaceholderText(/Category name/i);
    await user.type(nameInput, 'Dupe');
    await user.click(screen.getByRole('button', { name: /Add category/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls.flat().join(' ')).toMatch(/already exists/i);

    // Form-intact-on-error contract (CategoryManagerModal.tsx handleCreate):
    // the create rejected, so the clear-on-success step must NOT have run — the
    // typed name is still present so the admin can adjust it without retyping.
    expect(nameInput).toHaveValue('Dupe');
  });
});
