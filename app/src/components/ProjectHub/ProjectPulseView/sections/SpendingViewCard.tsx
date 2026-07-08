import React, { useState } from 'react';
import { BurnChart } from './BurnChart';
import { BurnTable } from './BurnTable';
import { CategoryRibbon } from './CategoryRibbon';
import { PulseData } from '../../pulseData';
import { Card } from '../components/Card';

/* -------------------------------------------------------------------- */
/*  SPENDING BY CATEGORY — 3-way toggle (timeline / chart / table)      */
/* -------------------------------------------------------------------- */
export const SpendingViewCard: React.FC<{ pulse: PulseData }> = ({ pulse }) => {
  const [view, setView] = useState<'timeline' | 'chart' | 'table'>('timeline');
  const SUB: Record<string, string> = {
    timeline: 'When each category is active across the 12-month contract',
    chart: 'Stacked monthly spend with cumulative forecast',
    table: 'Every line item by month · the numeric source of truth',
  };
  const TABS = [
    { id: 'timeline' as const, label: 'Timeline ribbon' },
    { id: 'chart' as const, label: 'Stacked chart' },
    { id: 'table' as const, label: 'Table' },
  ];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Spending by category</h3>
          <p className="text-xs text-[#737373] mt-0.5">{SUB[view]}</p>
        </div>
        <div className="flex items-center p-0.5 rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={
                'px-3 py-1.5 text-xs rounded-md transition-colors ' +
                (view === t.id
                  ? 'bg-[#E0B954]/15 text-brand font-semibold'
                  : 'text-[#a3a3a3] hover:text-white')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {view === 'timeline' && (
        <div className="overflow-x-auto">
          <CategoryRibbon pulse={pulse} width={1100} />
        </div>
      )}
      {view === 'chart' && (
        <div className="overflow-x-auto">
          <BurnChart pulse={pulse} width={1100} />
        </div>
      )}
      {view === 'table' && (
        <div className="-mx-5 -mb-5">
          <BurnTable pulse={pulse} />
        </div>
      )}
    </Card>
  );
};
