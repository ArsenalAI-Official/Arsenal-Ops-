import { Trash2 } from 'lucide-react';
import React from 'react';
import { PulseMilestone } from '../../pulseData';
import { Field, NumberInput, Section } from '../inputs';

interface PulseMilestonesFinancialSectionProps {
  /** Manual milestones from the localStorage / overrides blob. These rows
   *  carry the editable financial fields (`budget`, `spent`, `pct`). */
  manualMilestones: PulseMilestone[];
  /** Milestones after merging with the derive endpoint. Phase + date come from
   *  here; we render one financial row per *derived* milestone so PMs are
   *  pricing the authoritative project_milestones list, not a localStorage
   *  shadow copy. Manual rows without a derived counterpart are still shown
   *  as "orphan" entries so they can be cleaned up. */
  derivedMilestones: PulseMilestone[];
  /** Patch (or append-if-missing) a milestone by id. The parent looks up the
   *  seed (phase/date/status) from `derivedMilestones` — callers only need to
   *  pass the financial patch. */
  onPatchById: (id: string, patch: Partial<PulseMilestone>) => void;
  /** Remove an orphan manual milestone by id. Only orphans expose a delete
   *  affordance — derived rows would just re-appear on the next refresh. */
  onRemoveOrphan: (id: string) => void;
}

/**
 * Financial-fields-only milestone editor.
 *
 * Phase / date / status are sourced from `project_milestones` via the
 * `/pulse-derived` endpoint and are read-only here. PMs edit budget, spent,
 * and pct values that overlay onto each derived milestone by `id`.
 *
 * Why no "Add milestone" button: milestones are owned by the Roadmap tab.
 * This section only lets PMs attach financial data to existing milestones.
 */
const PulseMilestonesFinancialSection: React.FC<PulseMilestonesFinancialSectionProps> = ({
  manualMilestones,
  derivedMilestones,
  onPatchById,
  onRemoveOrphan,
}) => {
  // Build the union: every derived milestone, plus any manual milestone that
  // has no derived counterpart (so PMs can clean up stale rows). Lookup keyed
  // by id for both directions.
  const derivedIds = new Set(derivedMilestones.map((m) => m.id));
  const orphans = manualMilestones.filter((m) => !derivedIds.has(m.id));

  const rows: { milestone: PulseMilestone; orphan: boolean }[] = [
    ...derivedMilestones.map((d) => {
      const manual = manualMilestones.find((m) => m.id === d.id);
      return {
        milestone: manual
          ? { ...d, budget: manual.budget, spent: manual.spent, pct: manual.pct }
          : { ...d, budget: 0, spent: 0, pct: 0 },
        orphan: false,
      };
    }),
    ...orphans.map((m) => ({ milestone: m, orphan: true })),
  ];

  return (
    <Section
      title="Milestone financials"
      subtitle="Attach budget, spent, and pct to each project milestone. Phase, date, and status are synced from the Roadmap."
    >
      {rows.length === 0 ? (
        <p className="text-xs text-[#737373] italic">
          No milestones yet. Create milestones from the Roadmap tab to start tracking financials.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ milestone: m, orphan }) => (
            <div
              key={m.id}
              className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)]"
            >
              <div className="col-span-5">
                <label className="block text-[10px] uppercase tracking-wider text-[#737373] mb-1">
                  Phase{' '}
                  {orphan && <span className="text-[#EF4444]">(not in project milestones)</span>}
                </label>
                <div className="text-sm text-white">{m.phase}</div>
                <div className="text-xs text-[#737373] mt-0.5">
                  {m.date} · {m.status}
                </div>
              </div>
              <Field label="Budget" className="col-span-2">
                <NumberInput value={m.budget} onChange={(n) => onPatchById(m.id, { budget: n })} />
              </Field>
              <Field label="Spent" className="col-span-2">
                <NumberInput value={m.spent} onChange={(n) => onPatchById(m.id, { spent: n })} />
              </Field>
              <Field
                label={orphan ? 'Pct' : 'Pct'}
                className={orphan ? 'col-span-2' : 'col-span-3'}
              >
                <NumberInput value={m.pct} onChange={(n) => onPatchById(m.id, { pct: n })} />
              </Field>
              {orphan && (
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onRemoveOrphan(m.id)}
                    aria-label={`Delete orphan milestone ${m.phase || m.id}`}
                    className="p-1.5 rounded text-[#EF4444]/70 hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
};

export default PulseMilestonesFinancialSection;
