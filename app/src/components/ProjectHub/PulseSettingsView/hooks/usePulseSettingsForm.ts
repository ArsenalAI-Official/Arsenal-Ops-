import { useState } from 'react';
import { toast } from 'sonner';
import {
  PulseData,
  PulseMilestone,
  PulseSummary,
  LedgerRow,
  MonthRow,
  PulseRisk,
  IncludedServicesRow,
  buildEmptyPulseData,
} from '../../pulseData';

interface UsePulseSettingsFormArgs {
  initial: PulseData;
  derivedMilestones: PulseMilestone[];
  onSave: (data: PulseData) => Promise<void>;
  onReset: (fixture: PulseData) => Promise<void>;
}

export function usePulseSettingsForm({
  initial,
  derivedMilestones,
  onSave,
  onReset,
}: UsePulseSettingsFormArgs) {
  const [data, setData] = useState<PulseData>(initial);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Two-stage confirmation flow for the destructive "Clear all data" action.
  // 'idle'        → no dialog open.
  // 'first'       → first dialog open: "Clear all Pulse data?" with a Continue
  //                 button that advances to the second prompt instead of acting.
  // 'second'      → second dialog open: explicit "Yes, clear all data" button
  //                 that fires handleClear. Cancel/Esc from either stage aborts.
  const [clearStage, setClearStage] = useState<'idle' | 'first' | 'second'>('idle');

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
      const { DUMMY_PULSE_DATA } = await import('../../pulseData.fixtures');
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

  // Fires after BOTH confirmation dialogs have been accepted. Persists an
  // empty payload through the same onReset path the dummy reset uses, so the
  // server round-trip + localStorage wipe stay consistent.
  const handleClear = async () => {
    setClearStage('idle');
    setIsSaving(true);
    try {
      const empty = buildEmptyPulseData();
      await onReset(empty);
      setData(empty);
      setIsDirty(false);
      toast.success('Pulse data cleared');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear Pulse data');
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

  return {
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
  };
}
