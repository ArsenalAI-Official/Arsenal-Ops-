import React, { useState } from 'react';
import { Plus, Trash2, RotateCcw, Save, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  PulseData,
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
} from './pulseData';

type FvaScope = 'current' | 'last' | 'project';

interface PulseSettingsViewProps {
  projectId: string | number;
  initial: PulseData;
  onChange: (data: PulseData) => void;
}

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 space-y-4">
    <div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {subtitle && <p className="text-xs text-[#737373] mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label,
  children,
  className,
}) => (
  <div className={className}>
    <label className="block text-[10px] uppercase tracking-wider text-[#737373] mb-1">
      {label}
    </label>
    {children}
  </div>
);

const numberInput = (value: number, onChange: (n: number) => void) => (
  <Input
    type="number"
    value={value}
    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    className="bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white"
  />
);

const textInput = (value: string, onChange: (s: string) => void, placeholder?: string) => (
  <Input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white"
  />
);

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

  const updateLedger = (i: number, patch: Partial<LedgerRow>) => {
    update({ ...data, ledger: data.ledger.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  };
  const addLedger = () =>
    update({
      ...data,
      ledger: [...data.ledger, { category: 'New line', amount: 0, owner: 'AAI', note: '' }],
    });
  const removeLedger = (i: number) =>
    update({ ...data, ledger: data.ledger.filter((_, idx) => idx !== i) });

  const updateMonth = (i: number, patch: Partial<MonthRow>) => {
    update({ ...data, months: data.months.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) });
  };
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

  const updateRisk = (i: number, patch: Partial<PulseRisk>) => {
    update({ ...data, risks: data.risks.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  };
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

  const updateMilestone = (i: number, patch: Partial<PulseMilestone>) => {
    update({
      ...data,
      milestones: data.milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    });
  };
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

  const updateUpdate = (i: number, patch: Partial<PulseUpdate>) => {
    update({
      ...data,
      updates: data.updates.map((u, idx) => (idx === i ? { ...u, ...patch } : u)),
    });
  };
  const addUpdate = () =>
    update({
      ...data,
      updates: [...data.updates, { when: '', author: '', type: 'note', text: '' }],
    });
  const removeUpdate = (i: number) =>
    update({ ...data, updates: data.updates.filter((_, idx) => idx !== i) });

  // Included services — per-month list (each row is a billing snapshot for that month)
  const updateIncluded = (i: number, patch: Partial<IncludedServicesRow>) => {
    update({
      ...data,
      includedServices: data.includedServices.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    });
  };
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

  // Forecast vs Actuals — 3 lists keyed by scope (current/last/project)
  const updateFva = (scope: FvaScope, i: number, patch: Partial<FeatureForecastRow>) => {
    update({
      ...data,
      forecastVsActuals: {
        ...data.forecastVsActuals,
        [scope]: data.forecastVsActuals[scope].map((r, idx) =>
          idx === i ? { ...r, ...patch } : r,
        ),
      },
    });
  };
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

      {/* Project meta */}
      <Section title="Project metadata" subtitle="Display name, contract span, launch target">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <Field label="Project name">
            {textInput(data.project.name, (v) =>
              update({ ...data, project: { ...data.project, name: v } }),
            )}
          </Field>
          <Field label="Key prefix">
            {textInput(data.project.keyPrefix, (v) =>
              update({ ...data, project: { ...data.project, keyPrefix: v } }),
            )}
          </Field>
          <Field label="Contract start">
            {textInput(
              data.project.contractStart,
              (v) => update({ ...data, project: { ...data.project, contractStart: v } }),
              'e.g. Feb 2026',
            )}
          </Field>
          <Field label="Launch target">
            {textInput(
              data.project.launchTarget,
              (v) => update({ ...data, project: { ...data.project, launchTarget: v } }),
              'e.g. Sep 2026',
            )}
          </Field>
          <Field label="Contract end">
            {textInput(
              data.project.contractEnd,
              (v) => update({ ...data, project: { ...data.project, contractEnd: v } }),
              'e.g. Jan 2027',
            )}
          </Field>
        </div>
      </Section>

      {/* Summary numbers */}
      <Section
        title="Pulse summary"
        subtitle="Health score and delivery numbers shown in the hero and tiles"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Field label="Health score (0–100)">
            {numberInput(data.summary.healthScore, (n) =>
              update({ ...data, summary: { ...data.summary, healthScore: n } }),
            )}
          </Field>
          <Field label="Health status">
            <select
              value={data.summary.healthStatus}
              onChange={(e) =>
                update({
                  ...data,
                  summary: { ...data.summary, healthStatus: e.target.value as any },
                })
              }
              className="w-full h-10 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] text-white text-sm px-3"
            >
              <option value="Healthy">Healthy</option>
              <option value="At Risk">At Risk</option>
              <option value="Critical">Critical</option>
            </select>
          </Field>
          <Field label="Delivery %">
            {numberInput(data.summary.deliveryPct, (n) =>
              update({ ...data, summary: { ...data.summary, deliveryPct: n } }),
            )}
          </Field>
          <Field label="Delivery completed">
            {numberInput(data.summary.deliveryCompleted, (n) =>
              update({ ...data, summary: { ...data.summary, deliveryCompleted: n } }),
            )}
          </Field>
          <Field label="Delivery total">
            {numberInput(data.summary.deliveryTotal, (n) =>
              update({ ...data, summary: { ...data.summary, deliveryTotal: n } }),
            )}
          </Field>
          <Field label="Overdue">
            {numberInput(data.summary.overdueCount, (n) =>
              update({ ...data, summary: { ...data.summary, overdueCount: n } }),
            )}
          </Field>
          <Field label="Open bugs">
            {numberInput(data.summary.openBugs, (n) =>
              update({ ...data, summary: { ...data.summary, openBugs: n } }),
            )}
          </Field>
          <Field label="Critical open">
            {numberInput(data.summary.criticalOpen, (n) =>
              update({ ...data, summary: { ...data.summary, criticalOpen: n } }),
            )}
          </Field>
          <Field label="Overall completion %">
            {numberInput(data.summary.overallCompletion, (n) =>
              update({ ...data, summary: { ...data.summary, overallCompletion: n } }),
            )}
          </Field>
          <Field label="Total work items">
            {numberInput(data.summary.workItems, (n) =>
              update({ ...data, summary: { ...data.summary, workItems: n } }),
            )}
          </Field>
          <Field label="Points completed">
            {numberInput(data.summary.pointsCompleted, (n) =>
              update({ ...data, summary: { ...data.summary, pointsCompleted: n } }),
            )}
          </Field>
          <Field label="Points total">
            {numberInput(data.summary.pointsTotal, (n) =>
              update({ ...data, summary: { ...data.summary, pointsTotal: n } }),
            )}
          </Field>
          <Field label="Active sprints">
            {numberInput(data.summary.activeSprints, (n) =>
              update({ ...data, summary: { ...data.summary, activeSprints: n } }),
            )}
          </Field>
          <Field label="Month label">
            {textInput(
              data.summary.monthLabel,
              (v) => update({ ...data, summary: { ...data.summary, monthLabel: v } }),
              'April 2026',
            )}
          </Field>
          <Field label="Month index">
            {numberInput(data.summary.monthIndex, (n) =>
              update({ ...data, summary: { ...data.summary, monthIndex: n } }),
            )}
          </Field>
          <Field label="Total months">
            {numberInput(data.summary.totalMonths, (n) =>
              update({ ...data, summary: { ...data.summary, totalMonths: n } }),
            )}
          </Field>
          <Field label="% of current month tracked">
            {numberInput(data.currentMonthTrackedPct, (n) =>
              update({ ...data, currentMonthTrackedPct: Math.max(0, Math.min(100, n)) }),
            )}
          </Field>
        </div>

        {/* Editorial fields used in the hero + status tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <Field label="Risks tile note (e.g. 'All clear')">
            {textInput(
              data.summary.risksTrendNote ?? '',
              (v) => update({ ...data, summary: { ...data.summary, risksTrendNote: v } }),
              'All clear',
            )}
          </Field>
          <Field label="People tile note (e.g. '6 active contributors')">
            {textInput(
              data.summary.peopleTrendNote ?? '',
              (v) => update({ ...data, summary: { ...data.summary, peopleTrendNote: v } }),
              '6 active contributors',
            )}
          </Field>
        </div>
        <div className="pt-2">
          <Field label="Hero narrative paragraph">
            <Textarea
              value={data.summary.narrative ?? ''}
              onChange={(e) =>
                update({ ...data, summary: { ...data.summary, narrative: e.target.value } })
              }
              placeholder="One paragraph describing the month's progress, blockers, and outlook. Shows under the hero headline."
              className="bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white min-h-[90px]"
            />
          </Field>
        </div>
      </Section>

      {/* Budget ledger */}
      <Section
        title="Budget ledger"
        subtitle="Contract scope rows. Owner = AAI / Client. Mark Included or TBD if applicable."
      >
        <div className="space-y-3">
          {data.ledger.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)]"
            >
              <Field label="Category" className="col-span-3">
                {textInput(row.category, (v) => updateLedger(i, { category: v }))}
              </Field>
              <Field label="Amount ($)" className="col-span-2">
                {numberInput(row.amount, (n) => updateLedger(i, { amount: n }))}
              </Field>
              <Field label="Owner" className="col-span-1">
                <select
                  value={row.owner}
                  onChange={(e) => updateLedger(i, { owner: e.target.value as any })}
                  className="w-full h-10 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] text-white text-sm px-2"
                >
                  <option value="AAI">AAI</option>
                  <option value="Client">Client</option>
                </select>
              </Field>
              <Field label="Note" className="col-span-4">
                {textInput(row.note || '', (v) => updateLedger(i, { note: v }))}
              </Field>
              <div className="col-span-1 flex items-center gap-2">
                <label className="flex items-center gap-1 text-[10px] text-[#a3a3a3]">
                  <input
                    type="checkbox"
                    checked={!!row.included}
                    onChange={(e) => updateLedger(i, { included: e.target.checked })}
                  />
                  Inc
                </label>
                <label className="flex items-center gap-1 text-[10px] text-[#a3a3a3]">
                  <input
                    type="checkbox"
                    checked={!!row.tbd}
                    onChange={(e) => updateLedger(i, { tbd: e.target.checked })}
                  />
                  TBD
                </label>
              </div>
              <div className="col-span-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeLedger(i)}
                  className="text-[#737373] hover:text-[#EF4444]"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={addLedger}
            className="text-[#a3a3a3] hover:text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add ledger row
          </Button>
        </div>
      </Section>

      {/* Monthly burn */}
      <Section
        title="Monthly burn"
        subtitle="Per-month forecast & actuals (dollars by category and dev hours)"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-[#737373]">
              <tr>
                <th className="text-left p-1">Month</th>
                <th className="p-1">Dev FC hrs</th>
                <th className="p-1">Dev Act hrs</th>
                <th className="p-1">Dev $</th>
                <th className="p-1">BA $</th>
                <th className="p-1">Mgmt $</th>
                <th className="p-1">Ad $</th>
                <th className="p-1">GTM $</th>
                <th className="p-1">Actual</th>
                <th className="p-1">MTD</th>
                <th className="p-1"></th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m, i) => (
                <tr key={i} className="border-t border-[rgba(255,255,255,0.04)]">
                  <td className="p-1">
                    <Input
                      value={m.m}
                      onChange={(e) => updateMonth(i, { m: e.target.value })}
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={m.devFC}
                      onChange={(e) => updateMonth(i, { devFC: parseFloat(e.target.value) || 0 })}
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={m.devAct ?? ''}
                      onChange={(e) =>
                        updateMonth(i, {
                          devAct: e.target.value === '' ? null : parseFloat(e.target.value) || 0,
                        })
                      }
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={m.dev}
                      onChange={(e) => updateMonth(i, { dev: parseFloat(e.target.value) || 0 })}
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-24"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={m.ba}
                      onChange={(e) => updateMonth(i, { ba: parseFloat(e.target.value) || 0 })}
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={m.mgmt}
                      onChange={(e) => updateMonth(i, { mgmt: parseFloat(e.target.value) || 0 })}
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={m.ad}
                      onChange={(e) => updateMonth(i, { ad: parseFloat(e.target.value) || 0 })}
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={m.gtm}
                      onChange={(e) => updateMonth(i, { gtm: parseFloat(e.target.value) || 0 })}
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                    />
                  </td>
                  <td className="p-1 text-center">
                    <input
                      type="checkbox"
                      checked={!!m.actual}
                      onChange={(e) => updateMonth(i, { actual: e.target.checked })}
                    />
                  </td>
                  <td className="p-1 text-center">
                    <input
                      type="checkbox"
                      checked={!!m.partial}
                      onChange={(e) => updateMonth(i, { partial: e.target.checked })}
                    />
                  </td>
                  <td className="p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMonth(i)}
                      className="h-7 w-7 text-[#737373] hover:text-[#EF4444]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Field label="Last actual month index (0-based)">
            <Input
              type="number"
              value={data.lastActualIdx}
              onChange={(e) => update({ ...data, lastActualIdx: parseInt(e.target.value) || 0 })}
              className="bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white w-32"
            />
          </Field>
          <Button
            variant="ghost"
            size="sm"
            onClick={addMonth}
            className="text-[#a3a3a3] hover:text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add month
          </Button>
        </div>
      </Section>

      {/* Included services — per-month billing snapshots */}
      <Section
        title="Billing & included services"
        subtitle="One row per month. The Pulse hero picks the row whose month matches the current Month label (falling back to the latest row)."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-[#737373]">
              <tr>
                <th className="text-left p-1">Month</th>
                <th className="p-1">Total hrs</th>
                <th className="p-1">Used hrs</th>
                <th className="p-1">Accrued hrs</th>
                <th className="p-1">Accrued $</th>
                <th className="p-1">Invoiced hrs</th>
                <th className="p-1">Invoices</th>
                <th className="p-1">Remaining hrs</th>
                <th className="p-1"></th>
              </tr>
            </thead>
            <tbody>
              {data.includedServices.map((r, i) => (
                <tr key={i} className="border-t border-[rgba(255,255,255,0.04)]">
                  <td className="p-1">
                    <Input
                      value={r.month}
                      onChange={(e) => updateIncluded(i, { month: e.target.value })}
                      placeholder="April 2026"
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-32"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={r.totalHours}
                      onChange={(e) =>
                        updateIncluded(i, { totalHours: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={r.usedHours}
                      onChange={(e) =>
                        updateIncluded(i, { usedHours: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={r.billableAccrued}
                      onChange={(e) =>
                        updateIncluded(i, { billableAccrued: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={r.billableAccruedCost}
                      onChange={(e) =>
                        updateIncluded(i, { billableAccruedCost: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-24"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={r.billableInvoiced}
                      onChange={(e) =>
                        updateIncluded(i, { billableInvoiced: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={r.invoiceCount}
                      onChange={(e) =>
                        updateIncluded(i, { invoiceCount: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-16"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      value={r.expectedRemaining}
                      onChange={(e) =>
                        updateIncluded(i, { expectedRemaining: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                    />
                  </td>
                  <td className="p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeIncluded(i)}
                      className="h-7 w-7 text-[#737373] hover:text-[#EF4444]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={addIncluded}
          className="text-[#a3a3a3] hover:text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add month
        </Button>
      </Section>

      {/* Risks */}
      <Section title="Risks" subtitle="Active issues displayed in the risks panel">
        <div className="space-y-3">
          {data.risks.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)]"
            >
              <Field label="Severity" className="col-span-1">
                <select
                  value={r.severity}
                  onChange={(e) => updateRisk(i, { severity: e.target.value as any })}
                  className="w-full h-10 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] text-white text-sm px-2"
                >
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
              </Field>
              <Field label="Title" className="col-span-5">
                {textInput(r.title, (v) => updateRisk(i, { title: v }))}
              </Field>
              <Field label="Owner" className="col-span-1">
                {textInput(r.owner, (v) => updateRisk(i, { owner: v }))}
              </Field>
              <Field label="Due" className="col-span-1">
                {textInput(r.due, (v) => updateRisk(i, { due: v }))}
              </Field>
              <Field label="Note" className="col-span-3">
                {textInput(r.note || '', (v) => updateRisk(i, { note: v }))}
              </Field>
              <div className="col-span-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRisk(i)}
                  className="text-[#737373] hover:text-[#EF4444]"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={addRisk}
            className="text-[#a3a3a3] hover:text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add risk
          </Button>
        </div>
      </Section>

      {/* Milestones / phases */}
      <Section
        title="Phases / milestones"
        subtitle="Roadmap phases with budget, spend, completion (used in Pulse roadmap views)"
      >
        <div className="space-y-3">
          {data.milestones.map((m, i) => (
            <div
              key={m.id}
              className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)]"
            >
              <Field label="Phase" className="col-span-3">
                {textInput(m.phase, (v) => updateMilestone(i, { phase: v }))}
              </Field>
              <Field label="Date" className="col-span-2">
                {textInput(m.date, (v) => updateMilestone(i, { date: v }), 'e.g. Mar 26')}
              </Field>
              <Field label="Status" className="col-span-2">
                <select
                  value={m.status}
                  onChange={(e) => updateMilestone(i, { status: e.target.value as any })}
                  className="w-full h-10 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] text-white text-sm px-2"
                >
                  <option value="done">done</option>
                  <option value="in-progress">in-progress</option>
                  <option value="upcoming">upcoming</option>
                </select>
              </Field>
              <Field label="Budget" className="col-span-1">
                {numberInput(m.budget, (n) => updateMilestone(i, { budget: n }))}
              </Field>
              <Field label="Spent" className="col-span-1">
                {numberInput(m.spent, (n) => updateMilestone(i, { spent: n }))}
              </Field>
              <Field label="Pct" className="col-span-2">
                {numberInput(m.pct, (n) => updateMilestone(i, { pct: n }))}
              </Field>
              <div className="col-span-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMilestone(i)}
                  className="text-[#737373] hover:text-[#EF4444]"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={addMilestone}
            className="text-[#a3a3a3] hover:text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add phase
          </Button>
        </div>
      </Section>

      {/* Updates feed */}
      <Section
        title="Updates feed"
        subtitle="Recent project updates / milestones / risks (used in Pulse roadmap views)"
      >
        <div className="space-y-3">
          {data.updates.map((u, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)]"
            >
              <Field label="When" className="col-span-2">
                {textInput(u.when, (v) => updateUpdate(i, { when: v }))}
              </Field>
              <Field label="Author" className="col-span-2">
                {textInput(u.author, (v) => updateUpdate(i, { author: v }))}
              </Field>
              <Field label="Type" className="col-span-2">
                <select
                  value={u.type}
                  onChange={(e) => updateUpdate(i, { type: e.target.value as any })}
                  className="w-full h-10 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] text-white text-sm px-2"
                >
                  <option value="note">note</option>
                  <option value="milestone">milestone</option>
                  <option value="risk">risk</option>
                </select>
              </Field>
              <Field label="Text" className="col-span-5">
                <Textarea
                  value={u.text}
                  onChange={(e) => updateUpdate(i, { text: e.target.value })}
                  className="bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white min-h-[40px]"
                />
              </Field>
              <div className="col-span-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeUpdate(i)}
                  className="text-[#737373] hover:text-[#EF4444]"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={addUpdate}
            className="text-[#a3a3a3] hover:text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add update
          </Button>
        </div>
      </Section>

      {/* Forecast vs Actuals — drives the bottom chart on Pulse */}
      <Section
        title="Forecast vs Actuals · Dev hours by feature"
        subtitle="Three lists feed the bottom Pulse chart's scope toggle (Current / Last / Project)"
      >
        {(['current', 'last', 'project'] as FvaScope[]).map((scope) => {
          const SCOPE_LABEL: Record<FvaScope, string> = {
            current: 'Current month',
            last: 'Last month',
            project: 'Entire project',
          };
          const rows = data.forecastVsActuals[scope];
          const totalFC = rows.reduce((a, b) => a + (b.fc || 0), 0);
          const totalAct = rows.reduce((a, b) => a + (b.act || 0), 0);
          return (
            <div key={scope} className="space-y-3 pt-2 first:pt-0">
              <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[rgba(255,255,255,0.05)] pb-2">
                <div>
                  <div className="text-xs uppercase tracking-wider text-[#E0B954] font-mono">
                    {SCOPE_LABEL[scope]}
                  </div>
                  <div className="text-[11px] text-[#737373] mt-0.5">
                    {rows.length} feature{rows.length === 1 ? '' : 's'} · forecast {totalFC}h ·
                    actual {totalAct}h ({totalAct - totalFC >= 0 ? '+' : ''}
                    {totalAct - totalFC}h)
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addFva(scope)}
                  className="text-[#a3a3a3] hover:text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add row
                </Button>
              </div>
              {rows.length === 0 ? (
                <div className="text-xs text-[#737373] py-2">
                  No rows yet — click "Add row" to start.
                </div>
              ) : (
                <div className="space-y-2">
                  {rows.map((r, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-12 gap-2 items-end p-2 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)]"
                    >
                      <Field label="Feature" className="col-span-5">
                        {textInput(r.feature, (v) => updateFva(scope, i, { feature: v }))}
                      </Field>
                      <Field label="Employee" className="col-span-3">
                        {textInput(r.employee, (v) => updateFva(scope, i, { employee: v }))}
                      </Field>
                      <Field label="Forecast (hrs)" className="col-span-1">
                        {numberInput(r.fc, (n) => updateFva(scope, i, { fc: n }))}
                      </Field>
                      <Field label="Actual (hrs)" className="col-span-2">
                        {numberInput(r.act, (n) => updateFva(scope, i, { act: n }))}
                      </Field>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFva(scope, i)}
                          className="text-[#737373] hover:text-[#EF4444]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Section>

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
