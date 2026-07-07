// PersonalTasks page integration tests. Zero coverage before this file.
//
// The page's data layer (usePersonalTasksData → usePersonalTaskMutations) hits
// endpoints the default MSW handler set doesn't cover (personal-tasks CRUD, the
// projects list), so we register a small stateful personal-tasks store per test
// via server.use. Auth is the global hoisted admin (all caps). The create + the
// complete/toggle flows are asserted on their PUT/POST payloads and on the
// optimistic ['personalTasks'] cache write.
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { PersonalTaskResponse } from '@/client';
import { API_BASE } from '@/mocks/handlers/constants';
import { server } from '@/mocks/node';
import { renderPage } from '@/test-utils/render';
import PersonalTasksPage from './PersonalTasks';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
  Toaster: () => null,
}));

function makeTask(overrides: Partial<PersonalTaskResponse> = {}): PersonalTaskResponse {
  return {
    id: 1,
    title: 'Buy milk',
    description: 'Skimmed',
    status: 'pending',
    priority: 'medium',
    estimated_hours: 0,
    tags: [],
    is_converted: false,
    due_date: null,
    project_id: null,
    work_item_id: null,
    converted_at: null,
    user_id: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** A stateful in-memory personal-tasks backend for one test. Returns spies so
 *  the test can assert the exact request bodies the mutations sent. */
function installPersonalTasksBackend(seed: PersonalTaskResponse[]) {
  let tasks = [...seed];
  const createBodies: Record<string, unknown>[] = [];
  const putBodies: { id: string; body: Record<string, unknown> }[] = [];
  let nextId = Math.max(0, ...seed.map((t) => t.id)) + 1;

  server.use(
    http.get(`${API_BASE}/personal-tasks/`, () => HttpResponse.json(tasks)),
    http.get(`${API_BASE}/projects/`, () => HttpResponse.json([])),
    http.post(`${API_BASE}/personal-tasks/`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      createBodies.push(body);
      const created = makeTask({ id: nextId++, title: String(body.title ?? 'New') });
      tasks = [...tasks, created];
      return HttpResponse.json(created);
    }),
    http.put(`${API_BASE}/personal-tasks/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>;
      putBodies.push({ id: String(params.id), body });
      tasks = tasks.map((t) => (String(t.id) === String(params.id) ? { ...t, ...body } : t));
      return HttpResponse.json({});
    }),
  );

  return { createBodies, putBodies };
}

describe('PersonalTasks page', () => {
  it('mounts and renders the seeded personal tasks (happy-path smoke)', async () => {
    installPersonalTasksBackend([
      makeTask({ id: 1, title: 'Buy milk' }),
      makeTask({ id: 2, title: 'Walk the dog' }),
    ]);

    renderPage(<PersonalTasksPage />, { route: '/personal-tasks', path: '/personal-tasks' });

    expect(await screen.findByText('Buy milk')).toBeInTheDocument();
    expect(screen.getByText('Walk the dog')).toBeInTheDocument();
  });

  it('creates a task: opens the dialog, sends the correct POST payload, list refreshes', async () => {
    const { createBodies } = installPersonalTasksBackend([]);

    const { user } = renderPage(<PersonalTasksPage />, {
      route: '/personal-tasks',
      path: '/personal-tasks',
    });
    // Empty-state copy confirms the page settled before we act.
    await screen.findByText(/No tasks yet/i);

    await user.click(screen.getByRole('button', { name: /New Task/i }));

    const dialog = await screen.findByRole('dialog');
    const titleInput = within(dialog).getByPlaceholderText(/What needs to be done/i);
    await user.type(titleInput, 'Write tests');
    await user.click(within(dialog).getByRole('button', { name: /Create Task/i }));

    await waitFor(() => expect(createBodies).toHaveLength(1));
    expect(createBodies[0]).toMatchObject({ title: 'Write tests', priority: 'medium' });
    // No project selected → no convert step, so exactly one POST fired.
    expect(toastSuccessMock).toHaveBeenCalledWith('Task created!');
    // Cache invalidation refetched the list and the new task now shows.
    expect(await screen.findByText('Write tests')).toBeInTheDocument();
  });

  it('toggles a task complete: sends status=done and optimistically updates the cache', async () => {
    const { putBodies } = installPersonalTasksBackend([
      makeTask({ id: 5, title: 'Ship it', status: 'pending' }),
    ]);

    const { user, queryClient } = renderPage(<PersonalTasksPage />, {
      route: '/personal-tasks',
      path: '/personal-tasks',
    });
    await screen.findByText('Ship it');

    await user.click(screen.getByRole('button', { name: /Mark as complete/i }));

    // Optimistic cache write flips status to 'done' immediately.
    await waitFor(() => {
      const cached = queryClient.getQueryData<PersonalTaskResponse[]>(['personalTasks']);
      expect(cached?.find((t) => t.id === 5)?.status).toBe('done');
    });

    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0]).toMatchObject({ id: '5', body: { status: 'done' } });
    expect(toastSuccessMock).toHaveBeenCalledWith('Task completed! 🎉');
  });
});
