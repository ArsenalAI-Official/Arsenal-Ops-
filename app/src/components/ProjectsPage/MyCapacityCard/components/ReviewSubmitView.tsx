import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileWarning,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  MyTimesheetResponse,
  SubmitTimesheetResponse,
  TimesheetEntryResponse,
} from '@/client';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  useAddTimesheetEntryMutation,
  useDeleteTimesheetEntryMutation,
  useEditTimesheetEntryMutation,
  useMyTimesheetQuery,
  useSetTimesheetBillableMutation,
  useSubmitTimesheetMutation,
} from '@/hooks/useMyTimesheet';
import { ApiError, apiFetch, permissionAwareError } from '@/lib/api';
import { MEETING_COLOR } from '../types';
import type { CapacityMeeting, MyCapacityResponse } from '../types';

interface ReviewSubmitViewProps {
  onBack: () => void;
  /** Notified whenever the QuickBooks submit/sync mutation is in flight.
   *  CapacityModal uses this to lock the dialog (block X, outside-click,
   *  and Escape) while the user is waiting on the QB POST. */
  onSyncingChange?: (syncing: boolean) => void;
  /** This week's synced calendar meetings (from the capacity payload), shown
   *  per day alongside logged hours for context. */
  meetings?: CapacityMeeting[];
}

// Date-only ISO ("YYYY-MM-DD") parses as UTC; rendering through toLocale*
// could shift back one local day. Force date-only by appending T00:00 in
// the user's local zone, matching what the backend's logged_at represents.
const parseDateOnly = (iso: string): Date => new Date(`${iso}T00:00:00`);

// Format a Date to a local "YYYY-MM-DD" (NOT toISOString, which converts to UTC
// and can shift the date by one in non-UTC zones). Day-card keys must match the
// backend's date-only `logged_at`, which has no timezone.
const toLocalISODate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const weekdayName = (iso: string): string =>
  parseDateOnly(iso).toLocaleDateString(undefined, { weekday: 'long' });

const dayDateLabel = (iso: string): string =>
  parseDateOnly(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// Compact day label for entry rows that aren't already grouped under a
// day card (the unlinked-projects section lists a project's whole-week
// entries together, so each row needs to say which day it was logged).
const shortDayLabel = (iso: string): string =>
  parseDateOnly(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

// ── Day grouping ─────────────────────────────────────────────────────────

interface DayClientGroup {
  qb_customer_id: string;
  client_name: string;
  subtotal_hours: number;
  projects: Array<{
    project_id: number;
    project_name: string;
    category_name: string | null;
    entries: TimesheetEntryResponse[];
  }>;
}

interface DayGroup {
  iso: string; // YYYY-MM-DD
  subtotal_hours: number;
  clients: DayClientGroup[];
}

/** Weekly per-client roll-up for the summary card above the day list. */
interface WeeklyClientTotal {
  qb_customer_id: string;
  client_name: string;
  hours: number;
}

/**
 * Transform the (client → project → entry) backend shape into a list of
 * Mon-Fri day groups, each carrying its own (client → project → entry)
 * tree filtered to that day. The original shape is preserved server-side
 * so unlinked entries and the submit endpoint don't need to change.
 *
 * All five weekdays appear even when empty, so a dev who forgot to log on
 * Wednesday sees an explicit gap rather than a missing card.
 */
const groupByDay = (data: MyTimesheetResponse): DayGroup[] => {
  // Pre-seed all five Mon-Fri ISO dates from week_start so empty days
  // still render. The backend's week_start is the Monday.
  const weekStart = parseDateOnly(data.week_start);
  const days: Map<string, DayGroup> = new Map();
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const iso = toLocalISODate(d);
    days.set(iso, { iso, subtotal_hours: 0, clients: [] });
  }

  for (const client of data.clients) {
    for (const project of client.projects) {
      for (const entry of project.entries) {
        if (!entry.logged_at) continue;
        const day = days.get(entry.logged_at);
        if (!day) continue; // Out-of-week — server already filters, defensive only.

        day.subtotal_hours += entry.hours;
        let clientBucket = day.clients.find((c) => c.qb_customer_id === client.qb_customer_id);
        if (!clientBucket) {
          clientBucket = {
            qb_customer_id: client.qb_customer_id,
            client_name: client.client_name,
            subtotal_hours: 0,
            projects: [],
          };
          day.clients.push(clientBucket);
        }
        clientBucket.subtotal_hours += entry.hours;
        let projectBucket = clientBucket.projects.find((p) => p.project_id === project.project_id);
        if (!projectBucket) {
          projectBucket = {
            project_id: project.project_id,
            project_name: project.project_name,
            category_name: project.category_name,
            entries: [],
          };
          clientBucket.projects.push(projectBucket);
        }
        projectBucket.entries.push(entry);
      }
    }
  }

  // QB-dark: nothing is linked to a QuickBooks customer, so the entries live in
  // `unlinked_projects`. Fold them into the day cards under a single client-less
  // sentinel group (rendered without QB chrome) so logged hours still show
  // per day. When QB is live these stay in their own "won't sync" banner.
  if (!isQuickBooksSubmitEnabled()) {
    for (const project of data.unlinked_projects) {
      for (const entry of project.entries) {
        if (!entry.logged_at) continue;
        const day = days.get(entry.logged_at);
        if (!day) continue;

        day.subtotal_hours += entry.hours;
        let clientBucket = day.clients.find((c) => c.qb_customer_id === UNLINKED_GROUP_ID);
        if (!clientBucket) {
          clientBucket = {
            qb_customer_id: UNLINKED_GROUP_ID,
            client_name: '',
            subtotal_hours: 0,
            projects: [],
          };
          day.clients.push(clientBucket);
        }
        clientBucket.subtotal_hours += entry.hours;
        let projectBucket = clientBucket.projects.find((p) => p.project_id === project.project_id);
        if (!projectBucket) {
          projectBucket = {
            project_id: project.project_id,
            project_name: project.project_name,
            category_name: project.category_name,
            entries: [],
          };
          clientBucket.projects.push(projectBucket);
        }
        projectBucket.entries.push(entry);
      }
    }
  }

  return Array.from(days.values());
};

// QuickBooks submit/sync is hidden until the QB integration is fully live.
// While disabled, this view is read-only ("Review Hours"). Set
// VITE_QUICKBOOKS_SUBMIT=true in the frontend build env to re-enable the
// Submit & Sync button (all the submit plumbing below is kept intact).
// Read at call time (not a module-load const) so tests can toggle it via
// vi.stubEnv; Vite still statically inlines the value in a production build.
const isQuickBooksSubmitEnabled = (): boolean => import.meta.env.VITE_QUICKBOOKS_SUBMIT === 'true';

// When QuickBooks is disabled, no project is linked to a QB customer, so every
// entry arrives in `unlinked_projects`. We fold those into the day cards under
// this sentinel group so the review view still works as a plain per-day
// timesheet — rendered WITHOUT the QuickBooks client chrome (see DayBlock).
const UNLINKED_GROUP_ID = '__no_client__';

const ReviewSubmitView = ({ onBack, onSyncingChange, meetings = [] }: ReviewSubmitViewProps) => {
  // Bucket this week's meetings by day (keyed on the date part of start_at,
  // matching the day-card ISO keys) so each DayBlock can show its meetings.
  const meetingsByDay = useMemo(() => {
    const map = new Map<string, CapacityMeeting[]>();
    for (const m of meetings) {
      const key = m.start_at?.slice(0, 10);
      if (!key) continue;
      const arr = map.get(key);
      if (arr) arr.push(m);
      else map.set(key, [m]);
    }
    return map;
  }, [meetings]);

  const timesheetQuery = useMyTimesheetQuery();
  const submitMutation = useSubmitTimesheetMutation();
  // Bubble the submit mutation's pending flag up to CapacityModal so it
  // can lock the dialog while QB is being POSTed to.
  const submitPending = submitMutation.isPending;
  useEffect(() => {
    onSyncingChange?.(submitPending);
    // On unmount, make sure the parent's lock is released even if the
    // mutation finished mid-teardown.
    return () => onSyncingChange?.(false);
  }, [submitPending, onSyncingChange]);
  const editMutation = useEditTimesheetEntryMutation();
  const deleteMutation = useDeleteTimesheetEntryMutation();
  const addMutation = useAddTimesheetEntryMutation();
  const billableMutation = useSetTimesheetBillableMutation();
  // Pull the dev's assignable tickets from the existing capacity endpoint.
  // The home card's MyCapacityCard already populates this cache, so it's
  // usually free (warm-cache hit) by the time the modal opens.
  const capacityQuery = useQuery<MyCapacityResponse>({
    queryKey: ['myCapacity'],
    queryFn: () => apiFetch<MyCapacityResponse>('/api/developers/me/capacity'),
    retry: false,
  });
  const assignableTickets = useMemo(() => capacityQuery.data?.tickets ?? [], [capacityQuery.data]);
  const { confirm, confirmDialog } = useConfirm();

  const handleEditEntry = (
    entryId: number,
    body: { hours?: number; description?: string | null },
  ) => editMutation.mutateAsync({ entryId, body });

  const handleAddEntry = (body: {
    workItemId: number;
    hours: number;
    description?: string | null;
    loggedAt: string;
  }) => addMutation.mutateAsync(body);

  // Toggle billable for a (client, day) group. The checkbox lives at the
  // client level inside each day card and only affects that day's draft
  // entries for the client. Errors surface as a toast — the cache refetch on
  // success keeps each row's `billable` in sync.
  const handleSetClientBillable = async (
    qbCustomerId: string,
    loggedAt: string,
    billable: boolean,
  ) => {
    try {
      await billableMutation.mutateAsync({ qbCustomerId, loggedAt, billable });
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.message ? err.message : "Couldn't update billable.",
      );
    }
  };

  const handleDeleteEntry = async (entryId: number) => {
    const ok = await confirm({
      title: 'Delete this entry?',
      description:
        "This removes the hours from the work item's total. You can always log them again. " +
        "Locked entries (submitted or already synced to QuickBooks) can't be deleted here.",
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(entryId);
      toast.success('Entry deleted.');
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.message ? err.message : "Couldn't delete the entry.",
      );
    }
  };
  // Last submit response — drives banner state and per-row error annotations.
  // Cleared whenever the user clicks Submit again so a fresh result replaces
  // the stale banner instead of stacking.
  const [lastResult, setLastResult] = useState<SubmitTimesheetResponse | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Map of entry_id → error message from the most recent submit. Used to
  // annotate failing rows inline so the dev sees which entry needs attention
  // without scanning the banner copy.
  const failedById = useMemo(() => {
    const map = new Map<number, string>();
    for (const f of lastResult?.failed ?? []) {
      map.set(f.entry_id, f.error);
    }
    return map;
  }, [lastResult]);

  // Day grouping — derived from the response. Lives up here next to the
  // other hooks (not next to the day render) because hook order must be
  // stable across renders; the early returns below would otherwise skip it.
  const days = useMemo(
    () => (timesheetQuery.data ? groupByDay(timesheetQuery.data) : []),
    [timesheetQuery.data],
  );

  // Meeting hours that fall on the rendered Mon-Fri days, so the week total
  // (logged + meetings) equals the sum of the per-day totals below.
  const weekMeetingHours = useMemo(
    () =>
      days.reduce((sum, d) => {
        const dm = meetingsByDay.get(d.iso) ?? [];
        return sum + dm.reduce((s, m) => s + m.hours, 0);
      }, 0),
    [days, meetingsByDay],
  );

  // Per-client roll-up across the whole week — drives the summary card
  // above the day list. Sorted descending so the biggest client always
  // anchors the start of the row.
  const weeklyByClient: WeeklyClientTotal[] = useMemo(() => {
    if (!timesheetQuery.data) return [];
    return timesheetQuery.data.clients
      .map((c) => ({
        qb_customer_id: c.qb_customer_id,
        client_name: c.client_name,
        hours: c.subtotal_hours,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [timesheetQuery.data]);

  const handleSubmit = () => {
    setLastError(null);
    setLastResult(null);
    submitMutation.mutate(undefined, {
      onSuccess: (res) => setLastResult(res),
      onError: (err) => {
        // Operational failures (409, 503, 500) land here as ApiError —
        // the backend's `detail` is on `err.message` (set by apiFetch).
        // Use permissionAwareError for the 403-specific "Do not have
        // permission" message; fall back to the message otherwise.
        if (err instanceof ApiError && err.status === 403) {
          setLastError(permissionAwareError(err, 'Submit failed. Please try again.'));
        } else if (err instanceof ApiError && err.message) {
          setLastError(err.message);
        } else if (err instanceof Error && err.message) {
          setLastError(err.message);
        } else {
          setLastError('Submit failed. Please try again.');
        }
      },
    });
  };

  if (timesheetQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#a3a3a3] text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading your hours…
      </div>
    );
  }

  if (timesheetQuery.error) {
    const msg =
      timesheetQuery.error instanceof ApiError && timesheetQuery.error.status === 404
        ? "Couldn't load your timesheet — no developer profile on this account."
        : permissionAwareError(timesheetQuery.error, "Couldn't load your timesheet.");
    return (
      <div className="space-y-4">
        <BackHeader onBack={onBack} />
        <div className="bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.2)] rounded-2xl p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#EF4444] shrink-0 mt-0.5" />
          <p className="text-sm text-[#a3a3a3]">{msg}</p>
        </div>
      </div>
    );
  }

  const data = timesheetQuery.data;
  if (!data) {
    return <BackHeader onBack={onBack} />;
  }

  const submitDisabled = data.syncable_unsubmitted_count === 0 || submitMutation.isPending;
  // Unlinked-project hours can never sync — surface them in the pinned
  // header chip AND at the top of the scroll area so the dev can't miss
  // them. Without this they'd live at the bottom and a busy week would
  // hide them entirely below the fold.
  const unlinkedHours = data.unlinked_projects.reduce((s, p) => s + (p.subtotal_hours || 0), 0);
  const hasUnlinked = data.unlinked_projects.length > 0;

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 gap-4">
        {/* Pinned header bar — Back arrow, submit totals/button, and the
          result banner all stay visible while the day list scrolls. */}
        <div className="flex flex-col gap-4 shrink-0">
          <BackHeader onBack={onBack} />

          {/* Submit bar — totals row + Submit button + the weekly-by-client
            stacked bar all live in one card so the "where am I, what's
            ready, what's the split" read is one glance, not three. */}
          <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-2xl font-bold text-white tabular-nums">
                  {Math.round((data.total_hours + weekMeetingHours) * 100) / 100}h
                </span>
                <span className="text-xs text-[#737373]">total this week</span>
                {isQuickBooksSubmitEnabled() && data.syncable_unsubmitted_count > 0 && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(224,185,84,0.12)] text-[#E0B954] font-semibold">
                    Not yet submitted
                  </span>
                )}
                {isQuickBooksSubmitEnabled() && hasUnlinked && (
                  <span
                    className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(245,158,11,0.12)] text-[#F59E0B] font-semibold flex items-center gap-1"
                    title="Hours on projects with no QuickBooks customer can't sync. Scroll down for details."
                  >
                    <FileWarning className="w-3 h-3" />
                    {unlinkedHours}h won't sync
                  </span>
                )}
              </div>
              {isQuickBooksSubmitEnabled() && (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitDisabled}
                  className="bg-[#E0B954] text-[#0d0d0d] hover:bg-[#d4ab47] disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                      Syncing…
                    </>
                  ) : (
                    'Submit & Sync to QuickBooks'
                  )}
                </Button>
              )}
            </div>

            {weeklyByClient.length > 0 && (
              <div className="pt-3 border-t border-[rgba(255,255,255,0.05)]">
                <WeeklyClientSummary clients={weeklyByClient} totalHours={data.total_hours} />
              </div>
            )}
          </div>

          <ResultBanner result={lastResult} error={lastError} />
        </div>

        {/* Scrollable region — unlinked-projects warning (TOP, so a dev
          with a busy week can't miss it), then day cards, then empty
          state. Only this scrolls so the submit button never disappears. */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
          {isQuickBooksSubmitEnabled() && hasUnlinked && (
            <div className="bg-[rgba(245,158,11,0.05)] border border-[rgba(245,158,11,0.25)] rounded-2xl p-4">
              <div className="flex items-start gap-2 mb-3 pb-3 border-b border-[rgba(245,158,11,0.15)]">
                <FileWarning className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#F59E0B]">
                    {unlinkedHours}h won't sync — {data.unlinked_projects.length} unlinked project
                    {data.unlinked_projects.length === 1 ? '' : 's'}
                  </p>
                  <p className="text-[11px] text-[#a3a3a3] mt-0.5">
                    These projects aren't linked to a QuickBooks customer, so their hours can't be
                    submitted. Ask an admin to link them.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                {data.unlinked_projects.map((project) => (
                  <ProjectBlock
                    key={project.project_id}
                    name={project.project_name}
                    subtotal={project.subtotal_hours}
                    entries={project.entries}
                    failedById={failedById}
                    onEdit={handleEditEntry}
                    onDelete={handleDeleteEntry}
                    muted
                    showDay
                    collapsible
                  />
                ))}
              </div>
            </div>
          )}

          {/* Always render Mon-Fri day cards (even when empty), so the
              dev has a "+ Add entry" affordance on every weekday — not
              just the days they happened to log on. Each empty day
              still says "Nothing logged" inside the card. */}
          {days.map((day) => (
            <DayBlock
              key={day.iso}
              day={day}
              meetings={meetingsByDay.get(day.iso) ?? []}
              failedById={failedById}
              assignableTickets={assignableTickets}
              onEdit={handleEditEntry}
              onDelete={handleDeleteEntry}
              onAdd={handleAddEntry}
              onSetClientBillable={handleSetClientBillable}
            />
          ))}
        </div>
      </div>
      {confirmDialog}
    </>
  );
};

// ── Subcomponents ──────────────────────────────────────────────────────

/** Editing & deletion callbacks plumbed from ReviewSubmitView down to each
 *  EntryRow. Defined here so DayBlock and ProjectBlock can re-export the
 *  same shape and we only declare the contract once. */
type EditEntryHandler = (
  entryId: number,
  body: { hours?: number; description?: string | null },
) => Promise<void>;
type DeleteEntryHandler = (entryId: number) => Promise<void>;
type AddEntryHandler = (body: {
  workItemId: number;
  hours: number;
  description?: string | null;
  loggedAt: string;
}) => Promise<unknown>;

/** Shape of a row in `myCapacity.tickets[]` that we need for the picker.
 *  Just the fields the AddEntryForm reads — keeps the prop surface tight
 *  and tolerates the wider CapacityTicket shape from the home card. */
interface PickableTicket {
  id: number;
  key: string;
  title: string;
  project_id: number;
  project_name: string | null;
  status: string;
}

// Stable per-client tint for the weekly bar — same palette as the
// capacity-card pie. Hash by qb_customer_id so the same client always
// gets the same color across renders.
const CLIENT_PALETTE = [
  '#E0B954',
  '#A78BFA',
  '#34D399',
  '#60A5FA',
  '#F97316',
  '#EC4899',
  '#10B981',
  '#F59E0B',
  '#94A3B8',
  '#EF4444',
];

const clientColor = (qbCustomerId: string): string => {
  let h = 0;
  for (let i = 0; i < qbCustomerId.length; i++) h = (h * 31 + qbCustomerId.charCodeAt(i)) | 0;
  return CLIENT_PALETTE[Math.abs(h) % CLIENT_PALETTE.length] ?? CLIENT_PALETTE[0]!;
};

interface WeeklyClientSummaryProps {
  clients: WeeklyClientTotal[];
  totalHours: number;
}

const WeeklyClientSummary = ({ clients, totalHours }: WeeklyClientSummaryProps) => {
  const denom = Math.max(totalHours, 1);
  // No outer card chrome — rendered inside the submit bar's card, so it
  // sits flush with the totals row above the dividing border.
  return (
    <div className="space-y-2">
      {/* Stacked bar — each segment width proportional to that client's
          share of the week. At-a-glance "where did my hours go" read. */}
      <div className="h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden flex">
        {clients.map((c) => (
          <div
            key={c.qb_customer_id}
            className="h-full"
            style={{
              width: `${(c.hours / denom) * 100}%`,
              backgroundColor: clientColor(c.qb_customer_id),
            }}
            title={`${c.client_name}: ${c.hours}h`}
          />
        ))}
      </div>

      {/* Inline legend — color chip + client name + hours, single tight
          row that wraps only on narrow widths. */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px]">
        {clients.map((c) => (
          <span key={c.qb_customer_id} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-sm shrink-0"
              style={{ backgroundColor: clientColor(c.qb_customer_id) }}
            />
            <span className="text-[#d4d4d4]">{c.client_name}</span>
            <span className="text-[#737373] tabular-nums font-mono">{c.hours}h</span>
          </span>
        ))}
      </div>
    </div>
  );
};

interface DayBlockProps {
  day: DayGroup;
  meetings: CapacityMeeting[];
  failedById: Map<number, string>;
  assignableTickets: PickableTicket[];
  onEdit: EditEntryHandler;
  onDelete: DeleteEntryHandler;
  onAdd: AddEntryHandler;
  onSetClientBillable: (qbCustomerId: string, loggedAt: string, billable: boolean) => Promise<void>;
}

/** Today's date in the user's local zone, formatted as ISO YYYY-MM-DD.
 *  Compared lexicographically against `day.iso` to gate the "+ Add entry"
 *  affordance — devs can only log on today or earlier, not future days
 *  (the backend rejects future-dated entries; this matches the UI). */
const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Small inline tag on a meeting line: the project parsed from the title's
 *  `project_name-purpose` convention, or a muted "untagged" when the title
 *  doesn't follow it (or the event is private). */
const MeetingProjectTag = ({ project }: { project?: string | null }) =>
  project ? (
    <span
      className="text-[10px] text-[#a3a3a3] bg-[rgba(255,255,255,0.05)] rounded px-1.5 py-0.5 shrink-0 max-w-[120px] truncate"
      title={`Project: ${project}`}
    >
      {project}
    </span>
  ) : (
    <span
      className="text-[10px] text-[#525252] italic shrink-0"
      title="No project — the meeting title doesn't follow the project-purpose naming convention"
    >
      untagged
    </span>
  );

const DayBlock = ({
  day,
  meetings,
  failedById,
  assignableTickets,
  onEdit,
  onDelete,
  onAdd,
  onSetClientBillable,
}: DayBlockProps) => {
  const hasEntries = day.clients.length > 0;
  const hasMeetings = meetings.length > 0;
  const dayMeetingHours = meetings.reduce((s, m) => s + m.hours, 0);
  // Day total = logged hours + meeting hours (matches how capacity counts both).
  const dayTotalHours = Math.round((day.subtotal_hours + dayMeetingHours) * 100) / 100;
  // A day is "Submitted" once every entry logged that day has been submitted
  // (submitted_at set — covers both submitted-pending and synced). A day with
  // any draft entry still reads "Not submitted".
  const dayEntries = day.clients.flatMap((c) => c.projects.flatMap((p) => p.entries));
  const dayAllSubmitted = dayEntries.length > 0 && dayEntries.every((e) => !!e.submitted_at);
  const [addingOpen, setAddingOpen] = useState(false);
  // Clients start collapsed — the day card shows each client + its hours,
  // and the dev clicks a client to reveal that client's tickets.
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const toggleClient = (qbCustomerId: string) =>
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(qbCustomerId)) next.delete(qbCustomerId);
      else next.add(qbCustomerId);
      return next;
    });
  // Only allow adding entries on today or earlier — matches the backend's
  // "logged_at can't be in the future" rule and avoids a confusing UX
  // where a Wednesday "+ Add entry" click fails with a 400 on Monday.
  const isFutureDay = day.iso > todayIso();
  return (
    <div
      className={`rounded-2xl p-4 ${
        hasEntries || hasMeetings
          ? 'bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.06)]'
          : 'bg-[rgba(255,255,255,0.015)] border border-dashed border-[rgba(255,255,255,0.06)]'
      }`}
    >
      {/* All day content sits inside one column so the day header
          (Monday • 8h) aligns with the client/project rows below. The
          dialog itself is narrow enough now that no extra max-width
          cap is needed. */}
      <div>
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-[rgba(255,255,255,0.05)]">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-semibold text-white">{weekdayName(day.iso)}</span>
            <span className="text-[11px] font-mono text-[#737373]">{dayDateLabel(day.iso)}</span>
            {/* Per-day submitted status — QuickBooks-only, hidden while QB is
                disabled (nothing can be submitted, so it would always read
                "Not submitted"). */}
            {isQuickBooksSubmitEnabled() &&
              hasEntries &&
              (dayAllSubmitted ? (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(52,211,153,0.12)] text-[#34D399] font-semibold">
                  Submitted
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.06)] text-[#a3a3a3] font-semibold">
                  Not submitted
                </span>
              ))}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* "+ Add entry" pinned in the day header. Toggles the inline
                form below; defaults to collapsed so the empty-week case
                isn't visually noisy. Hidden on future days — devs can
                only log on today or earlier. */}
            {!addingOpen && !isFutureDay && (
              <button
                type="button"
                onClick={() => setAddingOpen(true)}
                className="flex items-center gap-1 text-[11px] text-[#737373] hover:text-[#E0B954] transition-colors"
                aria-label={`Add entry on ${weekdayName(day.iso)}`}
              >
                <Plus className="w-3 h-3" />
                Add entry
              </button>
            )}
            <span
              className={`text-base font-mono font-semibold tabular-nums ${
                hasEntries || hasMeetings ? 'text-[#E0B954]' : 'text-[#525252]'
              }`}
            >
              {dayTotalHours}h
            </span>
          </div>
        </div>

        {addingOpen && (
          <AddEntryForm
            isoDate={day.iso}
            assignableTickets={assignableTickets}
            onAdd={onAdd}
            onClose={() => setAddingOpen(false)}
          />
        )}

        {!hasEntries && !addingOpen && (
          <p className="text-xs text-[#525252] italic">Nothing logged.</p>
        )}

        {hasEntries && (
          <div className="space-y-4">
            {day.clients.map((client) => {
              // Billable is a (client, day) decision: one checkbox per client
              // block. "Checked" means every entry that client has this day is
              // billable. Toggling sets only this day's draft entries. If the
              // group is already locked (submitted/synced), the checkbox is
              // read-only — those are in QuickBooks already.
              const clientEntries = client.projects.flatMap((p) => p.entries);
              const allBillable =
                clientEntries.length > 0 && clientEntries.every((e) => e.billable);
              const allLocked =
                clientEntries.length > 0 &&
                clientEntries.every((e) => e.synced || !!e.submitted_at);
              const billableId = `billable-${day.iso}-${client.qb_customer_id}`;
              // Auto-expand a client whose entries failed to sync so the
              // per-row errors are never hidden behind a collapsed client.
              const clientHasFailure = clientEntries.some((e) => failedById.has(e.id));
              const isUnlinkedGroup = client.qb_customer_id === UNLINKED_GROUP_ID;
              // The client-less QB-dark group has no header to toggle, so it's
              // always open — it renders as a plain project → entries list.
              const isOpen =
                isUnlinkedGroup || expandedClients.has(client.qb_customer_id) || clientHasFailure;
              // "Class" = the project category (a QuickBooks tracking
              // dimension). A client can span projects, so show the distinct
              // categories of its projects.
              const clientClasses = [
                ...new Set(
                  client.projects.map((p) => p.category_name).filter((c): c is string => !!c),
                ),
              ];
              return (
                <div key={client.qb_customer_id} className="space-y-2">
                  {/* Client (level 1) — collapsible header. Hidden for the
                    client-less QB-dark group, which renders as a bare
                    project → entries list (no client / billable / QuickBooks UI). */}
                  {!isUnlinkedGroup && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => toggleClient(client.qb_customer_id)}
                        aria-expanded={isOpen}
                        className="flex items-center gap-2 min-w-0 text-left text-white hover:text-[#E0B954] transition-colors"
                      >
                        {isOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[#737373]" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#737373]" />
                        )}
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: clientColor(client.qb_customer_id) }}
                        />
                        <span className="text-sm font-semibold">{client.client_name}</span>
                        <span className="text-[10px] text-[#737373] font-normal">
                          (Client in QuickBooks)
                        </span>
                      </button>
                      {/* Class = project category. */}
                      {clientClasses.length > 0 && (
                        <span
                          className="text-[10px] text-[#a3a3a3] bg-[rgba(255,255,255,0.05)] rounded px-1.5 py-0.5"
                          title="Class (project category)"
                        >
                          Class: {clientClasses.join(', ')}
                        </span>
                      )}
                      {/* Per-(client, day) billable toggle. */}
                      <label
                        htmlFor={billableId}
                        className={`inline-flex items-center gap-1.5 text-[11px] ${
                          allLocked
                            ? 'text-[#737373] cursor-not-allowed'
                            : 'text-[#a3a3a3] cursor-pointer hover:text-white'
                        }`}
                        title={
                          allLocked
                            ? 'These hours are already submitted/synced to QuickBooks — billable is locked.'
                            : 'Bill this client for this day’s hours. Sent to QuickBooks as the entry’s billable status on submit.'
                        }
                      >
                        <input
                          id={billableId}
                          type="checkbox"
                          checked={allBillable}
                          disabled={allLocked}
                          onChange={(e) =>
                            void onSetClientBillable(
                              client.qb_customer_id,
                              day.iso,
                              e.target.checked,
                            )
                          }
                          className="accent-[#E0B954] w-3.5 h-3.5 disabled:opacity-50"
                        />
                        Billable
                      </label>
                      <span className="ml-auto text-sm font-mono font-semibold tabular-nums text-[#E0B954]">
                        {client.subtotal_hours}h
                      </span>
                    </div>
                  )}
                  {/* Project (level 2) — revealed when the client is expanded.
                    Left border acts as a visual guide line so the eye follows
                    the client → project → entry hierarchy. */}
                  {isOpen && (
                    <div
                      className={
                        isUnlinkedGroup
                          ? 'space-y-2'
                          : 'pl-4 border-l border-[rgba(255,255,255,0.08)] ml-1 space-y-2'
                      }
                    >
                      {client.projects.map((project) => {
                        const subtotal = project.entries.reduce((s, e) => s + (e.hours || 0), 0);
                        return (
                          <ProjectBlock
                            key={project.project_id}
                            name={project.project_name}
                            subtotal={subtotal}
                            entries={project.entries}
                            failedById={failedById}
                            onEdit={onEdit}
                            onDelete={onDelete}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Calendar meetings for this day (from the capacity payload) — shown
            for context alongside logged hours; read-only. */}
        {hasMeetings && (
          <div
            className={hasEntries ? 'mt-3 pt-3 border-t border-[rgba(255,255,255,0.05)]' : 'mt-3'}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ backgroundColor: MEETING_COLOR }}
              />
              <span className="text-[10px] uppercase tracking-wider text-[#737373] font-semibold">
                Meetings ({meetings.length})
              </span>
            </div>
            <ul className="space-y-1.5">
              {meetings.map((m, i) => {
                const s = m.start_at?.slice(11, 16);
                const e = m.end_at?.slice(11, 16);
                const timeLabel = s && e && s !== e ? `${s}–${e}` : '';
                return (
                  <li key={`${m.start_at ?? 'm'}-${i}`} className="flex items-start gap-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="text-[#d4d4d4] truncate" title={m.title}>
                        {m.title}
                      </div>
                      {timeLabel && (
                        <div className="text-[10px] text-[#737373] tabular-nums">{timeLabel}</div>
                      )}
                    </div>
                    <MeetingProjectTag project={m.project} />
                    <span
                      className="font-mono tabular-nums shrink-0"
                      style={{ color: MEETING_COLOR }}
                    >
                      {m.hours}h
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

interface AddEntryFormProps {
  isoDate: string; // YYYY-MM-DD of the day this form will book against
  assignableTickets: PickableTicket[];
  onAdd: AddEntryHandler;
  onClose: () => void;
}

/**
 * Inline form rendered inside a DayBlock when the dev clicks "+ Add
 * entry". Picks a ticket from `assignableTickets` (sourced from
 * `/api/developers/me/capacity`), captures hours, and fires the add
 * mutation. Description is intentionally omitted — the ticket title
 * shows in the row by fallback, so a free-text note is redundant
 * noise for the add flow. (Edit still allows description changes.)
 */
const AddEntryForm = ({ isoDate, assignableTickets, onAdd, onClose }: AddEntryFormProps) => {
  // `done` tickets reject log-hours server-side — exclude them from the
  // picker so the dev doesn't pick one and get a 403.
  const tickets = useMemo(
    () => assignableTickets.filter((t) => t.status !== 'done'),
    [assignableTickets],
  );
  const [workItemId, setWorkItemId] = useState<number | ''>('');
  const [hours, setHours] = useState<string>('1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoursInputRef = useRef<HTMLInputElement | null>(null);

  // Focus the hours input once the form is open and the dev has picked
  // a ticket from the dropdown. Quality-of-life so two presses (pick +
  // type) flow naturally.
  useEffect(() => {
    if (workItemId !== '') hoursInputRef.current?.focus();
  }, [workItemId]);

  const handleSave = async () => {
    if (workItemId === '') {
      setError('Pick a ticket.');
      return;
    }
    const parsed = Number(hours);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Hours must be greater than 0.');
      return;
    }
    if (parsed > 24) {
      setError('Hours per entry caps at 24.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdd({
        workItemId,
        hours: parsed,
        loggedAt: isoDate,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Add failed.',
      );
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (tickets.length === 0) {
    return (
      <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-md p-3 my-2 flex items-start justify-between gap-3">
        <p className="text-xs text-[#a3a3a3]">
          You're not assigned to any tickets — ask a PM to assign you, then come back to log hours.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-[#737373] hover:text-white p-1 shrink-0"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[rgba(224,185,84,0.05)] border border-[rgba(224,185,84,0.25)] rounded-md p-3 my-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={workItemId}
          onChange={(e) => setWorkItemId(e.target.value === '' ? '' : Number(e.target.value))}
          onKeyDown={onKeyDown}
          disabled={saving}
          aria-label="Ticket"
          className="flex-1 min-w-[200px] text-xs text-[#d4d4d4] bg-[rgba(0,0,0,0.4)] border border-[rgba(255,255,255,0.1)] rounded px-2 py-1.5 focus:outline-none focus:border-[#E0B954]"
        >
          <option value="">Pick a ticket…</option>
          {tickets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
              {t.project_name ? ` (${t.project_name})` : ''}
            </option>
          ))}
        </select>
        <input
          ref={hoursInputRef}
          type="number"
          min="0.25"
          max="24"
          step="0.25"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={saving}
          aria-label="Hours"
          className="w-20 text-xs font-mono tabular-nums text-white bg-[rgba(0,0,0,0.4)] border border-[rgba(255,255,255,0.1)] rounded px-2 py-1.5 focus:outline-none focus:border-[#E0B954]"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          aria-label="Save"
          className="text-[#34D399] hover:text-[#86efac] disabled:opacity-50 p-1"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          aria-label="Cancel"
          className="text-[#737373] hover:text-white disabled:opacity-50 p-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {error && <p className="text-[11px] text-[#EF4444]">{error}</p>}
    </div>
  );
};

const BackHeader = ({ onBack }: { onBack: () => void }) => (
  <div className="flex items-center gap-3">
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1.5 text-[12px] text-[#a3a3a3] hover:text-white transition-colors"
      aria-label="Back to capacity summary"
    >
      <ArrowLeft className="w-4 h-4" />
      Back
    </button>
  </div>
);

interface ProjectBlockProps {
  name: string;
  subtotal: number;
  entries: TimesheetEntryResponse[];
  failedById: Map<number, string>;
  onEdit: EditEntryHandler;
  onDelete: DeleteEntryHandler;
  muted?: boolean;
  // Show a per-row day label. Used by the unlinked-projects section,
  // whose entries span the whole week rather than sitting under a day card.
  showDay?: boolean;
  // Render the project as a collapse toggle (header shows name + hours;
  // entries reveal on click). Used by the unlinked-projects section.
  collapsible?: boolean;
}

const ProjectBlock = ({
  name,
  subtotal,
  entries,
  failedById,
  onEdit,
  onDelete,
  muted,
  showDay,
  collapsible,
}: ProjectBlockProps) => {
  // Collapsible projects start collapsed; non-collapsible ones (under an
  // already-expanded client) always show their entries.
  const [open, setOpen] = useState(!collapsible);
  return (
    <div>
      {/* Project header (level 2). The entries (level 3) below are
          indented one step further with a thinner guide line so the
          hierarchy reads top-to-bottom: client → project → entries. */}
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full flex items-center justify-between mb-2 text-left"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            {open ? (
              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[#737373]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#737373]" />
            )}
            <span className={`text-sm font-semibold ${muted ? 'text-[#a3a3a3]' : 'text-white'}`}>
              {name}
            </span>
          </span>
          <span className="text-sm font-mono tabular-nums text-[#E0B954]">{subtotal}h</span>
        </button>
      ) : (
        <div className="flex items-center justify-between mb-2">
          <p className={`text-sm font-semibold ${muted ? 'text-[#a3a3a3]' : 'text-white'}`}>
            {name}
          </p>
          <span className="text-sm font-mono tabular-nums text-[#E0B954]">{subtotal}h</span>
        </div>
      )}
      {open && (
        <ul className="space-y-1.5 pl-4 border-l border-[rgba(255,255,255,0.06)] ml-1">
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              failureMsg={failedById.get(entry.id)}
              onEdit={onEdit}
              onDelete={onDelete}
              showDay={showDay}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

interface EntryRowProps {
  entry: TimesheetEntryResponse;
  failureMsg?: string;
  onEdit: EditEntryHandler;
  onDelete: DeleteEntryHandler;
  showDay?: boolean;
}

const EntryRow = ({ entry, failureMsg, onEdit, onDelete, showDay }: EntryRowProps) => {
  const isSynced = entry.synced;
  const isSubmittedUnsynced = !!entry.submitted_at && !isSynced;
  const isLocked = isSynced || isSubmittedUnsynced;
  const hasFailure = !!failureMsg;

  // Edit-in-place state. Stays local to each row so opening one row's
  // editor doesn't disturb anyone else's. `error` carries a per-row
  // server message when the save fails (e.g., 400 if hours > 24).
  const [editing, setEditing] = useState(false);
  const [editHours, setEditHours] = useState<string>(String(entry.hours));
  const [editDescription, setEditDescription] = useState<string>(entry.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoursInputRef = useRef<HTMLInputElement | null>(null);

  // Focus the hours input when entering edit mode — the dev's most
  // common edit is "fix the hours" so let them start typing immediately.
  useEffect(() => {
    if (editing) hoursInputRef.current?.select();
  }, [editing]);

  const cancelEdit = () => {
    setEditing(false);
    setEditHours(String(entry.hours));
    setEditDescription(entry.description ?? '');
    setError(null);
  };

  const saveEdit = async () => {
    const parsedHours = Number(editHours);
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      setError('Hours must be greater than 0.');
      return;
    }
    if (parsedHours > 24) {
      setError('Hours per entry caps at 24.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onEdit(entry.id, {
        hours: parsedHours,
        description: editDescription,
      });
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Save failed.',
      );
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  if (editing) {
    return (
      <li className="flex items-center gap-2 text-xs leading-tight rounded-md px-2 py-2 bg-[rgba(224,185,84,0.05)] border border-[rgba(224,185,84,0.25)]">
        <input
          ref={hoursInputRef}
          type="number"
          min="0.25"
          max="24"
          step="0.25"
          value={editHours}
          onChange={(e) => setEditHours(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={saving}
          aria-label="Hours"
          className="w-16 font-mono tabular-nums text-white bg-[rgba(0,0,0,0.4)] border border-[rgba(255,255,255,0.1)] rounded px-2 py-1 focus:outline-none focus:border-[#E0B954]"
        />
        <input
          type="text"
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={saving}
          aria-label="Description"
          placeholder={entry.work_item_title || 'Description'}
          className="flex-1 text-[#d4d4d4] bg-[rgba(0,0,0,0.4)] border border-[rgba(255,255,255,0.1)] rounded px-2 py-1 focus:outline-none focus:border-[#E0B954]"
        />
        {error && (
          <span className="text-[10px] text-[#EF4444] max-w-[180px] truncate" title={error}>
            {error}
          </span>
        )}
        <button
          type="button"
          onClick={() => void saveEdit()}
          disabled={saving}
          aria-label="Save"
          className="text-[#34D399] hover:text-[#86efac] disabled:opacity-50 p-1"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={saving}
          aria-label="Cancel"
          className="text-[#737373] hover:text-white disabled:opacity-50 p-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </li>
    );
  }

  return (
    <li
      className={`group flex items-center gap-3 text-xs leading-tight rounded-md px-2 py-2 ${
        hasFailure
          ? 'bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.15)]'
          : 'border border-transparent hover:bg-[rgba(255,255,255,0.02)]'
      }`}
    >
      <span className="font-mono tabular-nums text-white shrink-0 w-14 font-semibold">
        {entry.hours}h
      </span>
      {/* Day label — only when the row isn't already under a day card
          (the unlinked-projects section). Keeps the whole-week unlinked
          list legible by saying which weekday each entry belongs to. */}
      {showDay && entry.logged_at && (
        <span className="text-[11px] text-[#737373] shrink-0 w-24 tabular-nums">
          {shortDayLabel(entry.logged_at)}
        </span>
      )}
      {/* Description column. Falls back to the ticket title when the dev
          didn't type a free-text note. Em-dash only if neither exists
          (shouldn't happen — work items always have a title). */}
      <span
        className="text-[#d4d4d4] truncate flex-1"
        title={entry.description || entry.work_item_title || ''}
      >
        {entry.description || entry.work_item_title || <span className="text-[#525252]">—</span>}
      </span>
      {(isSynced || isSubmittedUnsynced) && (
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(52,211,153,0.12)] text-[#34D399] font-semibold shrink-0 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Submitted
        </span>
      )}
      {hasFailure && (
        <span
          className="text-[11px] text-[#EF4444] shrink-0 max-w-[260px] truncate"
          title={failureMsg}
        >
          {failureMsg}
        </span>
      )}
      {/* Per-row affordances. Locked rows (submitted or already synced)
          can't be touched here — the dev edits in QB instead. Draft rows
          get hover-revealed Edit + Delete icons; on touch they stay
          dim-visible so the affordance isn't accidentally hidden. */}
      {isLocked ? (
        <span
          className="text-[#525252] shrink-0 p-1"
          title={
            isSynced
              ? 'Synced to QuickBooks — fix it there if needed.'
              : 'Submitted for sync — locked until it lands in QuickBooks.'
          }
        >
          <Lock className="w-3.5 h-3.5" />
        </span>
      ) : (
        <span className="flex items-center gap-0.5 shrink-0 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit entry"
            title="Edit hours / description"
            className="text-[#a3a3a3] hover:text-[#E0B954] p-1"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void onDelete(entry.id)}
            aria-label="Delete entry"
            title="Delete this entry"
            className="text-[#a3a3a3] hover:text-[#EF4444] p-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </span>
      )}
    </li>
  );
};

interface ResultBannerProps {
  result: SubmitTimesheetResponse | null;
  error: string | null;
}

const ResultBanner = ({ result, error }: ResultBannerProps) => {
  if (error) {
    return (
      <div className="bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.2)] rounded-xl p-3 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
        <p className="text-xs text-[#fca5a5]">{error}</p>
      </div>
    );
  }
  if (!result) return null;

  const successCount = result.synced_count;
  const failedCount = result.failed.length;

  if (failedCount === 0 && successCount > 0) {
    return (
      <div className="bg-[rgba(52,211,153,0.06)] border border-[rgba(52,211,153,0.2)] rounded-xl p-3 flex items-start gap-2.5">
        <CheckCircle2 className="w-4 h-4 text-[#34D399] shrink-0 mt-0.5" />
        <p className="text-xs text-[#86efac]">
          All {successCount} {successCount === 1 ? 'entry' : 'entries'} synced to QuickBooks.
        </p>
      </div>
    );
  }
  if (failedCount > 0 && successCount > 0) {
    return (
      <div className="bg-[rgba(245,158,11,0.06)] border border-[rgba(245,158,11,0.2)] rounded-xl p-3 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
        <p className="text-xs text-[#fcd34d]">
          {successCount} of {successCount + failedCount} entries synced. {failedCount} failed —
          click Submit again to retry the highlighted rows.
        </p>
      </div>
    );
  }
  if (failedCount > 0 && successCount === 0) {
    return (
      <div className="bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.2)] rounded-xl p-3 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
        <p className="text-xs text-[#fca5a5]">
          {failedCount} {failedCount === 1 ? 'entry' : 'entries'} failed. Review the highlighted
          rows and try again.
        </p>
      </div>
    );
  }
  // submitted_count = 0 — no eligible entries this time, but the call succeeded.
  return (
    <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl p-3 flex items-start gap-2.5">
      <CheckCircle2 className="w-4 h-4 text-[#a3a3a3] shrink-0 mt-0.5" />
      <p className="text-xs text-[#a3a3a3]">No new hours to submit this week.</p>
    </div>
  );
};

export default ReviewSubmitView;
