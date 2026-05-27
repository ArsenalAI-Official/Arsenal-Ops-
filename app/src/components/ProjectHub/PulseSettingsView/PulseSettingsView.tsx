import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Save, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  PulseData,
  PulseMilestone,
  PulseSummary,
  LedgerRow,
  MonthRow,
  PulseRisk,
  IncludedServicesRow,
} from '../pulseData';
import { PulseOverridesUser } from '../usePulseData';
import PulseSummarySection from './sections/PulseSummarySection';
import PulseBudgetSection from './sections/PulseBudgetSection';
import PulseMonthlyBurnSection from './sections/PulseMonthlyBurnSection';
import PulseServicesSection from './sections/PulseServicesSection';
import PulseRisksSection from './sections/PulseRisksSection';
import PulseMilestonesFinancialSection from './sections/PulseMilestonesFinancialSection';

interface PulseSettingsViewProps {
  projectId: string | number;
  initial: PulseData;
  /** Milestones after the derive-endpoint merge — these own phase/date/status
   *  in the financial-fields-only editor. */
  derivedMilestones: PulseMilestone[];
  /** Audit metadata from the server. Powers the "Last saved by X · Y ago"
   *  caption near the save button. */
  updatedAt: string | null;
  updatedBy: PulseOverridesUser | null;
  /** Persist the override blob. Returns a promise so we can show success /
   *  error toasts in line with the round-trip. */
  onSave: (data: PulseData) => Promise<void>;
  /** Reset the override to the dummy fixture *and* clear the localStorage
   *  cache. Parent handles both halves. */
  onReset: (fixture: PulseData) => Promise<void>;
}

// Why: shared banner for sections now replaced by DB-derived values.
const DerivedBanner: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-lg border border-[#E0B954]/15 bg-[#E0B954]/5 px-4 py-2.5 text-xs text-[#a3a3a3] flex items-start gap-2">
    <span aria-hidden="true" className="text-[#E0B954] flex-shrink-0">
      ●
    </span>
    <span>{children}</span>
  </div>
);

/** Inline gold link used inside DerivedBanner copy to point PMs at the
 *  canonical edit surface for the data being mirrored. */
const BannerLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className="text-[#E0B954] underline-offset-2 hover:underline">
    {children}
  </Link>
);

/** Format an ISO timestamp as "Nm ago" / "Nh ago" / "Nd ago" against a
 *  caller-provided `now`. Falls back to a locale date string for anything
 *  older than 6 days. Pure — safe to call in render. */
const formatRelative = (iso: string, now: number): string => {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
};

const PulseSettingsView: React.FC<PulseSettingsViewProps> = ({
  projectId,
  initial,
  derivedMilestones,
  updatedAt,
  updatedBy,
  onSave,
  onReset,
}) => {
  const [data, setData] = useState<PulseData>(initial);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Why: refresh the relative "Last saved" caption only when the audit
  // timestamp changes — keeps the value out of the render path (purity rule)
  // and avoids a per-second tick we don't need for a settings screen.
  const now = useMemo(() => Date.now(), [updatedAt]);

  // Project deep-link base. Banners point PMs at the canonical edit surfaces
  // for data this editor only mirrors.
  const projectPath = `/project/${projectId}`;

  const update = (next: PulseData) => {
    // Cheap no-op guard — patches that produce an equal blob shouldn't mark
    // the form dirty. JSON.stringify is fine here: PulseData is small and
    // the editor's other work dwarfs the comparison cost.
    if (JSON.stringify(next) === JSON.stringify(data)) return;
    setData(next);
    setIsDirty(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(data);
      setIsDirty(false);
      toast.success('Pulse data saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Pulse data');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      // Why: keep dummy fixture out of main bundle.
      const { DUMMY_PULSE_DATA } = await import('../pulseData.fixtures');
      await onReset(DUMMY_PULSE_DATA);
      setData(DUMMY_PULSE_DATA);
      setIsDirty(false);
      toast.info('Reset to dummy data');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset Pulse data');
    } finally {
      setIsSaving(false);
    }
  };

  // Summary
  const patchSummary = (patch: Partial<PulseSummary>) =>
    update({ ...data, summary: { ...data.summary, ...patch } });
  const setCurrentMonthTrackedPct = (n: number) => update({ ...data, currentMonthTrackedPct: n });

  // Ledger
  const updateLedger = (i: number, patch: Partial<LedgerRow>) =>
    update({ ...data, ledger: data.ledger.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const addLedger = () =>
    update({
      ...data,
      ledger: [...data.ledger, { category: 'New line', amount: 0, owner: 'AAI', note: '' }],
    });
  const removeLedger = (i: number) =>
    update({ ...data, ledger: data.ledger.filter((_, idx) => idx !== i) });

  // Months
  const updateMonth = (i: number, patch: Partial<MonthRow>) =>
    update({ ...data, months: data.months.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) });
  const addMonth = () =>
    update({
      ...data,
      months: [
        ...data.months,
        { m: 'New', devFC: 0, devAct: null, dev: 0, ad: 0, gtm: 0, ba: 0, mgmt: 0 },
      ],
    });
  const removeMonth = (i: number) =>
    update({ ...data, months: data.months.filter((_, idx) => idx !== i) });
  const setLastActualIdx = (n: number) => update({ ...data, lastActualIdx: n });

  // Included services
  const updateIncluded = (i: number, patch: Partial<IncludedServicesRow>) =>
    update({
      ...data,
      includedServices: data.includedServices.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    });
  const addIncluded = () =>
    update({
      ...data,
      includedServices: [
        ...data.includedServices,
        {
          month: '',
          totalHours: 0,
          usedHours: 0,
          billableAccrued: 0,
          billableAccruedCost: 0,
          billableInvoiced: 0,
          invoiceCount: 0,
          expectedRemaining: 0,
        },
      ],
    });
  const removeIncluded = (i: number) =>
    update({ ...data, includedServices: data.includedServices.filter((_, idx) => idx !== i) });

  // Milestone financials (upsert by id). Section component only supplies the
  // id + the financial patch — the seed (phase/date/status) is resolved here
  // from the derive endpoint's list. Callers don't need to know about that.
  const patchMilestoneById = (id: string, patch: Partial<PulseMilestone>) => {
    const i = data.milestones.findIndex((m) => m.id === id);
    if (i >= 0) {
      update({
        ...data,
        milestones: data.milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
      });
      return;
    }
    // No manual row yet — seed from the derived milestone (single source of
    // truth for phase/date/status). If even that's missing (orphan, shouldn't
    // happen in practice), fall back to a zeroed row keyed on `id`.
    const seed: PulseMilestone = derivedMilestones.find((m) => m.id === id) ?? {
      id,
      phase: '',
      date: '',
      status: 'upcoming',
      budget: 0,
      spent: 0,
      pct: 0,
    };
    update({
      ...data,
      milestones: [...data.milestones, { ...seed, ...patch }],
    });
  };

  // Orphan milestones — manual rows with no derive-side counterpart — render
  // with a delete button so PMs can clean up stale entries.
  const removeMilestoneById = (id: string) =>
    update({ ...data, milestones: data.milestones.filter((m) => m.id !== id) });

  // Risks
  const updateRisk = (i: number, patch: Partial<PulseRisk>) =>
    update({ ...data, risks: data.risks.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const addRisk = () =>
    update({
      ...data,
      risks: [
        ...data.risks,
        { severity: 'medium', title: 'New risk', owner: '', due: '', note: '' },
      ],
    });
  const removeRisk = (i: number) =>
    update({ ...data, risks: data.risks.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#737373]">
            <Settings className="w-3.5 h-3.5" />
            <span>Admin</span>
            <span>›</span>
            <span className="text-[#a3a3a3]">Pulse Settings</span>
          </div>
          <h2 className="text-xl font-semibold text-white mt-1">Pulse data inputs</h2>
          <p className="text-sm text-[#737373] mt-0.5">
            Edit the variables that drive the Pulse view. Saved per project.
          </p>
        </div>
        {/* Why no top save button: F9 consolidated to the sticky bottom bar
         *  to remove the duplicate-handler trap. Audit caption (Last saved
         *  by X) moves alongside it down there. The header only carries
         *  Reset because Reset is destructive and benefits from being far
         *  from the dirty-state Save button. */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isSaving}
              className="border-[#EF4444]/30 text-[#FCA5A5] hover:bg-[#EF4444]/10 hover:text-[#FCA5A5]"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to dummy data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset Pulse data?</AlertDialogTitle>
              <AlertDialogDescription>
                This overwrites every editorial field — narrative, ledger, risks, milestone
                financials, monthly cost categories — with the dummy fixture. The server-saved blob
                is replaced. There is no undo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleReset}
                className="bg-[#EF4444] text-white hover:bg-[#DC2626]"
              >
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <DerivedBanner>
        Project metadata (name, key prefix, contract dates, launch target) is now synced from{' '}
        <BannerLink to={projectPath}>project settings</BannerLink>.
      </DerivedBanner>

      <DerivedBanner>
        Delivery counts, points, sprint counts, bugs, and overdue tallies sync from work items
        automatically. Edit only narrative and risk-trend notes here.
      </DerivedBanner>

      <PulseSummarySection
        summary={data.summary}
        currentMonthTrackedPct={data.currentMonthTrackedPct}
        onPatchSummary={patchSummary}
        onChangeCurrentMonthTrackedPct={setCurrentMonthTrackedPct}
        editableFields={['narrative', 'risksTrendNote']}
      />

      <PulseBudgetSection
        ledger={data.ledger}
        onUpdateRow={updateLedger}
        onAddRow={addLedger}
        onRemoveRow={removeLedger}
      />

      <DerivedBanner>
        Dev hours actual is now synced from logged time. Edit cost categories and dev-hours forecast
        only.
      </DerivedBanner>

      <PulseMonthlyBurnSection
        months={data.months}
        lastActualIdx={data.lastActualIdx}
        onUpdateRow={updateMonth}
        onAddRow={addMonth}
        onRemoveRow={removeMonth}
        onChangeLastActualIdx={setLastActualIdx}
        hideDerivedColumns
      />

      <DerivedBanner>
        Hours used is synced from logged time. Edit contract total, billable, and invoice fields
        only.
      </DerivedBanner>

      <PulseServicesSection
        rows={data.includedServices}
        onUpdateRow={updateIncluded}
        onAddRow={addIncluded}
        onRemoveRow={removeIncluded}
        hideDerivedColumns
      />

      <PulseRisksSection
        risks={data.risks}
        onUpdateRow={updateRisk}
        onAddRow={addRisk}
        onRemoveRow={removeRisk}
      />

      <DerivedBanner>
        Milestone titles, dates, and status are synced from the{' '}
        <BannerLink to={`${projectPath}?tab=tracker`}>project tracker</BannerLink>. Attach financial
        budget / spent / pct below.
      </DerivedBanner>

      <PulseMilestonesFinancialSection
        manualMilestones={data.milestones}
        derivedMilestones={derivedMilestones}
        onPatchById={patchMilestoneById}
        onRemoveOrphan={removeMilestoneById}
      />

      <DerivedBanner>
        Activity updates are now sourced from the{' '}
        <BannerLink to={`${projectPath}?tab=activity`}>project activity log</BannerLink>.
      </DerivedBanner>

      <DerivedBanner>
        Feature forecast-vs-actuals is now computed from epic estimates and logged hours.
      </DerivedBanner>

      {/* Sticky bottom save bar — single canonical save affordance with the
       *  audit caption next to it (F9: top duplicate removed). */}
      <div className="sticky bottom-4 flex justify-end items-center gap-3 flex-wrap">
        {updatedAt && (
          <p className="text-[10px] text-[#737373]">
            Last saved
            {updatedBy ? ` by ${updatedBy.name}` : ''} · {formatRelative(updatedAt, now)}
          </p>
        )}
        <Button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold disabled:opacity-50 shadow-xl"
        >
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? 'Saving…' : isDirty ? 'Save changes' : 'Saved'}
        </Button>
      </div>
    </div>
  );
};

export default PulseSettingsView;
