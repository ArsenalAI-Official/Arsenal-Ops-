import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';
import type { HealthMeta } from '../lib/health';
import type { ProjectAnalyticsResponse } from '@/client';

interface KpiCardsProps {
  health: HealthMeta;
  healthScore: number;
  onTimeDeliveryPct: number;
  analytics: ProjectAnalyticsResponse | null;
  overdueItems: number;
  openBugs: number;
  criticalOpen: number;
  onShowHealthExplanation: () => void;
  onShowOverdueDialog: () => void;
  onShowBugsDialog: () => void;
  onShowCriticalDialog: () => void;
}

const KpiCards: React.FC<KpiCardsProps> = ({
  health,
  healthScore,
  onTimeDeliveryPct,
  analytics,
  overdueItems,
  openBugs,
  criticalOpen,
  onShowHealthExplanation,
  onShowOverdueDialog,
  onShowBugsDialog,
  onShowCriticalDialog,
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Health Score */}
      <div
        onClick={onShowHealthExplanation}
        className={`bg-[rgba(255,255,255,0.02)] border ${health.borderColor} ${health.bgColor} rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer hover:bg-[rgba(255,255,255,0.04)] transition-all`}
      >
        <div className="relative w-20 h-20 mb-3">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="10"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={health.color}
              strokeWidth="10"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - healthScore / 100)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold text-white">{healthScore}</span>
          </div>
        </div>
        <p className="text-sm font-semibold text-white">Project Health</p>
        <span
          className="mt-1 text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${health.color}20`, color: health.color }}
        >
          {health.label}
        </span>
        <div className="mt-2 flex items-center gap-1 text-xs text-[#737373] hover:text-white transition-colors">
          <HelpCircle className="w-3 h-3" />
          Click to see calculation
        </div>
      </div>

      {/* On-Time Delivery */}
      <div
        onClick={onShowOverdueDialog}
        className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 cursor-pointer hover:bg-[rgba(255,255,255,0.04)] transition-all"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-[#34D399]/10 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-[#34D399]" />
          </div>
          <span className="text-xs text-[#737373]">On-Time Delivery & Overdue</span>
        </div>
        <div className="space-y-2">
          <div>
            <p className="text-2xl font-bold text-white">{onTimeDeliveryPct}%</p>
            <p className="text-xs text-[#737373]">
              {analytics?.status_distribution?.done || 0} / {analytics?.total_items || 0} completed
            </p>
          </div>
          <div className="border-t border-[rgba(255,255,255,0.05)] pt-2">
            <p className="text-xs text-[#EF4444] font-medium">{overdueItems} overdue</p>
          </div>
        </div>
      </div>

      {/* Open Bugs */}
      <div
        onClick={onShowBugsDialog}
        className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 cursor-pointer hover:bg-[rgba(255,255,255,0.04)] transition-all"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-[#EF4444]/10 flex items-center justify-center">
            <AlertCircle className="w-4 h-4 text-[#EF4444]" />
          </div>
          <span className="text-xs text-[#737373]">Open Bugs</span>
        </div>
        <p className="text-2xl font-bold text-white">{openBugs}</p>
        <p className="text-xs text-[#737373] mt-1">issues to resolve</p>
      </div>

      {/* Critical Items */}
      <div
        onClick={onShowCriticalDialog}
        className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 cursor-pointer hover:bg-[rgba(255,255,255,0.04)] transition-all"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-[#F97316]/10 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-[#F97316]" />
          </div>
          <span className="text-xs text-[#737373]">Critical Items Open</span>
        </div>
        <p className="text-2xl font-bold text-white">{criticalOpen}</p>
        <p className="text-xs text-[#737373] mt-1">awaiting attention</p>
      </div>
    </div>
  );
};

export default KpiCards;
