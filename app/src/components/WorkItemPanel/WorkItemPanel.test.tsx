// WorkItemPanel (compact variant) integration tests. The panel is driven at the
// wire by MSW: the per-item detail + comments + developers reads are served with
// per-test handlers (the default handler set doesn't cover
// GET /api/workitems/:id — it's a detail read, distinct from the board list — so
// we register it here). The compact variant owns its own edit/status mutations
// (useWorkItemPanel), so a field edit fires PUT /api/workitems/:id whose body we
// capture and assert. Auth comes from the global hoisted mock (admin, all caps),
// so the write affordance (Edit) renders.
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { WorkItemDetailResponse } from '@/client';
import { API_BASE } from '@/mocks/handlers/constants';
import { server } from '@/mocks/node';
import { renderWithRouter } from '@/test-utils/render';
import type { WorkItem } from '@/types/workItems';
import WorkItemPanel from './WorkItemPanel';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
  Toaster: () => null,
}));

// A minimal but complete WorkItem view-model. Non-null hours + narrowed unions
// per the canonical shape (@/types/workItems).
function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: '42',
    key: 'TP-42',
    type: 'task',
    title: 'Original title',
    description: 'Original description',
    status: 'todo',
    assigned_hours: 8,
    remaining_hours: 8,
    logged_hours: 0,
    story_points: 3,
    priority: 'medium',
    assignee: 'Ada Lovelace',
    assignee_id: 7,
    sprint: '',
    sprint_id: null,
    product_id: '',
    project_id: 1,
    tags: [],
    epic: '',
    ...overrides,
  };
}

// The detail endpoint returns raw columns; applyWorkItemDetail overlays them.
// Keep the description consistent with the base item so view-mode text is stable.
function detailFor(item: WorkItem): WorkItemDetailResponse {
  // A real, complete WorkItemDetailResponse (all required wire fields present):
  // a backend detail-shape change now breaks this fixture at compile time,
  // rather than being papered over by an `as unknown as` cast.
  return {
    id: Number(item.id),
    key: item.key,
    title: item.title,
    description: item.description,
    type: item.type,
    status: item.status,
    priority: item.priority,
    project_id: item.project_id ?? 0,
    story_points: item.story_points,
    estimated_hours: item.assigned_hours,
    logged_hours: item.logged_hours,
    remaining_hours: item.remaining_hours,
    assignee_id: item.assignee_id,
    due_date: null,
    tags: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

/** Register the reads the compact panel makes on mount. */
function stubPanelReads(item: WorkItem) {
  server.use(
    http.get(`${API_BASE}/workitems/${item.id}`, () => HttpResponse.json(detailFor(item))),
    http.get(`${API_BASE}/comments/workitem/${item.id}`, () => HttpResponse.json([])),
    http.get(`${API_BASE}/developers/`, () => HttpResponse.json([])),
    // startEditing() fetches project devs for the assignee dropdown.
    http.get(`${API_BASE}/projects/:projectId`, () => HttpResponse.json({ developers: [] })),
  );
}

function renderCompact(item: WorkItem) {
  return renderWithRouter(
    <WorkItemPanel
      variant="compact"
      item={item}
      token="test-token"
      currentUserId={7}
      onClose={() => {}}
      onItemChanged={() => {}}
      onOpenInBoard={() => {}}
    />,
  );
}

describe('WorkItemPanel (compact)', () => {
  it('renders the work item title, key and description', async () => {
    const item = makeItem();
    stubPanelReads(item);
    renderCompact(item);

    expect(await screen.findByText('Original title')).toBeInTheDocument();
    expect(screen.getByText('TP-42')).toBeInTheDocument();
    expect(screen.getByText('Original description')).toBeInTheDocument();
  });

  it('persists the correct PUT payload when a field edit is saved', async () => {
    const item = makeItem();
    stubPanelReads(item);

    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`${API_BASE}/workitems/${item.id}`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...item, title: capturedBody.title });
      }),
    );

    const { user } = renderCompact(item);
    await screen.findByText('Original title');

    // Enter edit mode via the footer Edit button (compact variant).
    await user.click(screen.getByRole('button', { name: /^Edit$/i }));

    // Edit the title, then save.
    const titleInput = await screen.findByDisplayValue('Original title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Renamed title');
    await user.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody).toMatchObject({ title: 'Renamed title' });
    // The whole edited item is sent (the mutation PUTs `editForm`, seeded from
    // the item detail), so the description is preserved in the payload.
    expect(capturedBody).toMatchObject({ description: 'Original description' });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Task updated'));
  });

  it('surfaces an error toast when the edit save fails', async () => {
    const item = makeItem();
    stubPanelReads(item);
    server.use(
      http.put(`${API_BASE}/workitems/${item.id}`, () =>
        HttpResponse.json({ detail: 'Validation failed' }, { status: 400 }),
      ),
    );

    const { user } = renderCompact(item);
    await screen.findByText('Original title');

    await user.click(screen.getByRole('button', { name: /^Edit$/i }));
    const titleInput = await screen.findByDisplayValue('Original title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Broken');
    await user.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastSuccessMock).not.toHaveBeenCalledWith('Task updated');
  });
});
