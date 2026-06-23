import { Save } from 'lucide-react';
import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { PulseData, PulseMilestone } from '../pulseData';
import { PulseOverridesUser } from '../usePulseData';
import { DerivedBanner, BannerLink } from './components/DerivedBanner';
import { usePulseSettingsForm } from './hooks/usePulseSettingsForm';
import { formatRelative } from './lib/formatRelative';
import PulseBudgetSection from './sections/PulseBudgetSection';
import PulseMilestonesFinancialSection from './sections/PulseMilestonesFinancialSection';
import PulseMonthlyBurnSection from './sections/PulseMonthlyBurnSection';
import PulseRisksSection from './sections/PulseRisksSection';
import PulseServicesSection from './sections/PulseServicesSection';
import PulseSettingsHeader from './sections/PulseSettingsHeader';
import PulseSummarySection from './sections/PulseSummarySection';

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

const PulseSettingsView: React.FC<PulseSettingsViewProps> = ({
  projectId,
  initial,
  derivedMilestones,
  updatedAt,
  updatedBy,
  onSave,
  onReset,
}) => {
  const {
    data,
    isDirty,
    isSaving,
    clearStage,
    setClearStage,
    handleSave,
    handleReset,
    handleClear,
    patchSummary,
    setCurrentMonthTrackedPct,
    updateLedger,
    addLedger,
    removeLedger,
    updateMonth,
    addMonth,
    removeMonth,
    setLastActualIdx,
    updateIncluded,
    addIncluded,
    removeIncluded,
    patchMilestoneById,
    removeMilestoneById,
    updateRisk,
    addRisk,
    removeRisk,
  } = usePulseSettingsForm({ initial, derivedMilestones, onSave, onReset });

  // Why: refresh the relative "Last saved" caption only when the audit
  // timestamp changes — keeps the value out of the render path (purity rule)
  // and avoids a per-second tick we don't need for a settings screen.
  // eslint-disable-next-line react-hooks/purity -- deliberate once-per-(updatedAt) snapshot of Date.now() for the relative caption
  const now = useMemo(() => Date.now(), [updatedAt]);

  // Project deep-link base. Banners point PMs at the canonical edit surfaces
  // for data this editor only mirrors.
  const projectPath = `/project/${projectId}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PulseSettingsHeader
        isSaving={isSaving}
        clearStage={clearStage}
        setClearStage={setClearStage}
        onReset={handleReset}
        onClear={handleClear}
      />

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
