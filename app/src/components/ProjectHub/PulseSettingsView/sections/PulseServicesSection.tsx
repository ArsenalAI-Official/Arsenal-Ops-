import { Plus, Trash2 } from 'lucide-react';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IncludedServicesRow } from '../../pulseData';
import { Section } from '../inputs';

interface PulseServicesSectionProps {
  rows: IncludedServicesRow[];
  onUpdateRow: (i: number, patch: Partial<IncludedServicesRow>) => void;
  onAddRow: () => void;
  onRemoveRow: (i: number) => void;
  /** When true, hide the `usedHours` column — it's now sourced from the
   *  derive endpoint (sum of time_entries.hours) rather than typed in. The
   *  editor passes this on the Settings tab; the read-only viewer's table is
   *  a separate component path, so this prop is scoped to the editor. */
  hideDerivedColumns?: boolean;
}

const PulseServicesSection: React.FC<PulseServicesSectionProps> = ({
  rows,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
  hideDerivedColumns,
}) => (
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
            {!hideDerivedColumns && <th className="p-1">Used hrs</th>}
            <th className="p-1">Accrued hrs</th>
            <th className="p-1">Accrued $</th>
            <th className="p-1">Invoiced hrs</th>
            <th className="p-1">Invoices</th>
            <th className="p-1">Remaining hrs</th>
            <th className="p-1"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[rgba(255,255,255,0.04)]">
              <td className="p-1">
                <Input
                  value={r.month}
                  onChange={(e) => onUpdateRow(i, { month: e.target.value })}
                  placeholder="April 2026"
                  className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-32"
                />
              </td>
              <td className="p-1">
                <Input
                  type="number"
                  value={r.totalHours}
                  onChange={(e) => onUpdateRow(i, { totalHours: parseFloat(e.target.value) || 0 })}
                  className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                />
              </td>
              {!hideDerivedColumns && (
                <td className="p-1">
                  <Input
                    type="number"
                    value={r.usedHours}
                    onChange={(e) => onUpdateRow(i, { usedHours: parseFloat(e.target.value) || 0 })}
                    className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                  />
                </td>
              )}
              <td className="p-1">
                <Input
                  type="number"
                  value={r.billableAccrued}
                  onChange={(e) =>
                    onUpdateRow(i, { billableAccrued: parseFloat(e.target.value) || 0 })
                  }
                  className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                />
              </td>
              <td className="p-1">
                <Input
                  type="number"
                  value={r.billableAccruedCost}
                  onChange={(e) =>
                    onUpdateRow(i, { billableAccruedCost: parseFloat(e.target.value) || 0 })
                  }
                  className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-24"
                />
              </td>
              <td className="p-1">
                <Input
                  type="number"
                  value={r.billableInvoiced}
                  onChange={(e) =>
                    onUpdateRow(i, { billableInvoiced: parseFloat(e.target.value) || 0 })
                  }
                  className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                />
              </td>
              <td className="p-1">
                <Input
                  type="number"
                  value={r.invoiceCount}
                  onChange={(e) =>
                    onUpdateRow(i, { invoiceCount: parseFloat(e.target.value) || 0 })
                  }
                  className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-16"
                />
              </td>
              <td className="p-1">
                <Input
                  type="number"
                  value={r.expectedRemaining}
                  onChange={(e) =>
                    onUpdateRow(i, { expectedRemaining: parseFloat(e.target.value) || 0 })
                  }
                  className="h-8 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-white text-xs w-20"
                />
              </td>
              <td className="p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveRow(i)}
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
      onClick={onAddRow}
      className="text-[#a3a3a3] hover:text-white"
    >
      <Plus className="w-4 h-4 mr-2" />
      Add month
    </Button>
  </Section>
);

export default PulseServicesSection;
