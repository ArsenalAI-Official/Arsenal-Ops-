/**
 * Typed API client for the dev Review-and-Submit timesheet endpoints.
 *
 * Backend:
 *   GET  /api/developers/me/timesheet         → MyTimesheetResponse
 *   POST /api/developers/me/timesheet/submit  → SubmitTimesheetResponse
 *
 * The response types are generated from the backend's OpenAPI schema
 * (see app/CLAUDE.md "API types"). Run `npm run gen:api` after any
 * backend schema change to keep them in sync.
 */
import type { MyTimesheetResponse, SubmitTimesheetResponse } from '@/client';
import { apiFetch } from '@/lib/api';

/** Fetch the current developer's Mon-Fri timesheet, grouped by QB client → project. */
export function fetchMyTimesheet(): Promise<MyTimesheetResponse> {
  return apiFetch<MyTimesheetResponse>('/api/developers/me/timesheet');
}

/**
 * Submit the developer's eligible entries inline and sync them to QuickBooks.
 *
 * Per-entry failures come back in `response.failed[]` — they are NOT thrown.
 * Operational failures (no QB connection / 503, in-flight sync / 409, no
 * Developer / 404) come back as a thrown ApiError from apiFetch.
 */
export function submitMyTimesheet(): Promise<SubmitTimesheetResponse> {
  return apiFetch<SubmitTimesheetResponse>('/api/developers/me/timesheet/submit', {
    method: 'POST',
  });
}

export interface EditTimesheetEntryBody {
  hours?: number;
  description?: string | null;
}

/**
 * Edit a draft time entry. Locked entries (submitted or already synced)
 * return 403 from the backend — surfaced as ApiError(.status=403).
 */
export function editMyTimesheetEntry(entryId: number, body: EditTimesheetEntryBody): Promise<void> {
  return apiFetch(`/api/developers/me/timesheet/entries/${entryId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/**
 * Delete a draft time entry. Same lock rules as edit. Returns 204 from
 * the backend, which apiFetch normalizes to `undefined`.
 */
export function deleteMyTimesheetEntry(entryId: number): Promise<void> {
  return apiFetch(`/api/developers/me/timesheet/entries/${entryId}`, {
    method: 'DELETE',
  });
}

/**
 * Set the billable flag for a (client, day) group of the current developer's
 * draft entries — the Review modal's per-client "Billable" checkbox. Only
 * that day's draft entries for the client are affected. Returns 204
 * (normalized to undefined); submitted/synced entries are left as-is.
 */
export function setMyTimesheetBillable(body: {
  qbCustomerId: string;
  loggedAt: string;
  billable: boolean;
}): Promise<void> {
  return apiFetch('/api/developers/me/timesheet/billable', {
    method: 'PATCH',
    body: JSON.stringify({
      qb_customer_id: body.qbCustomerId,
      logged_at: body.loggedAt,
      billable: body.billable,
    }),
  });
}

export interface AddTimesheetEntryBody {
  /** Work item / ticket id the entry belongs to. */
  workItemId: number;
  /** Hours (1-24, integer; matches the log-hours endpoint's sanity cap). */
  hours: number;
  /** Free-text note. Optional. */
  description?: string | null;
  /** ISO date (YYYY-MM-DD) of the weekday to book this entry on. Must
   *  fall within the current Mon-Fri review window — the backend
   *  rejects out-of-window or future dates with a 400. */
  loggedAt: string;
}

/**
 * Add a new time entry for a ticket on a specific day of the current
 * week. Reuses the existing `POST /api/workitems/{id}/log-hours`
 * endpoint with the new optional `logged_at` field, so the work item's
 * `logged_hours` recompute and auto-comment side effects all happen
 * the same way as a regular Log Hours click.
 */
export function addMyTimesheetEntry({
  workItemId,
  hours,
  description,
  loggedAt,
}: AddTimesheetEntryBody): Promise<unknown> {
  return apiFetch(`/api/workitems/${workItemId}/log-hours`, {
    method: 'POST',
    body: JSON.stringify({
      hours,
      description: description ?? null,
      logged_at: loggedAt,
    }),
  });
}
