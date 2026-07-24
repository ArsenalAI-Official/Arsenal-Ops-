import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CalendarStatusResponse, CalendarSyncResponse } from '@/client';
import { apiFetch } from '@/lib/api';
import { ADMIN_REFETCH } from './adminRefetch';

/**
 * Owns the Google Calendar integration card in the Integrations tab.
 *
 * Unlike QuickBooks there's no connect/disconnect: calendar access is a
 * domain-wide-delegation service account configured once via server env, so
 * this hook only exposes status (configured + a live snapshot) and a manual
 * "Sync now".
 *
 * The sync runs as a FastAPI BackgroundTask and emails the clicker the counts
 * when it finishes — the mutation just gets `started` / `already_running` /
 * `not_configured` back. We invalidate the status query a few seconds later so
 * the card's event count refreshes without a manual reload (mirrors
 * `useWorkforceAdmin`; polling for completion is out of scope).
 */
export function useCalendarSync() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery<CalendarStatusResponse>({
    queryKey: ['admin', 'calendarStatus'],
    queryFn: () => apiFetch<CalendarStatusResponse>('/api/admin/calendar/status'),
    ...ADMIN_REFETCH,
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      apiFetch<CalendarSyncResponse>('/api/admin/calendar/sync', { method: 'POST' }),
    onSuccess: (result) => {
      if (result.status === 'already_running') {
        toast.info('A calendar sync is already running. The email will arrive when it finishes.');
        return;
      }
      if (result.status === 'not_configured') {
        toast.error(result.message);
        return;
      }

      const inbox = result.notify_email;
      toast.success(
        inbox
          ? `Calendar sync started. You'll get an email at ${inbox} when it finishes.`
          : "Calendar sync started. You'll get an email when it finishes.",
      );

      // The background task runs in the same worker; refresh the snapshot a
      // few seconds later so the event count reflects the new state.
      window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'calendarStatus'] });
      }, 5000);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Calendar sync failed.'),
  });

  return { statusQuery, syncMutation };
}
