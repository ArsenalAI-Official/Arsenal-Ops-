import { CheckCircle2, AlertTriangle, RefreshCw, Plug, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkforceIntegrationSafe } from '../types';

interface IntegrationsTabProps {
  loading: boolean;
  connected: boolean;
  integration: WorkforceIntegrationSafe | null;
  isConnecting: boolean;
  isDisconnecting: boolean;
  isSyncing: boolean;
  isRefreshingClients: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  onRefreshClients: () => void;
}

// Display timestamps in US Eastern time — the Arsenal team operates
// against an EST schedule (HR/finance live in NYC), so showing EST/EDT
// here rather than the viewer's local TZ matches the rest of the
// reporting surface. `timeZoneName: 'short'` appends "EST"/"EDT" so the
// daylight-savings flip is unambiguous to the reader.
const ISO_DATE_FMT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/New_York',
  timeZoneName: 'short',
};

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', ISO_DATE_FMT);
  } catch {
    return iso;
  }
}

// Visual treatment per `last_sync_status`. The Workforce sync uses these
// strings literally so we don't add a mapping layer; instead we match
// here and fall through to a generic look for anything we don't know
// about (forward-compat with new states added server-side).
function statusBadge(status: string | null): {
  label: string;
  className: string;
  icon: typeof CheckCircle2;
} {
  switch (status) {
    case 'ok':
      return {
        label: 'Healthy',
        className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        icon: CheckCircle2,
      };
    case 'partial':
      return {
        label: 'Partial',
        className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        icon: AlertTriangle,
      };
    case 'no_eligible':
      return {
        label: 'No entries',
        className: 'bg-[rgba(255,255,255,0.04)] text-[#737373] border-[rgba(255,255,255,0.08)]',
        icon: CheckCircle2,
      };
    case 'locked':
      return {
        label: 'In progress',
        className: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
        icon: RefreshCw,
      };
    case 'error':
      return {
        label: 'Error',
        className: 'bg-red-500/10 text-red-400 border-red-500/20',
        icon: AlertTriangle,
      };
    case null:
    case undefined:
      return {
        label: 'Not yet run',
        className: 'bg-[rgba(255,255,255,0.04)] text-[#737373] border-[rgba(255,255,255,0.08)]',
        icon: RefreshCw,
      };
    default:
      return {
        label: status,
        className: 'bg-[rgba(255,255,255,0.04)] text-[#737373] border-[rgba(255,255,255,0.08)]',
        icon: AlertTriangle,
      };
  }
}

const IntegrationsTab: React.FC<IntegrationsTabProps> = ({
  loading,
  connected,
  integration,
  isConnecting,
  isDisconnecting,
  isSyncing,
  isRefreshingClients,
  onConnect,
  onDisconnect,
  onSync,
  onRefreshClients,
}) => {
  if (loading) {
    return <div className="text-sm text-[#737373]">Loading integration status…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Integrations</h2>
        <p className="mt-1 text-sm text-[#737373]">
          Connect external services. Each integration's connection state and credentials are managed
          here for the whole org, not per-user.
        </p>
      </div>

      {/* ─── QuickBooks / Workforce card ───────────────────────────── */}
      <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.05)] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[rgba(46,191,140,0.1)] border border-[rgba(46,191,140,0.2)] flex items-center justify-center">
              {connected ? (
                <PlugZap className="w-5 h-5 text-emerald-400" />
              ) : (
                <Plug className="w-5 h-5 text-[#737373]" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">QuickBooks Time</h3>
              <p className="text-xs text-[#737373] mt-0.5">
                Sync logged hours to QuickBooks under each project's tagged client.
              </p>
            </div>
          </div>
          <ConnectionPill connected={connected} />
        </div>

        <div className="px-5 py-4 space-y-4">
          {connected && integration ? (
            <>
              <DetailGrid integration={integration} />

              <div className="flex items-center gap-2 pt-2 flex-wrap">
                <Button
                  onClick={onSync}
                  disabled={isSyncing}
                  className="bg-[#E0B954] hover:bg-[#E0B954]/90 text-black"
                  title="Push Mon–Fri hours that devs haven't submitted yet via Review & Submit. Use only as a fallback."
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing…' : 'Force-Sync Unsubmitted Hours'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={onRefreshClients}
                  disabled={isRefreshingClients}
                  className="text-[#737373] hover:text-black"
                  title="Pull the latest QuickBooks customer list into the project picker"
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-2 ${isRefreshingClients ? 'animate-spin' : ''}`}
                  />
                  {isRefreshingClients ? 'Refreshing…' : 'Refresh clients'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={onDisconnect}
                  disabled={isDisconnecting}
                  className="text-[#737373] hover:text-red-400"
                >
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[#737373]">
                Not connected. Connecting opens an Intuit consent page in this window — your admin
                needs to sign in to QuickBooks and approve Arsenal Ops' access. Tokens are stored
                encrypted on the server.
              </p>
              <Button
                onClick={onConnect}
                disabled={isConnecting}
                className="bg-[#E0B954] hover:bg-[#E0B954]/90 text-black"
              >
                {isConnecting ? 'Redirecting…' : 'Connect QuickBooks'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function ConnectionPill({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 className="w-3 h-3" />
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-[rgba(255,255,255,0.04)] text-[#737373] border border-[rgba(255,255,255,0.08)]">
      Not connected
    </span>
  );
}

function DetailGrid({ integration }: { integration: WorkforceIntegrationSafe }) {
  const badge = statusBadge(integration.last_sync_status);
  const Icon = badge.icon;
  // Prefer the friendly Company name; fall back to the realm id only
  // if the name couldn't be resolved (e.g., a CompanyInfo API failure
  // mid-Connect). The realm id is opaque to non-engineers, so show it
  // only as a last resort.
  const companyLabel = integration.company_name ?? `Realm ${integration.realm_id}`;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
      <Field label="QuickBooks Company" value={companyLabel} />
      <Field
        label="Service Item"
        value={integration.service_item_name ?? '— not set —'}
        warning={!integration.service_item_id}
      />
      <Field label="Connected" value={formatTimestamp(integration.connected_at)} />
      <Field
        label="Last Sync"
        value={integration.last_sync_at ? formatTimestamp(integration.last_sync_at) : 'Never'}
      />
      <div className="md:col-span-2 flex items-center gap-3 mt-2">
        <span
          className={
            'inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ' +
            badge.className
          }
        >
          <Icon className="w-3 h-3" />
          {badge.label}
        </span>
        <span className="text-xs text-[#737373]">
          {integration.last_synced_count} synced
          {integration.last_failed_count > 0 ? ` • ${integration.last_failed_count} failed` : ''}
        </span>
      </div>
      {integration.last_sync_error && (
        <div className="md:col-span-2 mt-1 px-3 py-2 rounded-md bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
          <div className="text-[11px] uppercase tracking-wide text-[#737373] mb-1">
            Last sync notes
          </div>
          <div className="text-xs text-[#a3a3a3] whitespace-pre-wrap break-words">
            {integration.last_sync_error}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#737373] mb-0.5">{label}</div>
      <div className={`text-sm ${warning ? 'text-amber-400' : 'text-white'}`}>{value}</div>
    </div>
  );
}

export default IntegrationsTab;
