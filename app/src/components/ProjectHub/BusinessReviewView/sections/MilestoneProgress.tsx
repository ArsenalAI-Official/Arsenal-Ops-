import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Clock, Target } from 'lucide-react';
import type { Milestone } from '../types';

interface MilestoneProgressProps {
  milestones: Milestone[];
  completedMilestones: number;
  totalMilestones: number;
  milestonePct: number;
  today: Date;
}

const MilestoneProgress: React.FC<MilestoneProgressProps> = ({
  milestones,
  completedMilestones,
  totalMilestones,
  milestonePct,
  today,
}) => {
  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#C79E3B]/10 flex items-center justify-center">
            <Target className="w-4 h-4 text-[#C79E3B]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Milestone Progress</h3>
            <p className="text-xs text-[#737373]">
              {completedMilestones} of {totalMilestones} completed
            </p>
          </div>
        </div>
        <Badge
          className={`border-0 ${
            milestonePct >= 50 ? 'bg-[#E0B954]/20 text-[#E0B954]' : 'bg-[#F59E0B]/20 text-[#F59E0B]'
          }`}
        >
          {milestonePct}%
        </Badge>
      </div>
      <div className="space-y-3">
        {milestones.slice(0, 8).map((milestone) => {
          const isOverdue =
            milestone.due_date && !milestone.is_completed && new Date(milestone.due_date) < today;
          return (
            <div key={milestone.id} className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  milestone.is_completed
                    ? 'bg-[#E0B954]/20'
                    : isOverdue
                      ? 'bg-[#EF4444]/20'
                      : 'bg-[#737373]/20'
                }`}
              >
                {milestone.is_completed ? (
                  <CheckCircle2 className="w-3 h-3 text-[#E0B954]" />
                ) : isOverdue ? (
                  <AlertTriangle className="w-3 h-3 text-[#EF4444]" />
                ) : (
                  <Clock className="w-3 h-3 text-[#737373]" />
                )}
              </div>
              <span
                className={`text-sm flex-1 ${
                  milestone.is_completed ? 'text-[#737373] line-through' : 'text-[#f5f5f5]'
                }`}
              >
                {milestone.title}
              </span>
              {milestone.due_date && (
                <span className={`text-xs ${isOverdue ? 'text-[#EF4444]' : 'text-[#737373]'}`}>
                  {new Date(milestone.due_date).toLocaleDateString()}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MilestoneProgress;
