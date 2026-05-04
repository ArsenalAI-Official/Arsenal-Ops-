import React, { useState } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { PulseData, computeDerived } from './pulseData';

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

const SEVERITY_COLOR: Record<string, string> = { high: '#F87171', medium: '#FBBF24', low: '#a3a3a3' };

interface ProjectPulseViewProps {
    pulse: PulseData;
}

const HealthRing: React.FC<{ score: number; size?: number; stroke?: number }> = ({ score, size = 96, stroke = 8 }) => {
    const r = (size - stroke) / 2;
    const C = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, score)) / 100;
    const color = score >= 80 ? '#34D399' : score >= 60 ? '#FBBF24' : '#EF4444';
    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
                <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
                    strokeDasharray={C} strokeDashoffset={C * (1 - pct)} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white tabular-nums">{score}</div>
        </div>
    );
};

const SeverityDot: React.FC<{ severity: string }> = ({ severity }) => (
    <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: SEVERITY_COLOR[severity] }} />
);

const StatusTile: React.FC<{ kicker: string; label: string; value: string; sub: string; trendColor: string; trendText: string }> = ({ kicker, label, value, sub, trendColor, trendText }) => (
    <div className="rounded-xl p-5 border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.015)]">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[#737373] font-mono">{kicker}</div>
        <div className="text-[11px] text-[#a3a3a3] mt-2">{label}</div>
        <div className="text-2xl font-bold text-white tabular-nums mt-1 tracking-tight">{value}</div>
        <div className="text-[11px] text-[#737373] mt-1">{sub}</div>
        <div className="text-[11px] mt-3 font-mono" style={{ color: trendColor }}>{trendText}</div>
    </div>
);

const MiniBurnChart: React.FC<{ pulse: PulseData; height?: number }> = ({ pulse, height = 220 }) => {
    const { monthsWithCum, contractTotal } = computeDerived(pulse);
    const W = 1000, H = height, padL = 40, padR = 20, padT = 10, padB = 30;
    const w = W - padL - padR;
    const h = H - padT - padB;
    const max = Math.max(...monthsWithCum.map(m => m.total), 1);
    const step = monthsWithCum.length > 1 ? w / (monthsWithCum.length - 1) : w;

    const cumPts = monthsWithCum.map((m, i) => ({
        x: padL + i * step,
        y: padT + h - (m.cum / Math.max(contractTotal, m.cum, 1)) * h,
    }));
    const actPath = cumPts.slice(0, pulse.lastActualIdx + 1).map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ' ' + p.y).join(' ');
    const fcPath = cumPts.slice(pulse.lastActualIdx).map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ' ' + p.y).join(' ');
    const barW = Math.max(10, step * 0.5);

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
            {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
                <line key={i} x1={padL} x2={W - padR} y1={padT + h * (1 - t)} y2={padT + h * (1 - t)} stroke="rgba(255,255,255,0.04)" />
            ))}
            {monthsWithCum.map((m, i) => {
                const h_ = (m.total / max) * h * 0.7;
                return (
                    <rect key={i} x={padL + i * step - barW / 2} y={padT + h - h_} width={barW} height={h_}
                        fill={i <= pulse.lastActualIdx ? '#E0B954' : 'rgba(224,185,84,0.25)'} rx="2" />
                );
            })}
            <path d={actPath} fill="none" stroke="#F4F6FF" strokeWidth="2" />
            <path d={fcPath} fill="none" stroke="#F4F6FF" strokeWidth="2" strokeDasharray="4 3" opacity="0.65" />
            {monthsWithCum.map((m, i) => (
                <text key={i} x={padL + i * step} y={H - 8} fill="#737373" fontSize="10" textAnchor="middle" fontFamily="ui-monospace, monospace">{m.m.split(' ')[0]}</text>
            ))}
        </svg>
    );
};

const BurnChart: React.FC<{ pulse: PulseData; width?: number; height?: number }> = ({ pulse, width = 1100, height = 340 }) => {
    const { monthsWithCum } = computeDerived(pulse);
    const padL = 56, padR = 56, padT = 24, padB = 44;
    const W = width - padL - padR;
    const H = height - padT - padB;

    const maxStack = Math.max(...monthsWithCum.map(m => m.total), 1);
    const maxCum = monthsWithCum[monthsWithCum.length - 1]?.cum || 1;
    const yMaxBar = Math.ceil(maxStack / 10000) * 10000 || 10000;
    const yMaxCum = Math.ceil(maxCum / 50000) * 50000 || 50000;

    const bw = W / monthsWithCum.length;
    const barW = bw * 0.62;

    const xBar = (i: number) => padL + bw * i + bw / 2 - barW / 2;
    const yBar = (v: number) => padT + H - (v / yMaxBar) * H;
    const yLine = (v: number) => padT + H - (v / yMaxCum) * H;

    const linePts = monthsWithCum.map((m, i) => [padL + bw * i + bw / 2, yLine(m.cum)] as [number, number]);
    const actPath = linePts.slice(0, pulse.lastActualIdx + 1).map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1]).join(' ');
    const fcPath = linePts.slice(pulse.lastActualIdx).map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1]).join(' ');

    const barTicks = [0, yMaxBar * 0.25, yMaxBar * 0.5, yMaxBar * 0.75, yMaxBar];
    const cumTicks = [0, yMaxCum * 0.25, yMaxCum * 0.5, yMaxCum * 0.75, yMaxCum];
    const todayX = padL + bw * pulse.lastActualIdx + bw / 2 + bw * 0.35;

    return (
        <svg width={width} height={height} style={{ display: 'block' }}>
            <defs>
                <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
                </pattern>
            </defs>
            {barTicks.map((t, i) => (
                <line key={i} x1={padL} x2={padL + W} y1={yBar(t)} y2={yBar(t)} stroke="rgba(255,255,255,0.04)" />
            ))}
            {barTicks.map((t, i) => (
                <text key={i} x={padL - 8} y={yBar(t) + 4} fill="#737373" fontSize="10" textAnchor="end" fontFamily="ui-monospace, monospace">
                    {t === 0 ? '$0' : fmt$k(t)}
                </text>
            ))}
            {cumTicks.map((t, i) => (
                <text key={i} x={padL + W + 8} y={yLine(t) + 4} fill="#a3a3a3" fontSize="10" textAnchor="start" fontFamily="ui-monospace, monospace">
                    {t === 0 ? '$0' : fmt$k(t)}
                </text>
            ))}
            <text x={padL} y={padT - 8} fill="#737373" fontSize="10" fontFamily="ui-monospace, monospace">Monthly burn</text>
            <text x={padL + W} y={padT - 8} fill="#a3a3a3" fontSize="10" textAnchor="end" fontFamily="ui-monospace, monospace">Cumulative</text>

            <g>
                <line x1={todayX} x2={todayX} y1={padT} y2={padT + H} stroke="#F4F6FF" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
                <rect x={todayX - 22} y={padT - 6} width="44" height="16" rx="4" fill="#1a1a1a" stroke="rgba(255,255,255,0.15)" />
                <text x={todayX} y={padT + 5} fill="#F4F6FF" fontSize="9" textAnchor="middle" fontFamily="ui-monospace, monospace">TODAY</text>
            </g>

            {monthsWithCum.map((m, i) => {
                let acc = 0;
                return (
                    <g key={i}>
                        {CATEGORY_COLORS.map(s => {
                            const v = (m as any)[s.key] || 0;
                            if (!v) return null;
                            const h = (v / yMaxBar) * H;
                            const y = yBar(acc) - h;
                            acc += v;
                            return <rect key={s.key} x={xBar(i)} y={y} width={barW} height={h} fill={s.color} opacity={m.actual ? 1 : 0.45} />;
                        })}
                        {!m.actual && (
                            <rect x={xBar(i)} y={yBar(m.total)} width={barW} height={H - (yBar(m.total) - padT)} fill="url(#hatch)" pointerEvents="none" />
                        )}
                        <text x={xBar(i) + barW / 2} y={padT + H + 16} fill="#a3a3a3" fontSize="10" textAnchor="middle" fontFamily="ui-monospace, monospace">{m.m}</text>
                    </g>
                );
            })}

            <path d={actPath} fill="none" stroke="#F4F6FF" strokeWidth="2.25" strokeLinecap="round" />
            <path d={fcPath} fill="none" stroke="#F4F6FF" strokeWidth="2.25" strokeLinecap="round" strokeDasharray="5 4" opacity="0.65" />
            {linePts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={i <= pulse.lastActualIdx ? 3.5 : 2.5} fill="#F4F6FF" stroke="#080808" strokeWidth="2" />
            ))}
        </svg>
    );
};

const CategoryRibbon: React.FC<{ pulse: PulseData; width?: number }> = ({ pulse, width = 1100 }) => {
    const cats = CATEGORY_COLORS;
    const labelW = 140;
    const cellW = (width - labelW) / pulse.months.length;
    const rowH = 40;
    const maxBy: Record<string, number> = {};
    cats.forEach(c => { maxBy[c.key] = Math.max(...pulse.months.map(m => (m as any)[c.key] || 0), 1); });

    return (
        <div style={{ minWidth: width }}>
            <div className="flex mb-2" style={{ paddingLeft: labelW }}>
                {pulse.months.map((m, i) => (
                    <div key={i} className="flex items-center justify-center text-[10px] text-[#737373] font-mono" style={{ width: cellW }}>
                        {m.m.split(' ')[0]}
                    </div>
                ))}
            </div>
            {cats.map(c => (
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
                            <div key={i} className="relative flex items-center justify-center" style={{ width: cellW, height: rowH, padding: '0 2px' }}>
                                <div className="w-full h-full rounded-md"
                                    style={{
                                        background: active ? `color-mix(in oklab, ${c.color} ${Math.max(25, intensity * 100)}%, #0c0c0c)` : 'rgba(255,255,255,0.02)',
                                        border: active ? `1px solid ${c.color}30` : '1px solid rgba(255,255,255,0.04)',
                                        opacity: m.actual ? 1 : 0.85,
                                    }} />
                                {active && intensity > 0.6 && (
                                    <div className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-semibold"
                                        style={{ color: intensity > 0.7 ? '#080808' : '#F4F6FF' }}>
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
                    <div className="absolute h-4 border-l-2 border-dashed border-[#F4F6FF]/40 -top-1"
                        style={{ left: cellW * (pulse.lastActualIdx + 0.6) }} />
                    <div className="absolute -top-5 text-[10px] text-[#a3a3a3] font-mono"
                        style={{ left: cellW * (pulse.lastActualIdx + 0.6) - 18 }}>TODAY</div>
                </div>
            </div>
        </div>
    );
};

const BurnTable: React.FC<{ pulse: PulseData }> = ({ pulse }) => {
    const { monthsWithCum, forecastEnd } = computeDerived(pulse);
    const sum = (key: keyof typeof monthsWithCum[number]) => monthsWithCum.reduce((a, b) => a + (Number((b as any)[key]) || 0), 0);
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
                        <th className="text-right font-medium px-3 border-l border-[rgba(255,255,255,0.05)]">Monthly</th>
                        <th className="text-right font-medium py-2.5 px-5">Cumulative</th>
                    </tr>
                </thead>
                <tbody>
                    {monthsWithCum.map((m, i) => {
                        const statusColor = m.actual && !m.partial ? '#34D399' : m.partial ? '#FBBF24' : '#737373';
                        return (
                            <tr key={i} className={'border-b border-[rgba(255,255,255,0.03)] ' + (m.actual ? 'text-white' : 'text-[#a3a3a3]')}>
                                <td className="py-2.5 px-5">
                                    <div className="flex items-center gap-2.5">
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                                        <span className="font-medium font-mono">{m.m}</span>
                                        {m.partial && <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-[#FBBF24]/15 text-[#FBBF24]">MTD</span>}
                                    </div>
                                </td>
                                <td className="text-right px-3 font-mono">{m.devFC || '—'}</td>
                                <td className="text-right px-3 font-mono">{m.devAct ?? '—'}</td>
                                <td className="text-right px-3 font-mono">{m.dev ? fmt$(m.dev) : '—'}</td>
                                <td className="text-right px-3 font-mono">{m.ba ? fmt$(m.ba) : '—'}</td>
                                <td className="text-right px-3 font-mono">{m.mgmt ? fmt$(m.mgmt) : '—'}</td>
                                <td className="text-right px-3 font-mono">{m.ad ? fmt$(m.ad) : '—'}</td>
                                <td className="text-right px-3 font-mono">{m.gtm ? fmt$(m.gtm) : '—'}</td>
                                <td className="text-right px-3 font-mono font-semibold border-l border-[rgba(255,255,255,0.05)]">{fmt$(m.total)}</td>
                                <td className="text-right py-2.5 px-5 font-mono font-semibold text-white">{fmt$(m.cum)}</td>
                            </tr>
                        );
                    })}
                    <tr className="bg-[rgba(224,185,84,0.05)] border-t border-[#E0B954]/20">
                        <td className="py-3 px-5 text-sm font-semibold text-white">Total</td>
                        <td className="text-right px-3 font-mono text-[#a3a3a3]">{sum('devFC')}</td>
                        <td className="text-right px-3 font-mono text-[#a3a3a3]">{monthsWithCum.reduce((a, b) => a + (b.devAct || 0), 0)}</td>
                        <td className="text-right px-3 font-mono text-white">{fmt$(sum('dev'))}</td>
                        <td className="text-right px-3 font-mono text-white">{fmt$(sum('ba'))}</td>
                        <td className="text-right px-3 font-mono text-white">{fmt$(sum('mgmt'))}</td>
                        <td className="text-right px-3 font-mono text-white">{fmt$(sum('ad'))}</td>
                        <td className="text-right px-3 font-mono text-white">{fmt$(sum('gtm'))}</td>
                        <td className="text-right px-3 font-mono font-bold text-white border-l border-[rgba(255,255,255,0.05)]">{fmt$(forecastEnd)}</td>
                        <td className="text-right py-3 px-5 font-mono font-bold text-white">{fmt$(forecastEnd)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

const SpendingViewCard: React.FC<{ pulse: PulseData }> = ({ pulse }) => {
    const [view, setView] = useState<'timeline' | 'chart' | 'table'>('timeline');
    const SUB: Record<string, string> = {
        timeline: 'When each category is active across the contract',
        chart: 'Stacked monthly spend with cumulative forecast',
        table: 'Every line item by month — the numeric source of truth',
    };
    const TABS = [
        { id: 'timeline' as const, label: 'Timeline ribbon' },
        { id: 'chart' as const, label: 'Stacked chart' },
        { id: 'table' as const, label: 'Table' },
    ];
    return (
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5">
            <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-white">Spending by category</h3>
                    <p className="text-xs text-[#737373] mt-0.5">{SUB[view]}</p>
                </div>
                <div className="flex items-center p-0.5 rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)]">
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setView(t.id)}
                            className={'px-3 py-1.5 text-xs rounded-md transition-colors ' +
                                (view === t.id ? 'bg-[#E0B954]/15 text-[#E0B954] font-semibold' : 'text-[#a3a3a3] hover:text-white')}>
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>
            {view === 'timeline' && (
                <div className="overflow-x-auto"><CategoryRibbon pulse={pulse} width={1100} /></div>
            )}
            {view === 'chart' && (
                <div className="overflow-x-auto"><BurnChart pulse={pulse} width={1100} /></div>
            )}
            {view === 'table' && (
                <div className="-mx-5 -mb-5"><BurnTable pulse={pulse} /></div>
            )}
        </div>
    );
};

const ProjectPulseView: React.FC<ProjectPulseViewProps> = ({ pulse }) => {
    const { contractTotal, burnedToDate, forecastEnd, monthsWithCum } = computeDerived(pulse);
    const burnedPct = contractTotal > 0 ? burnedToDate / contractTotal : 0;
    const variance = contractTotal - forecastEnd;
    const underBudget = variance >= 0;
    const lastMonth = monthsWithCum[pulse.lastActualIdx];

    const summary = pulse.summary;
    const project = pulse.project;

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <div className="flex items-center gap-2 text-xs text-[#737373]">
                        <span>Pulse</span>
                        <span>›</span>
                        <span className="text-[#a3a3a3]">Briefing</span>
                    </div>
                    <h2 className="text-xl font-semibold text-white mt-1">{summary.monthLabel} · Monthly Pulse</h2>
                    <p className="text-sm text-[#737373] mt-0.5">{project.contractStart} → {project.contractEnd} · Project is tracking {underBudget ? 'healthy' : 'at risk'}</p>
                </div>
            </div>

            {/* Executive hero */}
            <div className="rounded-2xl p-8 border border-[rgba(255,255,255,0.06)] bg-gradient-to-br from-[rgba(224,185,84,0.05)] to-transparent">
                <div className="flex items-start gap-8 flex-wrap">
                    <HealthRing score={summary.healthScore} size={96} stroke={8} />
                    <div className="flex-1 min-w-[280px]">
                        <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${summary.healthStatus === 'Healthy' ? 'bg-[#34D399]/15 text-[#34D399]' : summary.healthStatus === 'At Risk' ? 'bg-[#FBBF24]/15 text-[#FBBF24]' : 'bg-[#EF4444]/15 text-[#EF4444]'}`}>{summary.healthStatus}</span>
                            <span className="text-xs text-[#737373] font-mono">MONTH {summary.monthIndex} OF {summary.totalMonths}</span>
                        </div>
                        <h3 className="text-2xl font-bold text-white mt-3 tracking-tight leading-tight max-w-2xl">
                            Tracking {underBudget ? 'under' : 'over'} contract by{' '}
                            <span className={underBudget ? 'text-[#34D399]' : 'text-[#FBBF24]'}>{fmt$(Math.abs(variance))}</span>,{' '}
                            {summary.deliveryPct}% of planned work shipped, and {summary.openBugs} open bug{summary.openBugs === 1 ? '' : 's'}.
                        </h3>
                        <p className="text-[#a3a3a3] mt-3 max-w-2xl text-sm leading-relaxed">
                            {summary.monthLabel} · {summary.deliveryCompleted} of {summary.deliveryTotal} items shipped, {summary.pointsCompleted} of {summary.pointsTotal} points completed. {summary.activeSprints} active sprint{summary.activeSprints === 1 ? '' : 's'}. {pulse.risks.filter(r => r.severity === 'high').length} high-severity risk{pulse.risks.filter(r => r.severity === 'high').length === 1 ? '' : 's'} open.
                        </p>
                    </div>
                </div>
            </div>

            {/* 4 status tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusTile
                    kicker="Money"
                    label="Burned to date"
                    value={fmt$(burnedToDate)}
                    sub={`${fmtPct(burnedPct)} of ${fmt$(contractTotal)} contract`}
                    trendColor={underBudget ? '#34D399' : '#FBBF24'}
                    trendText={`${underBudget ? '↓' : '↑'} ${fmt$(Math.abs(variance))} vs contract`}
                />
                <StatusTile
                    kicker="Progress"
                    label="On-time delivery"
                    value={`${summary.deliveryPct}%`}
                    sub={`${summary.deliveryCompleted} / ${summary.deliveryTotal} items shipped`}
                    trendColor={summary.overdueCount === 0 ? '#34D399' : '#FBBF24'}
                    trendText={`${summary.overdueCount} overdue`}
                />
                <StatusTile
                    kicker="Risks"
                    label="Open bugs / critical"
                    value={`${summary.openBugs} / ${summary.criticalOpen}`}
                    sub="bugs · critical items"
                    trendColor={summary.openBugs + summary.criticalOpen === 0 ? '#34D399' : '#FBBF24'}
                    trendText={summary.openBugs + summary.criticalOpen === 0 ? 'All clear' : 'Attention needed'}
                />
                <StatusTile
                    kicker="People"
                    label={`Hours burned (${summary.monthLabel.split(' ')[0]} MTD)`}
                    value={`${lastMonth?.devAct || 0}h`}
                    sub={`of ${lastMonth?.devFC || 0}h forecast`}
                    trendColor="#a3a3a3"
                    trendText={`Plan: ${lastMonth?.devFC || 0}h`}
                />
            </div>

            {/* Stakeholder summary strip */}
            <div className="rounded-2xl p-6 border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.015)]">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-[#E0B954]/15 flex items-center justify-center">
                            <Activity className="w-3.5 h-3.5 text-[#E0B954]" />
                        </div>
                        <div className="text-sm font-semibold text-white">Stakeholder Summary</div>
                    </div>
                    <div className="text-xs text-[#737373]">Rolls up to month-end report</div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-6">
                        <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-[#737373]">Overall completion</span>
                            <span className="text-white font-semibold tabular-nums">{summary.overallCompletion}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
                            <div className="h-full bg-[#E0B954]" style={{ width: `${summary.overallCompletion}%` }} />
                        </div>
                    </div>
                    <div className="lg:col-span-6 grid grid-cols-3 gap-4">
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-[#737373]">Total work items</div>
                            <div className="text-lg font-bold text-white tabular-nums mt-1">{summary.workItems}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-[#737373]">Points completed</div>
                            <div className="text-lg font-bold text-white tabular-nums mt-1">{summary.pointsCompleted} / {summary.pointsTotal}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-[#737373]">Active sprints</div>
                            <div className="text-lg font-bold text-white tabular-nums mt-1">{summary.activeSprints}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Two-col: Burn chart + Risks log */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-8 rounded-2xl p-6 border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.015)]">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <div className="text-sm font-semibold text-white">Contract burn — {pulse.months.length} months</div>
                        <div className="text-xs text-[#a3a3a3] font-mono tabular-nums">{fmt$k(burnedToDate)} / {fmt$k(contractTotal)}</div>
                    </div>
                    <MiniBurnChart pulse={pulse} height={220} />
                </div>
                <div className="lg:col-span-4 rounded-2xl p-6 border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.015)]">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-sm font-semibold text-white">Risks · {pulse.risks.length}</div>
                        <div className="text-xs text-[#737373]">{pulse.risks.filter(r => r.severity === 'high').length} high</div>
                    </div>
                    <div className="space-y-3">
                        {pulse.risks.length === 0 ? (
                            <div className="text-center py-6 text-xs text-[#737373]">
                                <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                No active risks
                            </div>
                        ) : pulse.risks.map((r, i) => (
                            <div key={i} className="pb-3 border-b border-[rgba(255,255,255,0.04)] last:border-b-0 last:pb-0">
                                <div className="flex items-start gap-2">
                                    <span className="mt-2"><SeverityDot severity={r.severity} /></span>
                                    <div className="flex-1">
                                        <div className="text-[13px] text-white leading-snug">{r.title}</div>
                                        <div className="text-[11px] text-[#737373] mt-1">{r.owner} · due {r.due}</div>
                                        {r.note && <div className="text-[11px] text-[#a3a3a3] mt-1 italic">{r.note}</div>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Spending by category — Timeline / Chart / Table toggle */}
            <SpendingViewCard pulse={pulse} />
        </div>
    );
};

export default ProjectPulseView;
