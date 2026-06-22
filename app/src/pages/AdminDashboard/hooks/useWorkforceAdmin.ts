import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import type { WorkforceClient, WorkforceStatus } from '../types';
import { ADMIN_REFETCH } from './adminRefetch';

/**
 * Shape of POST /api/admin/workforce/sync — the endpoint kicks the actual
 * run off as a FastAPI BackgroundTask and returns 200 immediately. Two
 * possible states:
 *
 *  - "started"          → a new background task is now running; an email
 *                         will follow with the counts when it finishes.
 *  - "already_running"  → another sync was already in progress (the
 *                         admin double-clicked, OR the Saturday cron is
 *                         mid-run). No new task scheduled, no extra email
 *                         — the running sync will email its own trigger
 *                         when it completes.
 */
interface ManualSyncResponse {
  status: 'started' | 'already_running';
  message: string;
  notify_email: string | null;
}

/**
 * Owns the Integrations tab domain: connect/disconnect, status polling,
 * client list (for the per-project picker), and manual sync. Tokens never
 * touch the client — the status endpoint returns redacted metadata via
 * `WorkforceIntegration.to_safe_dict()`.
 *
 * Mutation flow notes:
 *  - Connect doesn't return JSON to the page; the backend returns an
 *    `authorize_url` and the page navigates the browser there. Disconnect /
 *    sync return their results inline and we surface counts via toast.
 *  - Clients are fetched on-demand by the project picker (see
 *    `useWorkforceClients`) because they pull live data from QB and are
 *    not needed when the Integrations tab is just being viewed.
 */
export function useWorkforceAdmin() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery<WorkforceStatus>({
    queryKey: ['admin', 'workforceStatus'],
    queryFn: () => apiFetch<WorkforceStatus>('/api/admin/workforce/status'),
    ...ADMIN_REFETCH,
  });

  // POST /connect returns the Intuit authorize URL — we navigate the browser
  // there. The mutation isn't optimistic; we wait for the URL before redirecting
  // so a 503 from the backend (missing env / crypto) shows the actual reason
  // instead of dropping the admin on an Intuit error page.
  const connectMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ authorize_url: string }>('/api/admin/workforce/connect', {
        method: 'POST',
      }),
    onSuccess: (data) => {
      // Full-page nav (not new tab) — Intuit's flow expects the same
      // browser window so the state cookie and the user session stay aligned.
      window.location.href = data.authorize_url;
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : 'Could not start the QuickBooks connect flow.',
      ),
  });

  const disconnectMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ disconnected: boolean }>('/api/admin/workforce/disconnect', {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('QuickBooks disconnected.');
      queryClient.invalidateQueries({ queryKey: ['admin', 'workforceStatus'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'workforceClients'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Disconnect failed.'),
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      apiFetch<ManualSyncResponse>('/api/admin/workforce/sync', {
        method: 'POST',
      }),
    onSuccess: (result) => {
      // The sync runs as a FastAPI BackgroundTask after the response is
      // sent — a busy week can take minutes and holding the browser open
      // that long is poor UX. The clicker gets the actual counts + status
      // by email; the Integrations card refreshes its `last_sync_*` fields
      // once the run finishes (status query is invalidated below so the
      // card eventually reflects the new state without a manual refresh).
      if (result.status === 'already_running') {
        // The admin double-clicked, or the Saturday cron is mid-run. No
        // duplicate run scheduled, no extra email — just inform the user.
        toast.info('A sync is already running. The email will arrive when it finishes.');
        return;
      }

      const inbox = result.notify_email;
      toast.success(
        inbox
          ? `Sync started. You'll get an email at ${inbox} when it finishes.`
          : "Sync started. You'll get an email when it finishes.",
      );

      // The background task is in the same worker process; invalidate the
      // status query a short delay later so the card picks up the new
      // last_sync_* fields without a manual refresh. Sync times vary from
      // seconds (no eligible) to minutes (full week); polling for completion
      // is out of scope for this PR.
      window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'workforceStatus'] });
      }, 5000);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Sync failed.'),
  });

  return {
    statusQuery,
    connectMutation,
    disconnectMutation,
    syncMutation,
  };
}

/**
 * Lazy QB customer list — pulled on demand by the project-link picker.
 * Kept separate from `useWorkforceAdmin` so the Integrations tab doesn't
 * fetch it just by mounting (the list is potentially large).
 */
export function useWorkforceClients(enabled: boolean) {
  return useQuery<WorkforceClient[]>({
    queryKey: ['admin', 'workforceClients'],
    queryFn: () => apiFetch<WorkforceClient[]>('/api/admin/workforce/clients'),
    enabled,
    // Customers don't change often; a longer staleTime avoids refetching
    // every time the picker opens.
    staleTime: 5 * 60 * 1000,
  });
}

interface WorkforceClientsRefreshResult {
  added: number;
  updated: number;
  deactivated: number;
  total_active: number;
  last_refreshed_at: string | null;
}

/**
 * Force-refresh the cached QuickBooks client list from Intuit. The
 * picker reads from the local cache (`useWorkforceClients`); this
 * mutation repopulates that cache so newly-added QB customers show up
 * without waiting for the Saturday cron.
 *
 * Invalidates the picker query on success so the new list is fetched
 * immediately.
 */
export function useRefreshWorkforceClients() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<WorkforceClientsRefreshResult>('/api/admin/workforce/clients/refresh', {
        method: 'POST',
      }),
    onSuccess: (result) => {
      const { added, updated, deactivated, total_active } = result;
      // Show the delta if anything changed, otherwise a quiet
      // "still up to date" so the admin knows the click did something.
      const changed = added + updated + deactivated > 0;
      if (changed) {
        toast.success(
          `Refreshed: ${added} new, ${updated} updated, ${deactivated} deactivated. ${total_active} active.`,
        );
      } else {
        toast.info(`Client list is up to date (${total_active} active).`);
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'workforceClients'] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not refresh client list.'),
  });
}

export function useSetProjectWorkforceClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      clientId,
      clientName,
    }: {
      projectId: number;
      clientId: string | null;
      clientName: string | null;
    }) =>
      apiFetch(`/api/admin/workforce/projects/${projectId}/client`, {
        method: 'PUT',
        body: JSON.stringify({
          workforce_client_id: clientId,
          workforce_client_name: clientName,
        }),
      }),
    onSuccess: () => {
      // Project cards in the admin Projects tab and the home/project
      // surfaces both read from these keys — keep them in sync.
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not update QuickBooks client.'),
  });
}
