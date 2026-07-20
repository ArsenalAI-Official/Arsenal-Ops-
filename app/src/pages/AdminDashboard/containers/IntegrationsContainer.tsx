import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useRefreshWorkforceClients, useWorkforceAdmin } from '../hooks/useWorkforceAdmin';
import IntegrationsTab from '../tabs/IntegrationsTab';

// Maps the `?workforce=...` query params the OAuth callback redirects back
// with to toasts. Kept in this container so the URL is consumed in one place
// and the param is cleared after surfacing — refreshing the page doesn't
// re-trigger the toast.
function useOAuthCallbackToasts(): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const status = searchParams.get('workforce');
    if (!status) return;
    handled.current = true;

    const warn = searchParams.get('warn');
    const reason = searchParams.get('reason');
    if (status === 'connected') {
      if (warn === 'service_item_missing') {
        toast.warning(
          "QuickBooks connected, but the 'Hours' service item wasn't found. Create it in QB and re-run sync.",
        );
      } else if (warn === 'service_item_lookup_failed') {
        toast.warning(
          "QuickBooks connected, but we couldn't look up the 'Hours' service item. Try Sync Now to retry.",
        );
      } else {
        toast.success('QuickBooks connected.');
      }
    } else if (status === 'denied') {
      toast.error(`Connection cancelled: ${reason ?? 'access denied'}`);
    } else if (status === 'error') {
      toast.error(`Connection failed: ${reason ?? 'unknown error'}`);
    }

    // Strip the workforce-related params so a manual refresh / back-button
    // doesn't fire the toast again. Preserve any other query params.
    const next = new URLSearchParams(searchParams);
    next.delete('workforce');
    next.delete('warn');
    next.delete('reason');
    next.delete('detail');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}

export default function IntegrationsContainer() {
  const { confirm, confirmDialog } = useConfirm();
  const { statusQuery, connectMutation, disconnectMutation, syncMutation } = useWorkforceAdmin();
  const refreshClientsMutation = useRefreshWorkforceClients();

  useOAuthCallbackToasts();

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: 'Disconnect QuickBooks?',
      description:
        "This revokes Arsenal Ops' access at Intuit and stops future syncs. Per-project client tags are preserved so reconnecting later restores them.",
      confirmText: 'Disconnect',
      destructive: true,
    });
    if (!ok) return;
    disconnectMutation.mutate();
  };

  // Force-sync gates behind a confirm: with dev Submit & Sync as the
  // primary path, this button is a safety net for stragglers and a
  // careless click would push hours devs haven't reviewed yet.
  const handleForceSync = async () => {
    const ok = await confirm({
      title: 'Force-sync unsubmitted hours?',
      description:
        "This pushes Mon–Fri hours that developers haven't submitted yet through the Review & Submit modal. Use only as a fallback (e.g., a dev is on vacation and you need to close out the week). Devs no longer need to submit anything for the entries this push covers.",
      confirmText: 'Force-sync',
    });
    if (!ok) return;
    syncMutation.mutate();
  };

  const status = statusQuery.data;
  const integration = status?.integration ?? null;

  return (
    <>
      <IntegrationsTab
        loading={statusQuery.isLoading}
        connected={status?.connected ?? false}
        integration={integration}
        isConnecting={connectMutation.isPending}
        isDisconnecting={disconnectMutation.isPending}
        isSyncing={syncMutation.isPending}
        isRefreshingClients={refreshClientsMutation.isPending}
        onConnect={() => connectMutation.mutate()}
        onDisconnect={handleDisconnect}
        onSync={handleForceSync}
        onRefreshClients={() => refreshClientsMutation.mutate()}
      />
      {confirmDialog}
    </>
  );
}
