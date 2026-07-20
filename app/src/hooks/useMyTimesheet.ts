/**
 * React Query hooks for the dev Review-and-Submit timesheet flow.
 *
 * - useMyTimesheetQuery: GET the current week's grouped entries. Suspends
 *   the modal's Review view; refetched after Submit so the new "Synced"
 *   badges show up immediately.
 * - useSubmitTimesheetMutation: POST the inline submit. Invalidates the
 *   timesheet query and the home-page capacity card on success so both
 *   reflect the new sync state.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addMyTimesheetEntry,
  deleteMyTimesheetEntry,
  editMyTimesheetEntry,
  fetchMyTimesheet,
  setMyTimesheetBillable,
  submitMyTimesheet,
  type AddTimesheetEntryBody,
  type EditTimesheetEntryBody,
} from '@/api/timesheet';
import type { MyTimesheetResponse, SubmitTimesheetResponse } from '@/client';
import { invalidateWorkItemScope } from '@/lib/invalidations';

const MY_TIMESHEET_KEY = ['myTimesheet'] as const;

export function useMyTimesheetQuery(enabled = true) {
  return useQuery<MyTimesheetResponse>({
    queryKey: MY_TIMESHEET_KEY,
    queryFn: fetchMyTimesheet,
    enabled,
    // The page already has fresh data when the user opens the modal; a
    // background refetch on the modal opening every time would flash
    // the loading state. Keep it cached for the modal session.
    staleTime: 30_000,
  });
}

export function useSubmitTimesheetMutation() {
  const queryClient = useQueryClient();

  return useMutation<SubmitTimesheetResponse>({
    mutationFn: submitMyTimesheet,
    // No optimistic update — the backend computes the success/failure
    // partition server-side, and showing entries as "Submitted" before
    // we know which ones the QB POST rejected would be misleading.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_TIMESHEET_KEY });
      // Capacity card on the home page reads the same time entries —
      // invalidate it so the "Synced" badge surfaces right away.
      queryClient.invalidateQueries({ queryKey: ['myCapacity'] });
    },
  });
}

/**
 * Invalidate every query that reads from `time_entries` or
 * `work_items.logged_hours`. Centralized so an edit and a delete are
 * guaranteed to refresh the same surfaces — drift between the Review
 * modal, the home capacity card, board cells, and the work-item detail
 * panel is the bug class this protects against (per CLAUDE.md's
 * cross-cutting invalidation rule).
 *
 * Reuses `invalidateWorkItemScope` (`@/lib/invalidations`) which is the
 * canonical "anything that touches work-item-derived hours" helper —
 * it hits both `['workItems']` (plural, board+hub lists) AND
 * `['workItem']` (singular prefix, single-item detail/comments panels)
 * along with `myTasks`, project overview, hub analytics, and admin
 * stats / developer-capacity. So an edit here refreshes the ticket
 * detail panel's logged-hours readout as well as the board cells.
 *
 * Note: we don't have the project id here (the entry's work item knows
 * it, but we'd need an extra round-trip to look it up). The helper
 * still does the project-scoped invalidations safely with `undefined`
 * — they no-op for project-id-keyed queries but still hit the prefix-
 * keyed ones we care about.
 */
function invalidateTimeEntryDerivedCaches(queryClient: ReturnType<typeof useQueryClient>) {
  // Surface specific to this feature — the Review modal + home capacity card.
  queryClient.invalidateQueries({ queryKey: MY_TIMESHEET_KEY });
  queryClient.invalidateQueries({ queryKey: ['myCapacity'] });
  // Work-item-derived hours everywhere else: board lists, single-item
  // detail/comments, myTasks, project overview, hub analytics, admin
  // stats / developer-capacity. See `invalidations.ts` for the exact set.
  invalidateWorkItemScope(queryClient, undefined);
  // Admin Time Entries grid reads time_entries directly — not covered
  // by the work-item scope helper.
  queryClient.invalidateQueries({ queryKey: ['admin', 'time-entries'] });
}

export function useEditTimesheetEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { entryId: number; body: EditTimesheetEntryBody }>({
    mutationFn: ({ entryId, body }) => editMyTimesheetEntry(entryId, body),
    onSuccess: () => invalidateTimeEntryDerivedCaches(queryClient),
  });
}

export function useDeleteTimesheetEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (entryId) => deleteMyTimesheetEntry(entryId),
    onSuccess: () => invalidateTimeEntryDerivedCaches(queryClient),
  });
}

export function useSetTimesheetBillableMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { qbCustomerId: string; loggedAt: string; billable: boolean }>({
    mutationFn: (body) => setMyTimesheetBillable(body),
    onSuccess: () => invalidateTimeEntryDerivedCaches(queryClient),
  });
}

export function useAddTimesheetEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, AddTimesheetEntryBody>({
    mutationFn: (body) => addMyTimesheetEntry(body),
    // Adding fires the same hour-derived invalidations as edit/delete —
    // the new entry shows up in the Review modal, capacity card, board
    // logged-hours bar, ticket detail panel, and admin grids without a
    // page refresh.
    onSuccess: () => invalidateTimeEntryDerivedCaches(queryClient),
  });
}
