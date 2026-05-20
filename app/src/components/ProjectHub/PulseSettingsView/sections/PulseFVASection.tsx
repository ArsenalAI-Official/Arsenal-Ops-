import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FeatureForecastRow, ForecastVsActuals } from '../../pulseData';
import { Field, NumberInput, Section, TextInput } from '../inputs';

export type FvaScope = 'current' | 'last' | 'project';

interface PulseFVASectionProps {
  forecastVsActuals: ForecastVsActuals;
  onUpdateRow: (scope: FvaScope, i: number, patch: Partial<FeatureForecastRow>) => void;
  onAddRow: (scope: FvaScope) => void;
  onRemoveRow: (scope: FvaScope, i: number) => void;
}

const SCOPE_LABEL: Record<FvaScope, string> = {
  current: 'Current month',
  last: 'Last month',
  project: 'Entire project',
};

const SCOPES: FvaScope[] = ['current', 'last', 'project'];

const PulseFVASection: React.FC<PulseFVASectionProps> = ({
  forecastVsActuals,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}) => (
  <Section
    title="Forecast vs Actuals · Dev hours by feature"
    subtitle="Three lists feed the bottom Pulse chart's scope toggle (Current / Last / Project)"
  >
    {SCOPES.map((scope) => {
      const rows = forecastVsActuals[scope];
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
                {rows.length} feature{rows.length === 1 ? '' : 's'} · forecast {totalFC}h · actual{' '}
                {totalAct}h ({totalAct - totalFC >= 0 ? '+' : ''}
                {totalAct - totalFC}h)
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddRow(scope)}
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
                    <TextInput
                      value={r.feature}
                      onChange={(v) => onUpdateRow(scope, i, { feature: v })}
                    />
                  </Field>
                  <Field label="Employee" className="col-span-3">
                    <TextInput
                      value={r.employee}
                      onChange={(v) => onUpdateRow(scope, i, { employee: v })}
                    />
                  </Field>
                  <Field label="Forecast (hrs)" className="col-span-1">
                    <NumberInput value={r.fc} onChange={(n) => onUpdateRow(scope, i, { fc: n })} />
                  </Field>
                  <Field label="Actual (hrs)" className="col-span-2">
                    <NumberInput
                      value={r.act}
                      onChange={(n) => onUpdateRow(scope, i, { act: n })}
                    />
                  </Field>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveRow(scope, i)}
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
);

export default PulseFVASection;
