import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PulseMilestone } from '../../pulseData';
import { Field, NumberInput, Section, TextInput } from '../inputs';

interface PulseMilestonesSectionProps {
  milestones: PulseMilestone[];
  onUpdateRow: (i: number, patch: Partial<PulseMilestone>) => void;
  onAddRow: () => void;
  onRemoveRow: (i: number) => void;
}

const PulseMilestonesSection: React.FC<PulseMilestonesSectionProps> = ({
  milestones,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}) => (
  <Section
    title="Phases / milestones"
    subtitle="Roadmap phases with budget, spend, completion (used in Pulse roadmap views)"
  >
    <div className="space-y-3">
      {milestones.map((m, i) => (
        <div
          key={m.id}
          className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)]"
        >
          <Field label="Phase" className="col-span-3">
            <TextInput value={m.phase} onChange={(v) => onUpdateRow(i, { phase: v })} />
          </Field>
          <Field label="Date" className="col-span-2">
            <TextInput
              value={m.date}
              onChange={(v) => onUpdateRow(i, { date: v })}
              placeholder="e.g. Mar 26"
            />
          </Field>
          <Field label="Status" className="col-span-2">
            <select
              value={m.status}
              onChange={(e) =>
                onUpdateRow(i, { status: e.target.value as PulseMilestone['status'] })
              }
              className="w-full h-10 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] text-white text-sm px-2"
            >
              <option value="done">done</option>
              <option value="in-progress">in-progress</option>
              <option value="upcoming">upcoming</option>
            </select>
          </Field>
          <Field label="Budget" className="col-span-1">
            <NumberInput value={m.budget} onChange={(n) => onUpdateRow(i, { budget: n })} />
          </Field>
          <Field label="Spent" className="col-span-1">
            <NumberInput value={m.spent} onChange={(n) => onUpdateRow(i, { spent: n })} />
          </Field>
          <Field label="Pct" className="col-span-2">
            <NumberInput value={m.pct} onChange={(n) => onUpdateRow(i, { pct: n })} />
          </Field>
          <div className="col-span-1 flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemoveRow(i)}
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
        onClick={onAddRow}
        className="text-[#a3a3a3] hover:text-white"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add phase
      </Button>
    </div>
  </Section>
);

export default PulseMilestonesSection;
