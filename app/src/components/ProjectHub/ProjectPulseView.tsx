import React, { useState, useMemo } from 'react';
import {
  PulseData,
  FeatureForecastRow,
  computeDerived,
  currentIncludedServices,
} from './pulseData';

const fmt$ = (v: number) => (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString();
const fmt$k = (v: number) => (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v) / 100) / 10 + 'k';
const fmtPct = (v: number) => Math.round(v * 100) + '%';

const CATEGORY_COLORS = [
  { key: 'dev', label: 'Development', color: '#E0B954' },
  { key: 'mgmt', label: 'Mgmt', color: '#5EEAD4' },
  { key: 'ba', label: 'BA / GTM Analyst', color: '#A78BFA' },
  { key: 'ad', label: 'Ad Spend', color: '#F87171' },
  { key: 'gtm', label: 'GTM', color: '#F472B6' },
] as const;

const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
  className = '',
  children,
}) => (
  <div
    className={
      'bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl ' + className
    }
  >
    {children}
  </div>
);

/* -------------------------------------------------------------------- */
/*  STAT TILE — used inside the unified hero                            */
/* -------------------------------------------------------------------- */
const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: 'neutral' | 'gold' | 'green' | 'amber';
  children?: React.ReactNode;
}> = ({ label, value, sub, tone = 'neutral', children }) => {
  const toneBorder: Record<string, string> = {
    neutral: 'border-[rgba(255,255,255,0.05)]',
    gold: 'border-[#E0B954]/25 bg-[#E0B954]/[0.04]',
    green: 'border-[#34D399]/20 bg-[#34D399]/[0.04]',
    amber: 'border-[#FBBF24]/20 bg-[#FBBF24]/[0.04]',
  };
  return (
    <div className={'rounded-xl p-4 bg-[rgba(255,255,255,0.02)] border ' + toneBorder[tone]}>
      <div className="text-[10px] uppercase tracking-wider text-[#737373]">{label}</div>
      <div className="text-xl font-bold text-white tabular-nums mt-1.5">{value}</div>
      {sub && <div className="text-[11px] text-[#a3a3a3] mt-1">{sub}</div>}
      {children}
    </div>
  );
};

/* -------------------------------------------------------------------- */
/*  PROJECT HERO CARD — Variant E first box (1:1 port)                  */
/* -------------------------------------------------------------------- */
const ProjectHeroCard: React.FC<{ pulse: PulseData }> = React.memo(({ pulse }) => {
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

/* -------------------------------------------------------------------- */
/*  STACKED BURN CHART — used inside SpendingViewCard "chart" view      */
/* -------------------------------------------------------------------- */
const BurnChart: React.FC<{ pulse: PulseData; width?: number; height?: number }> = React.memo(
  ({ pulse, width = 1100, height = 340 }) => {
    const { monthsWithCum } = useMemo(() => computeDerived(pulse), [pulse]);
    const padL = 56,
      padR = 56,
      padT = 24,
      padB = 44;
    const W = width - padL - padR;
    const H = height - padT - padB;

    const maxStack = Math.max(...monthsWithCum.map((m) => m.total), 1);
    const maxCum = monthsWithCum[monthsWithCum.length - 1]?.cum || 1;
    const yMaxBar = Math.ceil(maxStack / 10000) * 10000 || 10000;
    const yMaxCum = Math.ceil(maxCum / 50000) * 50000 || 50000;

    const bw = W / monthsWithCum.length;
    const barW = bw * 0.62;
    const xBar = (i: number) => padL + bw * i + bw / 2 - barW / 2;
    const yBar = (v: number) => padT + H - (v / yMaxBar) * H;
    const yLine = (v: number) => padT + H - (v / yMaxCum) * H;

    const linePts = monthsWithCum.map(
      (m, i) => [padL + bw * i + bw / 2, yLine(m.cum)] as [number, number],
    );
    const actPath = linePts
      .slice(0, pulse.lastActualIdx + 1)
      .map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1])
      .join(' ');
    const fcPath = linePts
      .slice(pulse.lastActualIdx)
      .map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1])
      .join(' ');
    const barTicks = [0, yMaxBar * 0.25, yMaxBar * 0.5, yMaxBar * 0.75, yMaxBar];
    const cumTicks = [0, yMaxCum * 0.25, yMaxCum * 0.5, yMaxCum * 0.75, yMaxCum];
    const todayX = padL + bw * pulse.lastActualIdx + bw / 2 + bw * 0.35;

    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <defs>
          <pattern
            id="hatch"
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
          </pattern>
        </defs>
        {barTicks.map((t, i) => (
          <line
            key={i}
            x1={padL}
            x2={padL + W}
            y1={yBar(t)}
            y2={yBar(t)}
            stroke="rgba(255,255,255,0.04)"
          />
        ))}
        {barTicks.map((t, i) => (
          <text
            key={i}
            x={padL - 8}
            y={yBar(t) + 4}
            fill="#737373"
            fontSize="10"
            textAnchor="end"
            fontFamily="ui-monospace, monospace"
          >
            {t === 0 ? '$0' : fmt$k(t)}
          </text>
        ))}
        {cumTicks.map((t, i) => (
          <text
            key={i}
            x={padL + W + 8}
            y={yLine(t) + 4}
            fill="#a3a3a3"
            fontSize="10"
            textAnchor="start"
            fontFamily="ui-monospace, monospace"
          >
            {t === 0 ? '$0' : fmt$k(t)}
          </text>
        ))}
        <text
          x={padL}
          y={padT - 8}
          fill="#737373"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          Monthly burn
        </text>
        <text
          x={padL + W}
          y={padT - 8}
          fill="#a3a3a3"
          fontSize="10"
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
        >
          Cumulative
        </text>
        <g>
          <line
            x1={todayX}
            x2={todayX}
            y1={padT}
            y2={padT + H}
            stroke="#F4F6FF"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.4"
          />
          <rect
            x={todayX - 22}
            y={padT - 6}
            width="44"
            height="16"
            rx="4"
            fill="#1a1a1a"
            stroke="rgba(255,255,255,0.15)"
          />
          <text
            x={todayX}
            y={padT + 5}
            fill="#F4F6FF"
            fontSize="9"
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
          >
            TODAY
          </text>
        </g>
        {monthsWithCum.map((m, i) => {
          let acc = 0;
          return (
            <g key={i}>
              {CATEGORY_COLORS.map((s) => {
                const v = (m as any)[s.key] || 0;
                if (!v) return null;
                const h = (v / yMaxBar) * H;
                const y = yBar(acc) - h;
                acc += v;
                return (
                  <rect
                    key={s.key}
                    x={xBar(i)}
                    y={y}
                    width={barW}
                    height={h}
                    fill={s.color}
                    opacity={m.actual ? 1 : 0.45}
                  />
                );
              })}
              {!m.actual && (
                <rect
                  x={xBar(i)}
                  y={yBar(m.total)}
                  width={barW}
                  height={H - (yBar(m.total) - padT)}
                  fill="url(#hatch)"
                  pointerEvents="none"
                />
              )}
              <text
                x={xBar(i) + barW / 2}
                y={padT + H + 16}
                fill="#a3a3a3"
                fontSize="10"
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
              >
                {m.m}
              </text>
            </g>
          );
        })}
        <path d={actPath} fill="none" stroke="#F4F6FF" strokeWidth="2.25" strokeLinecap="round" />
        <path
          d={fcPath}
          fill="none"
          stroke="#F4F6FF"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeDasharray="5 4"
          opacity="0.65"
        />
        {linePts.map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r={i <= pulse.lastActualIdx ? 3.5 : 2.5}
            fill="#F4F6FF"
            stroke="#080808"
            strokeWidth="2"
          />
        ))}
      </svg>
    );
  },
);
BurnChart.displayName = 'BurnChart';

/* -------------------------------------------------------------------- */
/*  CATEGORY RIBBON — used inside SpendingViewCard "timeline" view      */
/* -------------------------------------------------------------------- */
const CategoryRibbon: React.FC<{ pulse: PulseData; width?: number }> = React.memo(
  ({ pulse, width = 1100 }) => {
    const cats = CATEGORY_COLORS;
    const labelW = 140;
    const cellW = (width - labelW) / pulse.months.length;
    const rowH = 40;
    const maxBy: Record<string, number> = {};
    cats.forEach((c) => {
      maxBy[c.key] = Math.max(...pulse.months.map((m) => (m as any)[c.key] || 0), 1);
    });

    return (
      <div style={{ minWidth: width }}>
        <div className="flex mb-2" style={{ paddingLeft: labelW }}>
          {pulse.months.map((m, i) => (
            <div
              key={i}
              className="flex items-center justify-center text-[10px] text-[#737373] font-mono"
              style={{ width: cellW }}
            >
              {m.m.split(' ')[0]}
            </div>
          ))}
        </div>
        {cats.map((c) => (
          <div key={c.key} className="flex items-center mb-2">
            <div className="flex items-center gap-2" style={{ width: labelW }}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />
              <span className="text-sm text-[#F4F6FF]">{c.label}</span>
            </div>
            {pulse.months.map((m, i) => {
              const v = (m as any)[c.key] || 0;
              const intensity = maxBy[c.key] ? v / maxBy[c.key] : 0;
              const active = v > 0;
              return (
                <div
                  key={i}
                  className="relative flex items-center justify-center"
                  style={{ width: cellW, height: rowH, padding: '0 2px' }}
                >
                  <div
                    className="w-full h-full rounded-md"
                    style={{
                      background: active
                        ? `color-mix(in oklab, ${c.color} ${Math.max(25, intensity * 100)}%, #0c0c0c)`
                        : 'rgba(255,255,255,0.02)',
                      border: active
                        ? `1px solid ${c.color}30`
                        : '1px solid rgba(255,255,255,0.04)',
                      opacity: m.actual ? 1 : 0.85,
                    }}
                  />
                  {active && intensity > 0.6 && (
                    <div
                      className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-semibold"
                      style={{ color: intensity > 0.7 ? '#080808' : '#F4F6FF' }}
                    >
                      {fmt$k(v)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div className="mt-4 flex items-center" style={{ paddingLeft: labelW }}>
          <div className="relative" style={{ width: cellW * pulse.months.length, height: 1 }}>
            <div
              className="absolute h-4 border-l-2 border-dashed border-[#F4F6FF]/40 -top-1"
              style={{ left: cellW * (pulse.lastActualIdx + 0.6) }}
            />
            <div
              className="absolute -top-5 text-[10px] text-[#a3a3a3] font-mono"
              style={{ left: cellW * (pulse.lastActualIdx + 0.6) - 18 }}
            >
              TODAY
            </div>
          </div>
        </div>
      </div>
    );
  },
);
CategoryRibbon.displayName = 'CategoryRibbon';

/* -------------------------------------------------------------------- */
/*  BURN TABLE — used inside SpendingViewCard "table" view              */
/* -------------------------------------------------------------------- */
const BurnTable: React.FC<{ pulse: PulseData }> = React.memo(({ pulse }) => {
  const { monthsWithCum, forecastEnd } = useMemo(() => computeDerived(pulse), [pulse]);
  const sum = (key: keyof (typeof monthsWithCum)[number]) =>
    monthsWithCum.reduce((a, b) => a + (Number((b as any)[key]) || 0), 0);
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
          <tr className="bg-[rgba(224,185,84,0.05)] border-t border-[#E0B954]/20">
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

/* -------------------------------------------------------------------- */
/*  SPENDING BY CATEGORY — 3-way toggle (timeline / chart / table)      */
/* -------------------------------------------------------------------- */
const SpendingViewCard: React.FC<{ pulse: PulseData }> = ({ pulse }) => {
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
                  ? 'bg-[#E0B954]/15 text-[#E0B954] font-semibold'
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

/* -------------------------------------------------------------------- */
/*  FORECAST VS ACTUALS — Variant E bottom card (1:1 port)              */
/* -------------------------------------------------------------------- */
const ForecastVsActualsChart: React.FC<{ rows: FeatureForecastRow[]; width?: number }> = React.memo(
  ({ rows, width = 1100 }) => {
    const padL = 260,
      padR = 160,
      padT = 12,
      padB = 40;
    const rowH = 36;
    const H = rows.length * rowH;
    const total = H + padT + padB;
    const max = Math.max(...rows.map((r) => Math.max(r.fc, r.act)), 1);
    const yMax = Math.ceil(max / 20) * 20 || 20;
    const W = width - padL - padR;
    const xScale = (v: number) => (v / yMax) * W;
    const totalFC = rows.reduce((a, b) => a + b.fc, 0);
    const totalAct = rows.reduce((a, b) => a + b.act, 0);
    const ticks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

    return (
      <svg width={width} height={total + 40} style={{ display: 'block' }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL + xScale(t)}
              x2={padL + xScale(t)}
              y1={padT}
              y2={padT + H}
              stroke="rgba(255,255,255,0.04)"
            />
            <text
              x={padL + xScale(t)}
              y={padT + H + 16}
              fill="#737373"
              fontSize="10"
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
            >
              {t}h
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = padT + i * rowH + rowH / 2;
          const barH = 10;
          const variance = r.act - r.fc;
          const varPct = r.fc > 0 ? variance / r.fc : 0;
          const over = variance > 0;
          return (
            <g key={i}>
              {i > 0 && (
                <line
                  x1={0}
                  x2={width}
                  y1={padT + i * rowH}
                  y2={padT + i * rowH}
                  stroke="rgba(255,255,255,0.03)"
                />
              )}
              <text x={12} y={y - 2} fill="#F4F6FF" fontSize="12" fontWeight="500">
                {r.feature}
              </text>
              <text x={12} y={y + 12} fill="#737373" fontSize="10">
                {r.employee}
              </text>
              <rect
                x={padL}
                y={y - barH - 1}
                width={xScale(r.fc)}
                height={barH}
                fill="rgba(255,255,255,0.05)"
                stroke="#737373"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
              <rect
                x={padL}
                y={y + 1}
                width={xScale(r.act)}
                height={barH}
                fill={over ? '#FBBF24' : '#34D399'}
                opacity="0.9"
              />
              <g transform={`translate(${padL + W + 12}, ${y - 6})`}>
                <rect
                  x={0}
                  y={0}
                  width={120}
                  height={20}
                  rx={4}
                  fill={over ? 'rgba(251,191,36,0.1)' : 'rgba(52,211,153,0.1)'}
                  stroke={over ? 'rgba(251,191,36,0.3)' : 'rgba(52,211,153,0.3)'}
                />
                <text
                  x={60}
                  y={13}
                  fill={over ? '#FBBF24' : '#34D399'}
                  fontSize="10"
                  textAnchor="middle"
                  fontFamily="ui-monospace, monospace"
                  fontWeight="600"
                >
                  {over ? '+' : ''}
                  {variance}h · {over ? '+' : ''}
                  {Math.round(varPct * 100)}%
                </text>
              </g>
            </g>
          );
        })}
        <g>
          <line x1={0} x2={width} y1={padT + H} y2={padT + H} stroke="rgba(255,255,255,0.1)" />
          <text x={12} y={padT + H + 34} fill="#F4F6FF" fontSize="13" fontWeight="600">
            Total
          </text>
          <text
            x={padL}
            y={padT + H + 34}
            fill="#a3a3a3"
            fontSize="11"
            fontFamily="ui-monospace, monospace"
          >
            Forecast {totalFC}h
          </text>
          <text
            x={padL + 120}
            y={padT + H + 34}
            fill={totalAct > totalFC ? '#FBBF24' : '#34D399'}
            fontSize="11"
            fontFamily="ui-monospace, monospace"
          >
            Actual {totalAct}h ({totalAct - totalFC >= 0 ? '+' : ''}
            {totalAct - totalFC}h)
          </text>
        </g>
      </svg>
    );
  },
);
ForecastVsActualsChart.displayName = 'ForecastVsActualsChart';

const ForecastVsActualsCard: React.FC<{ pulse: PulseData }> = ({ pulse }) => {
  const [scope, setScope] = useState<'current' | 'last' | 'project'>('current');
  const SCOPES = [
    { id: 'current' as const, label: 'Current month', sub: `${pulse.summary.monthLabel} (MTD)` },
    { id: 'last' as const, label: 'Last month', sub: 'Previous period' },
    { id: 'project' as const, label: 'Entire project', sub: 'To date' },
  ];
  const rows = pulse.forecastVsActuals[scope];
  const activeScope = SCOPES.find((s) => s.id === scope)!;
  const totalFC = rows.reduce((a, b) => a + b.fc, 0);
  const totalAct = rows.reduce((a, b) => a + b.act, 0);
  const variance = totalAct - totalFC;
  const under = variance < 0;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Forecasted vs Actuals · Dev hours by feature
          </h3>
          <p className="text-xs text-[#737373] mt-0.5">
            {activeScope.sub} · {rows.length} features ·{' '}
            {under ? `${Math.abs(variance)}h under forecast` : `${variance}h over forecast`}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-4 text-xs text-[#a3a3a3]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-2 border border-dashed border-[#737373] bg-white/5" />
              Forecast
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-2 bg-[#34D399]" />
              Actual (under)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-2 bg-[#FBBF24]" />
              Actual (over)
            </span>
          </div>
          <div className="flex items-center p-0.5 rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)]">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={
                  'px-3 py-1.5 text-xs rounded-md transition-colors ' +
                  (scope === s.id
                    ? 'bg-[#E0B954]/15 text-[#E0B954] font-semibold'
                    : 'text-[#a3a3a3] hover:text-white')
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-xs text-[#737373]">No data for this period.</div>
        ) : (
          <ForecastVsActualsChart rows={rows} width={1100} />
        )}
      </div>
    </Card>
  );
};

/* -------------------------------------------------------------------- */
/*  PROJECT PULSE VIEW — Variant E (Combined / recommended)             */
/* -------------------------------------------------------------------- */
// React.memo so this parent bails out when ProjectDetail re-renders for
// unrelated reasons — its `pulse` prop is referentially stable (useMergedPulse
// memoizes it), so the already-memoized child charts stop re-rendering too.
// When pulse actually changes (sync/override), identity changes and it re-renders.
const ProjectPulseView: React.FC<{ pulse: PulseData }> = React.memo(({ pulse }) => {
  return (
    <div className="space-y-5">
      {/* Page header — breadcrumb + title + subtitle (Variant E) */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#737373]">
            <span>Financials</span>
            <span>›</span>
            <span className="text-[#a3a3a3]">Monthly Burn</span>
          </div>
          <h2 className="text-xl font-semibold text-white mt-1">Monthly Burn · Dev + GTM</h2>
          <p className="text-sm text-[#737373] mt-0.5">
            {pulse.project.contractStart} → {pulse.project.contractEnd} · Read-only · Synced from
            time tracking & billing
          </p>
        </div>
        <div className="text-xs text-[#737373]">
          Last sync: <span className="text-[#a3a3a3] font-mono">2h ago</span>
        </div>
      </div>

      {/* Unified hero (first box) */}
      <ProjectHeroCard pulse={pulse} />

      {/* Spending by category — 3-way toggle */}
      <SpendingViewCard pulse={pulse} />

      {/* Forecasted vs Actuals — dev hours by feature */}
      <ForecastVsActualsCard pulse={pulse} />
    </div>
  );
});

ProjectPulseView.displayName = 'ProjectPulseView';

export default ProjectPulseView;
