import React from 'react';
import { Activity } from 'lucide-react';
import type { ProjectAnalytics, Sprint } from '../types';

interface StakeholderSummaryProps {
  completionPct: number;
  activeSprint: Sprint | undefined;
  analytics: ProjectAnalytics | null;
  sprints: Sprint[];
}

const StakeholderSummary: React.FC<StakeholderSummaryProps> = ({
  completionPct,
  activeSprint,
  analytics,
  sprints,
}) => {
  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-[#E0B954]/10 flex items-center justify-center">
          <Activity className="w-4 h-4 text-[#E0B954]" />
        </div>
        <h3 className="text-sm font-semibold text-white">Stakeholder Summary</h3>
      </div>
      <div className="space-y-3">
        <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4">
          <p className="text-xs text-[#737373] mb-2">Overall Completion</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#E0B954] to-[#E0B954] rounded-full transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <span className="text-sm font-bold text-white">{completionPct}%</span>
          </div>
        </div>
        {activeSprint && (
          <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4">
            <p className="text-xs text-[#737373] mb-1">Active Sprint</p>
            <p className="text-sm font-semibold text-white">{activeSprint.name}</p>
            <p className="text-xs text-[#E0B954] mt-1">{activeSprint.completion_pct}% complete</p>
          </div>
        )}
        <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4">
          <p className="text-xs text-[#737373] mb-2">Key Metrics</p>
          <ul className="space-y-2">
            {[
              { label: 'Total Work Items', value: analytics?.total_items || 0 },
              {
                label: 'Points Completed',
                value: `${analytics?.completed_points || 0} / ${analytics?.total_story_points || 0}`,
              },
              {
                label: 'Active Sprints',
                value: sprints.filter((s) => s.status === 'active').length,
              },
            ].map(({ label, value }) => (
              <li key={label} className="flex items-center justify-between text-sm">
                <span className="text-[#a3a3a3]">{label}</span>
                <span className="text-white font-medium">{value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default StakeholderSummary;
