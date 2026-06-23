import React from 'react';
import { PulseData } from '../pulseData';
import { ForecastVsActualsCard } from './sections/ForecastVsActualsCard';
import { ProjectHeroCard } from './sections/ProjectHeroCard';
import { SpendingViewCard } from './sections/SpendingViewCard';

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
