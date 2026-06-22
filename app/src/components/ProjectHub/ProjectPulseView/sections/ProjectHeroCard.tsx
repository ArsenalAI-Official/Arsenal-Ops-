import React, { useMemo } from 'react';
import { PulseData, computeDerived, currentIncludedServices } from '../../pulseData';
import { Card } from '../components/Card';
import { Stat } from '../components/Stat';
import { fmt$, fmtPct } from '../lib/format';

/* -------------------------------------------------------------------- */
/*  PROJECT HERO CARD — Variant E first box (1:1 port)                  */
/* -------------------------------------------------------------------- */
export const ProjectHeroCard: React.FC<{ pulse: PulseData }> = React.memo(({ pulse }) => {
  const { contractTotal, burnedToDate, forecastEnd, monthsWithCum } = useMemo(
    () => computeDerived(pulse),
    [pulse],
  );
  const burnedPct = contractTotal > 0 ? burnedToDate / contractTotal : 0;
  const forecastVariance = forecastEnd - contractTotal;
  const underBudget = forecastVariance < 0;

  const devHoursActual = monthsWithCum
    .slice(0, pulse.lastActualIdx + 1)
    .reduce((a, b) => a + (b.devAct || 0), 0);
  const devHoursForecast = monthsWithCum.reduce((a, b) => a + (b.devFC || 0), 0);
  const devHoursToDateFC = monthsWithCum
    .slice(0, pulse.lastActualIdx + 1)
    .reduce((a, b) => a + (b.devFC || 0), 0);
  const devHoursPct = devHoursToDateFC > 0 ? devHoursActual / devHoursToDateFC : 0;

  const s = currentIncludedServices(pulse);
  const inclPct = s.totalHours > 0 ? s.usedHours / s.totalHours : 0;
  const lastMonth = monthsWithCum[pulse.lastActualIdx];
  const monthShort = (pulse.summary.monthLabel || '').split(' ')[0].slice(0, 3);

  return (
    <Card className="p-6">
      {/* Row 1 — Contract hero */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: big number + variance pill + burn track */}
        <div className="lg:col-span-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#737373] font-mono">
            Contract
          </div>
          <div className="flex items-end gap-4 mt-2 flex-wrap">
            <div className="text-5xl font-bold text-white tabular-nums tracking-tight">
              {fmt$(contractTotal)}
            </div>
            <div className="pb-1.5">
              <div
                className={
                  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ' +
                  (underBudget
                    ? 'bg-[#34D399]/15 text-[#34D399]'
                    : 'bg-[#FBBF24]/15 text-[#FBBF24]')
                }
              >
                <span>{underBudget ? '↓' : '↑'}</span>
                {fmt$(Math.abs(forecastVariance))} {underBudget ? 'under' : 'over'}
              </div>
            </div>
          </div>
          <div className="text-sm text-[#a3a3a3] mt-1">
            Projected end-of-project:{' '}
            <span className="text-white font-semibold tabular-nums">{fmt$(forecastEnd)}</span>
          </div>

          {/* Burn track */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-[11px] mb-2">
              <span className="text-[#737373] font-mono uppercase tracking-wider">
                Burned to date
              </span>
              <span className="text-white font-semibold tabular-nums">
                {fmt$(burnedToDate)} · {fmtPct(burnedPct)}
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full rounded-full"
                style={{
                  width: `${burnedPct * 100}%`,
                  background: 'linear-gradient(90deg,#C79E3B,#E0B954)',
                }}
              />
              <div
                className="absolute top-0 h-full w-0.5 bg-white/50"
                style={{ left: `${Math.min(100, (forecastEnd / contractTotal) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#737373] font-mono mt-1.5">
              <span>{pulse.project.contractStart}</span>
              <span>Target launch · {pulse.project.launchTarget}</span>
              <span>{pulse.project.contractEnd}</span>
            </div>
          </div>
        </div>

        {/* Right: 3 stat tiles */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat
            label={`Current month (${monthShort}, MTD)`}
            value={fmt$(lastMonth?.total || 0)}
            tone="amber"
          >
            <div className="mt-3 h-1 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
              <div
                className="h-full bg-[#FBBF24]"
                style={{ width: `${pulse.currentMonthTrackedPct}%` }}
              />
            </div>
            <div className="text-[10px] text-[#FBBF24] mt-1.5 font-mono">
              {pulse.currentMonthTrackedPct}% of month tracked
            </div>
          </Stat>

          <Stat
            label="Dev hours · to date"
            value={`${devHoursActual.toLocaleString()} / ${devHoursToDateFC.toLocaleString()}`}
            sub={`${fmtPct(devHoursPct)} · on pace for MVP`}
          >
            <div className="mt-3 h-1 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden relative">
              <div
                className="absolute top-0 left-0 h-full rounded-full bg-[#E0B954]"
                style={{ width: `${Math.min(100, devHoursPct * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-[#737373] mt-1.5 font-mono">
              Total plan: {devHoursForecast.toLocaleString()} hrs
            </div>
          </Stat>

          <Stat
            label="Included hours · used"
            value={`${s.usedHours.toLocaleString()} / ${s.totalHours.toLocaleString()}`}
            sub={`Through ${s.month}`}
            tone={inclPct >= 1 ? 'amber' : 'gold'}
          >
            <div className="mt-3 h-1 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, inclPct * 100)}%`,
                  background: inclPct >= 1 ? '#FBBF24' : '#E0B954',
                }}
              />
            </div>
            <div
              className={
                'text-[10px] mt-1.5 font-mono ' +
                (inclPct >= 1 ? 'text-[#FBBF24]' : 'text-[#a3a3a3]')
              }
            >
              {inclPct >= 1 ? 'Fully consumed · overage billable' : `${fmtPct(inclPct)} consumed`}
            </div>
          </Stat>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[rgba(255,255,255,0.05)] my-6" />

      {/* Row 2 — Billing & Accrual strip */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#737373] font-mono">
            Billing & Accrual
          </div>
          <div className="flex-1 h-px bg-[rgba(255,255,255,0.05)]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl p-5 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
            <div className="text-[11px] uppercase tracking-wider text-[#737373]">
              Billable hrs accrued
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <div className="text-2xl font-bold text-white tabular-nums">{s.billableAccrued}</div>
              <div className="text-sm text-[#737373]">hrs</div>
              <div className="text-sm text-[#a3a3a3] tabular-nums ml-auto">
                {fmt$(s.billableAccruedCost)}
              </div>
            </div>
            <div className="text-[11px] text-[#737373] mt-1">Mgmt + hours over included total</div>
          </div>
          <div className="rounded-xl p-5 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
            <div className="text-[11px] uppercase tracking-wider text-[#737373]">
              Invoiced to date
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <div className="text-2xl font-bold text-white tabular-nums">{s.billableInvoiced}</div>
              <div className="text-sm text-[#737373]">hrs</div>
              <div className="text-sm text-[#a3a3a3] ml-auto">{s.invoiceCount} invoices</div>
            </div>
            <div className="text-[11px] text-[#737373] mt-1">Submitted as of {s.month}</div>
          </div>
          <div className="rounded-xl p-5 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
            <div className="text-[11px] uppercase tracking-wider text-[#737373]">
              Billable remaining (forecast)
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <div className="text-2xl font-bold text-white tabular-nums">
                {s.expectedRemaining.toLocaleString()}
              </div>
              <div className="text-sm text-[#737373]">hrs</div>
            </div>
            <div className="text-[11px] text-[#737373] mt-1">
              Through end of contract · {pulse.project.contractEnd}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
});
ProjectHeroCard.displayName = 'ProjectHeroCard';
