import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { PulseSummary } from '../../pulseData';
import { Field, NumberInput, Section, TextInput } from '../inputs';

// Why: lets the parent restrict the editor to fields not yet derived from DB.
export type PulseSummaryEditableField =
  | 'healthScore'
  | 'healthStatus'
  | 'deliveryPct'
  | 'deliveryCompleted'
  | 'deliveryTotal'
  | 'overdueCount'
  | 'openBugs'
  | 'criticalOpen'
  | 'overallCompletion'
  | 'workItems'
  | 'pointsCompleted'
  | 'pointsTotal'
  | 'activeSprints'
  | 'monthLabel'
  | 'monthIndex'
  | 'totalMonths'
  | 'currentMonthTrackedPct'
  | 'risksTrendNote'
  | 'peopleTrendNote'
  | 'narrative';

interface PulseSummarySectionProps {
  summary: PulseSummary;
  currentMonthTrackedPct: number;
  onPatchSummary: (patch: Partial<PulseSummary>) => void;
  onChangeCurrentMonthTrackedPct: (n: number) => void;
  editableFields?: PulseSummaryEditableField[];
}

const PulseSummarySection: React.FC<PulseSummarySectionProps> = ({
  summary,
  currentMonthTrackedPct,
  onPatchSummary,
  onChangeCurrentMonthTrackedPct,
  editableFields,
}) => {
  const show = (f: PulseSummaryEditableField) => !editableFields || editableFields.includes(f);
  const anyNumericGrid =
    show('healthScore') ||
    show('healthStatus') ||
    show('deliveryPct') ||
    show('deliveryCompleted') ||
    show('deliveryTotal') ||
    show('overdueCount') ||
    show('openBugs') ||
    show('criticalOpen') ||
    show('overallCompletion') ||
    show('workItems') ||
    show('pointsCompleted') ||
    show('pointsTotal') ||
    show('activeSprints') ||
    show('monthLabel') ||
    show('monthIndex') ||
    show('totalMonths') ||
    show('currentMonthTrackedPct');
  const anyTrendRow = show('risksTrendNote') || show('peopleTrendNote');

  return (
    <Section title="Pulse summary" subtitle="Editorial copy shown in the hero and status tiles">
      {anyNumericGrid && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {show('healthScore') && (
            <Field label="Health score (0–100)">
              <NumberInput
                value={summary.healthScore}
                onChange={(n) => onPatchSummary({ healthScore: n })}
              />
            </Field>
          )}
          {show('healthStatus') && (
            <Field label="Health status">
              <select
                value={summary.healthStatus}
                onChange={(e) =>
                  onPatchSummary({ healthStatus: e.target.value as PulseSummary['healthStatus'] })
                }
                className="w-full h-10 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] text-white text-sm px-3"
              >
                <option value="Healthy">Healthy</option>
                <option value="At Risk">At Risk</option>
                <option value="Critical">Critical</option>
              </select>
            </Field>
          )}
          {show('deliveryPct') && (
            <Field label="Delivery %">
              <NumberInput
                value={summary.deliveryPct}
                onChange={(n) => onPatchSummary({ deliveryPct: n })}
              />
            </Field>
          )}
          {show('deliveryCompleted') && (
            <Field label="Delivery completed">
              <NumberInput
                value={summary.deliveryCompleted}
                onChange={(n) => onPatchSummary({ deliveryCompleted: n })}
              />
            </Field>
          )}
          {show('deliveryTotal') && (
            <Field label="Delivery total">
              <NumberInput
                value={summary.deliveryTotal}
                onChange={(n) => onPatchSummary({ deliveryTotal: n })}
              />
            </Field>
          )}
          {show('overdueCount') && (
            <Field label="Overdue">
              <NumberInput
                value={summary.overdueCount}
                onChange={(n) => onPatchSummary({ overdueCount: n })}
              />
            </Field>
          )}
          {show('openBugs') && (
            <Field label="Open bugs">
              <NumberInput
                value={summary.openBugs}
                onChange={(n) => onPatchSummary({ openBugs: n })}
              />
            </Field>
          )}
          {show('criticalOpen') && (
            <Field label="Critical open">
              <NumberInput
                value={summary.criticalOpen}
                onChange={(n) => onPatchSummary({ criticalOpen: n })}
              />
            </Field>
          )}
          {show('overallCompletion') && (
            <Field label="Overall completion %">
              <NumberInput
                value={summary.overallCompletion}
                onChange={(n) => onPatchSummary({ overallCompletion: n })}
              />
            </Field>
          )}
          {show('workItems') && (
            <Field label="Total work items">
              <NumberInput
                value={summary.workItems}
                onChange={(n) => onPatchSummary({ workItems: n })}
              />
            </Field>
          )}
          {show('pointsCompleted') && (
            <Field label="Points completed">
              <NumberInput
                value={summary.pointsCompleted}
                onChange={(n) => onPatchSummary({ pointsCompleted: n })}
              />
            </Field>
          )}
          {show('pointsTotal') && (
            <Field label="Points total">
              <NumberInput
                value={summary.pointsTotal}
                onChange={(n) => onPatchSummary({ pointsTotal: n })}
              />
            </Field>
          )}
          {show('activeSprints') && (
            <Field label="Active sprints">
              <NumberInput
                value={summary.activeSprints}
                onChange={(n) => onPatchSummary({ activeSprints: n })}
              />
            </Field>
          )}
          {show('monthLabel') && (
            <Field label="Month label">
              <TextInput
                value={summary.monthLabel}
                onChange={(v) => onPatchSummary({ monthLabel: v })}
                placeholder="April 2026"
              />
            </Field>
          )}
          {show('monthIndex') && (
            <Field label="Month index">
              <NumberInput
                value={summary.monthIndex}
                onChange={(n) => onPatchSummary({ monthIndex: n })}
              />
            </Field>
          )}
          {show('totalMonths') && (
            <Field label="Total months">
              <NumberInput
                value={summary.totalMonths}
                onChange={(n) => onPatchSummary({ totalMonths: n })}
              />
            </Field>
          )}
          {show('currentMonthTrackedPct') && (
            <Field label="% of current month tracked">
              <NumberInput
                value={currentMonthTrackedPct}
                onChange={(n) => onChangeCurrentMonthTrackedPct(Math.max(0, Math.min(100, n)))}
              />
            </Field>
          )}
        </div>
      )}

      {anyTrendRow && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {show('risksTrendNote') && (
            <Field label="Risks tile note (e.g. 'All clear')">
              <TextInput
                value={summary.risksTrendNote ?? ''}
                onChange={(v) => onPatchSummary({ risksTrendNote: v })}
                placeholder="All clear"
              />
            </Field>
          )}
          {show('peopleTrendNote') && (
            <Field label="People tile note (e.g. '6 active contributors')">
              <TextInput
                value={summary.peopleTrendNote ?? ''}
                onChange={(v) => onPatchSummary({ peopleTrendNote: v })}
                placeholder="6 active contributors"
              />
            </Field>
          )}
        </div>
      )}

      {show('narrative') && (
        <div className="pt-2">
          <Field label="Hero narrative paragraph">
            <Textarea
              value={summary.narrative ?? ''}
              onChange={(e) => onPatchSummary({ narrative: e.target.value })}
              placeholder="One paragraph describing the month's progress, blockers, and outlook. Shows under the hero headline."
              className="bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white min-h-[90px]"
            />
          </Field>
        </div>
      )}
    </Section>
  );
};

export default PulseSummarySection;
