import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PulseRisk } from '../../pulseData';
import { Field, Section, TextInput } from '../inputs';

interface PulseRisksSectionProps {
  risks: PulseRisk[];
  onUpdateRow: (i: number, patch: Partial<PulseRisk>) => void;
  onAddRow: () => void;
  onRemoveRow: (i: number) => void;
}

const PulseRisksSection: React.FC<PulseRisksSectionProps> = ({
  risks,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}) => (
  <Section title="Risks" subtitle="Active issues displayed in the risks panel">
    <div className="space-y-3">
      {risks.map((r, i) => (
        <div
          key={i}
          className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)]"
        >
          <Field label="Severity" className="col-span-1">
            <select
              value={r.severity}
              onChange={(e) =>
                onUpdateRow(i, { severity: e.target.value as PulseRisk['severity'] })
              }
              className="w-full h-10 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] text-white text-sm px-2"
            >
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </Field>
          <Field label="Title" className="col-span-5">
            <TextInput value={r.title} onChange={(v) => onUpdateRow(i, { title: v })} />
          </Field>
          <Field label="Owner" className="col-span-1">
            <TextInput value={r.owner} onChange={(v) => onUpdateRow(i, { owner: v })} />
          </Field>
          <Field label="Due" className="col-span-1">
            <TextInput value={r.due} onChange={(v) => onUpdateRow(i, { due: v })} />
          </Field>
          <Field label="Note" className="col-span-3">
            <TextInput value={r.note || ''} onChange={(v) => onUpdateRow(i, { note: v })} />
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
        Add risk
      </Button>
    </div>
  </Section>
);

export default PulseRisksSection;
