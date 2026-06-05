import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getInitials } from '@/lib/stringUtils';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

interface WorkloadData {
  developer_id: number | string;
  developer_name: string;
  total_items: number;
  completed_items: number;
  in_progress_items: number;
  todo_items: number;
  overdue_items: number;
  estimated_hours: number;
  logged_hours: number;
  remaining_hours: number;
  this_week_in_progress_hours?: number; // Estimated hours on in-progress tickets
  this_week_done_hours?: number; // Actual logged hours on done tickets this week
  this_week_capacity_used?: number; // Total capacity used this week
  this_week_remaining_capacity?: number; // Remaining capacity (40h - used)
}

interface WorkloadViewProps {
  workloadData: WorkloadData[];
  onDeveloperClick?: (developerId: number | string) => void;
}

const INITIAL_SHOW = 3;

const WorkloadView: React.FC<WorkloadViewProps> = ({ workloadData, onDeveloperClick }) => {
  const [showAll, setShowAll] = useState(false);
  const getCapacityColor = (percentage: number) => {
    if (percentage > 100) return 'text-red-400';
    if (percentage > 80) return 'text-yellow-400';
    return 'text-[#E0B954]';
  };

  const getCapacityBarColor = (percentage: number) => {
    if (percentage > 100) return 'bg-red-500';
    if (percentage > 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Sort by weekly capacity used (highest first)
  const sortedData = [...workloadData].sort(
    (a, b) => (b.this_week_capacity_used ?? 0) - (a.this_week_capacity_used ?? 0),
  );
  const visibleData = showAll ? sortedData : sortedData.slice(0, INITIAL_SHOW);

  return (
    <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Users className="w-5 h-5" />
          Workload View
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sortedData.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users className="text-[#737373]" />
              </EmptyMedia>
              <EmptyTitle className="text-[#737373]">No workload data available</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleData.map((developer) => {
              // 40 hours/week capacity
              const weeklyCapacity = 40;
              const capacityUsed = developer.this_week_capacity_used ?? 0;
              const capacityPercentage = Math.round((capacityUsed / weeklyCapacity) * 100);
              const remaining = developer.this_week_remaining_capacity ?? 0;

              return (
                <div
                  key={developer.developer_id}
                  className="bg-[#0A0A14] rounded-lg p-4 border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.08)] transition-colors cursor-pointer"
                  onClick={() => onDeveloperClick?.(developer.developer_id)}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar className="w-10 h-10 bg-[#E0B954]">
                      <AvatarFallback className="bg-[#E0B954] text-white text-sm font-medium">
                        {getInitials(developer.developer_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="text-white font-medium">{developer.developer_name}</h3>
                      <p className="text-[#737373] text-sm">{developer.total_items} items</p>
                    </div>
                    {developer.overdue_items > 0 && (
                      <Badge
                        variant="outline"
                        className="bg-red-500/20 text-red-400 border-red-500/30"
                      >
                        {developer.overdue_items} overdue
                      </Badge>
                    )}
                  </div>

                  {/* Weekly Capacity Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[#737373] text-sm">This Week's Capacity</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-[#737373]" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-[#121212] border-[rgba(255,255,255,0.08)] text-white max-w-xs">
                              <p>
                                Estimated hours on in-progress tickets + actual logged hours on
                                completed tickets this week.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span
                        className={`text-sm font-medium ${getCapacityColor(capacityPercentage)}`}
                      >
                        {capacityPercentage}%
                      </span>
                    </div>
                    <div className="h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getCapacityBarColor(capacityPercentage)}`}
                        style={{ width: `${Math.min(100, capacityPercentage)}%` }}
                      />
                    </div>
                    <p className="text-[#737373] text-xs mt-1">
                      {capacityUsed}h used / {weeklyCapacity}h capacity ({remaining}h remaining)
                    </p>
                  </div>

                  {/* Status Breakdown */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="text-center p-2 rounded bg-[rgba(255,255,255,0.02)]">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <CheckCircle2 className="w-3 h-3 text-[#E0B954]" />
                      </div>
                      <p className="text-white font-medium">{developer.completed_items}</p>
                      <p className="text-[#737373] text-xs">Done</p>
                    </div>
                    <div className="text-center p-2 rounded bg-[rgba(255,255,255,0.02)]">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Clock className="w-3 h-3 text-[#F59E0B]" />
                      </div>
                      <p className="text-white font-medium">{developer.in_progress_items}</p>
                      <p className="text-[#737373] text-xs">Active</p>
                    </div>
                    <div className="text-center p-2 rounded bg-[rgba(255,255,255,0.02)]">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <AlertTriangle className="w-3 h-3 text-[#EF4444]" />
                      </div>
                      <p className="text-white font-medium">{developer.overdue_items}</p>
                      <p className="text-[#737373] text-xs">Overdue</p>
                    </div>
                  </div>

                  {/* Hours Summary */}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="text-left">
                          <div>
                            <span className="text-[#737373] text-xs">Logged</span>
                            <p className="text-white font-medium">{developer.logged_hours}h</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-[#121212] border-[rgba(255,255,255,0.08)] text-white">
                          <p>Total hours logged across all tasks</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="text-left">
                          <div>
                            <span className="text-[#737373] text-xs">Remaining</span>
                            <p className="text-white font-medium">{developer.remaining_hours}h</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-[#121212] border-[rgba(255,255,255,0.08)] text-white">
                          <p>Hours for tasks due this week (Mon-Fri only)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="text-left">
                          <div>
                            <span className="text-[#737373] text-xs">Total Rem</span>
                            <p className="text-white font-medium">{developer.remaining_hours}h</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-[#121212] border-[rgba(255,255,255,0.08)] text-white">
                          <p>Total remaining hours across all incomplete tasks</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sortedData.length > INITIAL_SHOW && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-[rgba(255,255,255,0.05)]">
            <span className="text-xs text-[#737373]">
              Showing {showAll ? sortedData.length : Math.min(INITIAL_SHOW, sortedData.length)} of{' '}
              {sortedData.length} developers
            </span>
            <button
              onClick={() => setShowAll((p) => !p)}
              className="flex items-center gap-1.5 text-xs text-[#E0B954] hover:text-[#F3D57E] px-3 py-1.5 rounded-lg bg-[#E0B954]/10 hover:bg-[#E0B954]/15 transition-colors font-medium"
            >
              {showAll ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" /> Show all {sortedData.length}
                </>
              )}
            </button>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-6 mt-6 pt-4 border-t border-[rgba(255,255,255,0.05)]">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-[#737373] text-sm">Under 80%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-[#737373] text-sm">80-100%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-[#737373] text-sm">Over capacity</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkloadView;
