// MyTasksBox + useMyTasks integration. Proves the shared-cache contract from
// app/CLAUDE.md: the home widget reads from ['myTasks'], and a work-item status
// change routed through the widget must invalidate BOTH ['workItems'] and
// ['myTasks'] (they're two views of the same server data via different
// endpoints). MyTasksBox itself is presentational (data + callbacks via props),
// so we mount it behind a tiny harness that supplies the REAL useMyTasks hook —
// exactly how ProjectsPage wires it — and drive the StatusDotMenu.
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { MyTaskResponse } from '@/client';
import { useMyTasks } from '@/pages/ProjectsPage/hooks/useMyTasks';
import { API_BASE } from '@/mocks/handlers/constants';
import { server } from '@/mocks/node';
import { renderWithRouter } from '@/test-utils/render';
import MyTasksBox from './index';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
  Toaster: () => null,
}));

function seedMyTask(overrides: Partial<MyTaskResponse> = {}): MyTaskResponse {
  return {
    id: 'w1',
    key: 'AP-1',
    title: 'Wire up the launch sequence',
    type: 'task',
    status: 'todo',
    priority: 'high',
    assignee: 'Test User',
    is_overdue: false,
    project_id: 1,
    project_name: 'Apollo',
    due_date: null,
    completed_at: null,
    ...overrides,
  } as MyTaskResponse;
}

// Mirrors ProjectsPage's wiring: useMyTasks owns the ['myTasks'] query +
// mutations; MyTasksBox renders it and calls back into the hook's handlers.
function Harness() {
  const {
    myTasks,
    myTasksLoading,
    myTaskTab,
    setMyTaskTab,
    showAllTasks,
    setShowAllTasks,
    setSelectedTask,
    handleChangeMyTaskStatus,
    handleQuickDueDateChange,
  } = useMyTasks();

  return (
    <MyTasksBox
      myTasks={myTasks}
      personalTasks={[]}
      myTasksLoading={myTasksLoading}
      myTaskTab={myTaskTab}
      setMyTaskTab={setMyTaskTab}
      showAllTasks={showAllTasks}
      setShowAllTasks={setShowAllTasks}
      onSelectTask={setSelectedTask}
      onAddPersonalTaskClick={() => {}}
      onEditPersonalTask={() => {}}
      onConvertPersonalTask={() => {}}
      onDeletePersonalTask={() => {}}
      onTogglePersonalTaskComplete={() => {}}
      onNavigateToPersonalTasks={() => {}}
      onChangeTaskStatus={handleChangeMyTaskStatus}
      onQuickDueDateChange={handleQuickDueDateChange}
    />
  );
}

describe('MyTasksBox + useMyTasks', () => {
  it('renders assigned work items from the ["myTasks"] cache', async () => {
    server.use(
      http.get(`${API_BASE}/workitems/my-tasks`, () =>
        HttpResponse.json([seedMyTask({ title: 'Wire up the launch sequence' })]),
      ),
    );

    renderWithRouter(<Harness />);

    expect(await screen.findByText('Wire up the launch sequence')).toBeInTheDocument();
  });

  it('a status change PUTs to /workitems/:id and refetches ["myTasks"] (shared-cache contract)', async () => {
    let putBody: Record<string, unknown> | null = null;
    let myTasksFetchCount = 0;
    // Stateful backend: the my-tasks GET reflects the persisted status so the
    // post-mutation refetch (onSettled invalidation) doesn't clobber the change
    // back to 'todo' — proving the ['myTasks'] view converges on the new value.
    let persistedStatus = 'todo';
    server.use(
      http.get(`${API_BASE}/workitems/my-tasks`, () => {
        myTasksFetchCount += 1;
        return HttpResponse.json([seedMyTask({ id: 'w1', status: persistedStatus })]);
      }),
      http.put(`${API_BASE}/workitems/:id`, async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>;
        if (typeof putBody.status === 'string') persistedStatus = putBody.status;
        return HttpResponse.json({});
      }),
    );

    const { user, queryClient } = renderWithRouter(<Harness />);
    await screen.findByText('Wire up the launch sequence');

    const initialFetches = myTasksFetchCount;
    // Observe the cross-cutting invalidation: useMyTasks' status onSettled must
    // invalidate BOTH ['myTasks'] and ['workItems'] (app/CLAUDE.md shared-cache
    // rule). Nothing is cached under ['workItems'] in this harness, so spy on
    // the invalidation call itself — otherwise a regression dropping it is
    // silent. Spy AFTER the initial render so mount-time queries don't pollute.
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // Open the StatusDotMenu for the row and pick "In Progress". The popover
    // renders into a portal on document.body, so query the option globally.
    await user.click(screen.getByRole('button', { name: /Status: To Do\. Click to change\./i }));
    await screen.findByText('Set status');
    await user.click(await screen.findByRole('button', { name: /^In Progress$/i }));

    // The mutation PUT carries the new status.
    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody).toMatchObject({ status: 'in_progress' });

    // The ['myTasks'] cache converges on the new status (optimistic write +
    // the reconciling refetch both agree).
    await waitFor(() => {
      const cached = queryClient.getQueryData<MyTaskResponse[]>(['myTasks']);
      expect(cached?.find((t) => t.id === 'w1')?.status).toBe('in_progress');
    });

    // onSettled invalidates ['myTasks'] (triggering a refetch) AND ['workItems'].
    // The refetch is the observable proof the ['myTasks'] view stays in sync.
    await waitFor(() => expect(myTasksFetchCount).toBeGreaterThan(initialFetches));
    // ['workItems'] has nothing cached under it here, so assert the invalidation
    // was actually issued — this is the half a regression would silently drop.
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workItems'] }));
    // 'todo' and 'in_progress' both live under the "upcoming" tab, so the item
    // stays visible through the change + refetch.
    expect(screen.getByText('Wire up the launch sequence')).toBeInTheDocument();
  });
});
