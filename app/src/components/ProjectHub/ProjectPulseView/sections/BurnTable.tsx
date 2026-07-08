import React, { useMemo } from 'react';
import { PulseData, computeDerived } from '../../pulseData';
import { fmt$ } from '../lib/format';

/* -------------------------------------------------------------------- */
/*  BURN TABLE — used inside SpendingViewCard "table" view              */
/* -------------------------------------------------------------------- */
export const BurnTable: React.FC<{ pulse: PulseData }> = React.memo(({ pulse }) => {
  const { monthsWithCum, forecastEnd } = useMemo(() => computeDerived(pulse), [pulse]);
  const sum = (key: keyof (typeof monthsWithCum)[number]) =>
    monthsWithCum.reduce((a, b) => a + (Number(b[key]) || 0), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-[#737373] border-y border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)]">
            <th className="text-left font-medium py-2.5 px-5">Month</th>
            <th className="text-right font-medium px-3">Dev FC hrs</th>
            <th className="text-right font-medium px-3">Dev Actual hrs</th>
            <th className="text-right font-medium px-3">Dev $</th>
            <th className="text-right font-medium px-3">BA $</th>
            <th className="text-right font-medium px-3">Mgmt $</th>
            <th className="text-right font-medium px-3">Ad Spend</th>
            <th className="text-right font-medium px-3">GTM $</th>
            <th className="text-right font-medium px-3 border-l border-[rgba(255,255,255,0.05)]">
              Monthly
            </th>
            <th className="text-right font-medium py-2.5 px-5">Cumulative</th>
          </tr>
        </thead>
        <tbody>
          {monthsWithCum.map((m, i) => {
            const statusColor =
              m.actual && !m.partial ? '#34D399' : m.partial ? '#FBBF24' : '#737373';
            return (
              <tr
                key={i}
                className={
                  'border-b border-[rgba(255,255,255,0.03)] ' +
                  (m.actual ? 'text-white' : 'text-[#a3a3a3]')
                }
              >
                <td className="py-2.5 px-5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: statusColor }}
                    />
                    <span className="font-medium font-mono">{m.m}</span>
                    {m.partial && (
                      <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-[#FBBF24]/15 text-[#FBBF24]">
                        MTD
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right px-3 font-mono">{m.devFC || '—'}</td>
                <td className="text-right px-3 font-mono">{m.devAct ?? '—'}</td>
                <td className="text-right px-3 font-mono">{m.dev ? fmt$(m.dev) : '—'}</td>
                <td className="text-right px-3 font-mono">{m.ba ? fmt$(m.ba) : '—'}</td>
                <td className="text-right px-3 font-mono">{m.mgmt ? fmt$(m.mgmt) : '—'}</td>
                <td className="text-right px-3 font-mono">{m.ad ? fmt$(m.ad) : '—'}</td>
                <td className="text-right px-3 font-mono">{m.gtm ? fmt$(m.gtm) : '—'}</td>
                <td className="text-right px-3 font-mono font-semibold border-l border-[rgba(255,255,255,0.05)]">
                  {fmt$(m.total)}
                </td>
                <td className="text-right py-2.5 px-5 font-mono font-semibold text-white">
                  {fmt$(m.cum)}
                </td>
              </tr>
            );
          })}
          <tr className="bg-[rgba(255,255,255,0.04)] border-t border-[rgba(255,255,255,0.12)]">
            <td className="py-3 px-5 text-sm font-semibold text-white">Total</td>
            <td className="text-right px-3 font-mono text-[#a3a3a3]">{sum('devFC')}</td>
            <td className="text-right px-3 font-mono text-[#a3a3a3]">
              {monthsWithCum.reduce((a, b) => a + (b.devAct || 0), 0)}
            </td>
            <td className="text-right px-3 font-mono text-white">{fmt$(sum('dev'))}</td>
            <td className="text-right px-3 font-mono text-white">{fmt$(sum('ba'))}</td>
            <td className="text-right px-3 font-mono text-white">{fmt$(sum('mgmt'))}</td>
            <td className="text-right px-3 font-mono text-white">{fmt$(sum('ad'))}</td>
            <td className="text-right px-3 font-mono text-white">{fmt$(sum('gtm'))}</td>
            <td className="text-right px-3 font-mono font-bold text-white border-l border-[rgba(255,255,255,0.05)]">
              {fmt$(forecastEnd)}
            </td>
            <td className="text-right py-3 px-5 font-mono font-bold text-white">
              {fmt$(forecastEnd)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});
BurnTable.displayName = 'BurnTable';
