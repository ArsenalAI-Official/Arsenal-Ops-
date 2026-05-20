import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LedgerRow } from '../../pulseData';
import { Field, NumberInput, Section, TextInput } from '../inputs';

interface PulseBudgetSectionProps {
  ledger: LedgerRow[];
  onUpdateRow: (i: number, patch: Partial<LedgerRow>) => void;
  onAddRow: () => void;
  onRemoveRow: (i: number) => void;
}

const PulseBudgetSection: React.FC<PulseBudgetSectionProps> = ({
  ledger,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}) => (
  <Section
    title="Budget ledger"
    subtitle="Contract scope rows. Owner = AAI / Client. Mark Included or TBD if applicable."
  >
    <div className="space-y-3">
      {ledger.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)]"
        >
          <Field label="Category" className="col-span-3">
            <TextInput value={row.category} onChange={(v) => onUpdateRow(i, { category: v })} />
          </Field>
          <Field label="Amount ($)" className="col-span-2">
            <NumberInput value={row.amount} onChange={(n) => onUpdateRow(i, { amount: n })} />
          </Field>
          <Field label="Owner" className="col-span-1">
            <select
              value={row.owner}
              onChange={(e) => onUpdateRow(i, { owner: e.target.value as LedgerRow['owner'] })}
              className="w-full h-10 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] text-white text-sm px-2"
            >
              <option value="AAI">AAI</option>
              <option value="Client">Client</option>
            </select>
          </Field>
          <Field label="Note" className="col-span-4">
            <TextInput value={row.note || ''} onChange={(v) => onUpdateRow(i, { note: v })} />
          </Field>
          <div className="col-span-1 flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] text-[#a3a3a3]">
              <input
                type="checkbox"
                checked={!!row.included}
                onChange={(e) => onUpdateRow(i, { included: e.target.checked })}
              />
              Inc
            </label>
            <label className="flex items-center gap-1 text-[10px] text-[#a3a3a3]">
              <input
                type="checkbox"
                checked={!!row.tbd}
                onChange={(e) => onUpdateRow(i, { tbd: e.target.checked })}
              />
              TBD
            </label>
          </div>
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
        Add ledger row
      </Button>
    </div>
  </Section>
);

export default PulseBudgetSection;
