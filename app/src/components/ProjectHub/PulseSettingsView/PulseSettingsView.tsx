import React, { useState } from 'react';
import { RotateCcw, Save, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  PulseData,
  PulseProjectMeta,
  PulseSummary,
  LedgerRow,
  MonthRow,
  PulseRisk,
  PulseMilestone,
  PulseUpdate,
  FeatureForecastRow,
  IncludedServicesRow,
  DUMMY_PULSE_DATA,
  savePulseData,
  resetPulseData,
} from '../pulseData';
import PulseProjectMetaSection from './sections/PulseProjectMetaSection';
import PulseSummarySection from './sections/PulseSummarySection';
import PulseBudgetSection from './sections/PulseBudgetSection';
import PulseMonthlyBurnSection from './sections/PulseMonthlyBurnSection';
import PulseServicesSection from './sections/PulseServicesSection';
import PulseRisksSection from './sections/PulseRisksSection';
import PulseMilestonesSection from './sections/PulseMilestonesSection';
import PulseUpdatesSection from './sections/PulseUpdatesSection';
import PulseFVASection, { FvaScope } from './sections/PulseFVASection';

interface PulseSettingsViewProps {
  projectId: string | number;
  initial: PulseData;
  onChange: (data: PulseData) => void;
}

const PulseSettingsView: React.FC<PulseSettingsViewProps> = ({ projectId, initial, onChange }) => {
  const [data, setData] = useState<PulseData>(initial);
  const [isDirty, setIsDirty] = useState(false);

  const update = (next: PulseData) => {
    setData(next);
    setIsDirty(true);
  };

  const handleSave = () => {
    savePulseData(projectId, data);
    onChange(data);
    setIsDirty(false);
    toast.success('Pulse data saved');
  };

  const handleReset = () => {
    resetPulseData(projectId);
    setData(DUMMY_PULSE_DATA);
    onChange(DUMMY_PULSE_DATA);
    setIsDirty(false);
    toast.info('Reset to dummy data');
  };

  // Project meta
  const patchProject = (patch: Partial<PulseProjectMeta>) =>
    update({ ...data, project: { ...data.project, ...patch } });

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

  // Milestones
  const updateMilestone = (i: number, patch: Partial<PulseMilestone>) =>
    update({
      ...data,
      milestones: data.milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    });
  const addMilestone = () =>
    update({
      ...data,
      milestones: [
        ...data.milestones,
        {
          id: `m${Date.now()}`,
          phase: 'New phase',
          date: '',
          status: 'upcoming',
          budget: 0,
          spent: 0,
          pct: 0,
        },
      ],
    });
  const removeMilestone = (i: number) =>
    update({ ...data, milestones: data.milestones.filter((_, idx) => idx !== i) });

  // Updates
  const updateUpdate = (i: number, patch: Partial<PulseUpdate>) =>
    update({
      ...data,
      updates: data.updates.map((u, idx) => (idx === i ? { ...u, ...patch } : u)),
    });
  const addUpdate = () =>
    update({
      ...data,
      updates: [...data.updates, { when: '', author: '', type: 'note', text: '' }],
    });
  const removeUpdate = (i: number) =>
    update({ ...data, updates: data.updates.filter((_, idx) => idx !== i) });

  // Forecast vs Actuals
  const updateFva = (scope: FvaScope, i: number, patch: Partial<FeatureForecastRow>) =>
    update({
      ...data,
      forecastVsActuals: {
        ...data.forecastVsActuals,
        [scope]: data.forecastVsActuals[scope].map((r, idx) =>
          idx === i ? { ...r, ...patch } : r,
        ),
      },
    });
  const addFva = (scope: FvaScope) =>
    update({
      ...data,
      forecastVsActuals: {
        ...data.forecastVsActuals,
        [scope]: [
          ...data.forecastVsActuals[scope],
          { feature: 'New feature', employee: '', fc: 0, act: 0 },
        ],
      },
    });
  const removeFva = (scope: FvaScope, i: number) =>
    update({
      ...data,
      forecastVsActuals: {
        ...data.forecastVsActuals,
        [scope]: data.forecastVsActuals[scope].filter((_, idx) => idx !== i),
      },
    });

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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-[#a3a3a3] hover:text-white"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to dummy data
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty}
            className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {isDirty ? 'Save changes' : 'Saved'}
          </Button>
        </div>
      </div>

      <PulseProjectMetaSection project={data.project} onPatch={patchProject} />

      <PulseSummarySection
        summary={data.summary}
        currentMonthTrackedPct={data.currentMonthTrackedPct}
        onPatchSummary={patchSummary}
        onChangeCurrentMonthTrackedPct={setCurrentMonthTrackedPct}
      />

      <PulseBudgetSection
        ledger={data.ledger}
        onUpdateRow={updateLedger}
        onAddRow={addLedger}
        onRemoveRow={removeLedger}
      />

      <PulseMonthlyBurnSection
        months={data.months}
        lastActualIdx={data.lastActualIdx}
        onUpdateRow={updateMonth}
        onAddRow={addMonth}
        onRemoveRow={removeMonth}
        onChangeLastActualIdx={setLastActualIdx}
      />

      <PulseServicesSection
        rows={data.includedServices}
        onUpdateRow={updateIncluded}
        onAddRow={addIncluded}
        onRemoveRow={removeIncluded}
      />

      <PulseRisksSection
        risks={data.risks}
        onUpdateRow={updateRisk}
        onAddRow={addRisk}
        onRemoveRow={removeRisk}
      />

      <PulseMilestonesSection
        milestones={data.milestones}
        onUpdateRow={updateMilestone}
        onAddRow={addMilestone}
        onRemoveRow={removeMilestone}
      />

      <PulseUpdatesSection
        updates={data.updates}
        onUpdateRow={updateUpdate}
        onAddRow={addUpdate}
        onRemoveRow={removeUpdate}
      />

      <PulseFVASection
        forecastVsActuals={data.forecastVsActuals}
        onUpdateRow={updateFva}
        onAddRow={addFva}
        onRemoveRow={removeFva}
      />

      {/* Bottom save bar */}
      <div className="sticky bottom-4 flex justify-end gap-2">
        <Button
          onClick={handleSave}
          disabled={!isDirty}
          className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold disabled:opacity-50 shadow-xl"
        >
          <Save className="w-4 h-4 mr-2" />
          {isDirty ? 'Save changes' : 'Saved'}
        </Button>
      </div>
    </div>
  );
};

export default PulseSettingsView;
