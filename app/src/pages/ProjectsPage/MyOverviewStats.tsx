import React, { useState } from 'react';
import { BarChart3 } from 'lucide-react';

// Helper function to parse YYYY-MM-DD string to local Date object (avoids UTC timezone issues)
const parseLocalDate = (dateString: string | undefined): Date | undefined => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

const STATUS_BARS = [
  { key: 'done', color: '#34D399', label: 'Done' },
  { key: 'in_progress', color: '#E0B954', label: 'In Progress' },
  { key: 'in_review', color: '#A78BFA', label: 'In Review' },
  { key: 'todo', color: '#60A5FA', label: 'To Do' },
] as const;

const STATUS_COLOR: Record<string, string> = {
  todo: '#60A5FA',
  in_progress: '#E0B954',
  in_review: '#A78BFA',
  done: '#34D399',
  blocked: '#EF4444',
  backlog: '#555',
};

interface MyTask {
  id: string;
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  project_id: number;
  project_name: string;
  due_date: string | null;
  estimated_hours: number | null;
  logged_hours: number | null;
  remaining_hours: number | null;
  is_overdue: boolean;
  story_points?: number;
  assigned_hours?: number;
  assignee?: string;
  assignee_id?: number | null;
  description?: string;
  tags?: string[];
  acceptance_criteria?: string[];
  parent_id?: number | null;
  epic_id?: number | null;
  sprint_id?: number | null;
  sprint?: string;
  parent_key?: string | null;
  epic_key?: string | null;
  is_personal?: boolean;
}

interface OverviewStats {
  total: number;
  done: number;
  in_progress: number;
  in_review: number;
  todo: number;
  overdue: number;
  completion_pct: number;
}

interface MyOverviewStatsProps {
  overviewStats: OverviewStats;
  myTasksLoading: boolean;
  myTasks: MyTask[];
  setSelectedTask: (task: MyTask) => void;
}

const MyOverviewStats: React.FC<MyOverviewStatsProps> = ({
  overviewStats,
  myTasksLoading,
  myTasks,
  setSelectedTask,
}) => {
  const [showAllDueSoon, setShowAllDueSoon] = useState(false);

  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-2xl flex flex-col h-[460px]">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#E0B954]" />
          <h3 className="text-sm font-semibold text-white">My Overview</h3>
        </div>
        <span className="text-xs text-[#737373]">{overviewStats.total} tasks</span>
      </div>
      <div className="flex-1 min-h-0 p-4 overflow-y-auto space-y-4">
        {myTasksLoading ? (
          /* Skeleton while tasks load */
          <>
            <div className="grid grid-cols-4 gap-2">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="bg-[rgba(255,255,255,0.03)] rounded-xl p-3 text-center"
                >
                  <div className="h-7 w-8 bg-[rgba(255,255,255,0.07)] rounded-lg animate-pulse mx-auto mb-1" />
                  <div className="h-3 w-12 bg-[rgba(255,255,255,0.05)] rounded animate-pulse mx-auto" />
                </div>
              ))}
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <div className="h-3 w-20 bg-[rgba(255,255,255,0.05)] rounded animate-pulse" />
                <div className="h-3 w-8 bg-[rgba(255,255,255,0.05)] rounded animate-pulse" />
              </div>
              <div className="h-2 bg-[rgba(255,255,255,0.05)] rounded-full animate-pulse" />
            </div>
            <div>
              <div className="h-3 rounded-full bg-[rgba(255,255,255,0.05)] animate-pulse mb-2" />
              <div className="flex gap-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-3 w-16 bg-[rgba(255,255,255,0.04)] rounded animate-pulse"
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[rgba(255,255,255,0.07)] animate-pulse flex-shrink-0" />
                  <div className="h-3 flex-1 bg-[rgba(255,255,255,0.05)] rounded animate-pulse" />
                  <div className="h-3 w-10 bg-[rgba(255,255,255,0.04)] rounded animate-pulse flex-shrink-0" />
                </div>
              ))}
            </div>
          </>
        ) : myTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <BarChart3 className="w-10 h-10 text-[#E0B954]/20 mb-2" />
            <p className="text-sm text-[#737373]">No task data yet</p>
            <p className="text-xs text-[#555] mt-1">Tasks assigned to you will appear here</p>
          </div>
        ) : (
          <>
            {/* Row 1 — 4 stat micro-cards */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Total', value: overviewStats.total, color: '#f5f5f5' },
                { label: 'Done', value: overviewStats.done, color: '#34D399' },
                { label: 'In Progress', value: overviewStats.in_progress, color: '#E0B954' },
                { label: 'Overdue', value: overviewStats.overdue, color: '#EF4444' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-[rgba(255,255,255,0.03)] rounded-xl p-3 text-center"
                >
                  <div className="text-xl font-bold" style={{ color: s.color }}>
                    {s.value}
                  </div>
                  <div className="text-xs text-[#737373] mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Row 2 — Completion progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-[#737373]">Completion</span>
                <span className="text-xs font-semibold text-[#34D399]">
                  {overviewStats.completion_pct}%
                </span>
              </div>
              <div className="h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${overviewStats.completion_pct}%`,
                    background: 'linear-gradient(90deg, #34D399, #059669)',
                  }}
                />
              </div>
            </div>

            {/* Row 3 — Stacked status bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-[#737373]">Status distribution</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden flex w-full">
                {STATUS_BARS.map((s) => {
                  const count = overviewStats[s.key as keyof typeof overviewStats] as number;
                  const pct =
                    overviewStats.total > 0 ? (count / overviewStats.total) * 100 : 0;
                  return pct > 0 ? (
                    <div
                      key={s.key}
                      style={{ width: `${pct}%`, backgroundColor: s.color }}
                      title={`${s.label}: ${count}`}
                    />
                  ) : null;
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                {STATUS_BARS.map((s) => {
                  const count = overviewStats[s.key as keyof typeof overviewStats] as number;
                  return (
                    <div key={s.key} className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-xs text-[#737373]">
                        {s.label} <span className="text-white font-medium">{count}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Row 4 — Next due */}
            {(() => {
              const allDue = myTasks
                .filter((t) => t.due_date && t.status !== 'done')
                .sort(
                  (a, b) =>
                    parseLocalDate(a.due_date!)!.getTime() -
                    parseLocalDate(b.due_date!)!.getTime(),
                );
              const dueSoon = showAllDueSoon ? allDue : allDue.slice(0, 4);
              return allDue.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#737373] font-medium">Next due</span>
                    <span className="text-xs text-[#737373]">{allDue.length} upcoming</span>
                  </div>
                  <div className="space-y-1.5">
                    {dueSoon.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 text-xs cursor-pointer hover:bg-[rgba(255,255,255,0.02)] px-2 py-1 rounded-lg transition-colors"
                        onClick={() => setSelectedTask(t)}
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: STATUS_COLOR[t.status] || '#555' }}
                        />
                        <span className="text-[#a3a3a3] truncate flex-1">{t.title}</span>
                        <span
                          className={`flex-shrink-0 ${t.is_overdue ? 'text-red-400' : 'text-[#737373]'}`}
                        >
                          {parseLocalDate(t.due_date!)?.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                  {allDue.length > 4 && (
                    <button
                      onClick={() => setShowAllDueSoon((p) => !p)}
                      className="w-full text-center text-xs text-[#737373] hover:text-[#E0B954] py-1.5 mt-1 transition-colors"
                    >
                      {showAllDueSoon ? 'Show less' : `Show ${allDue.length - 4} more`}
                    </button>
                  )}
                </div>
              ) : null;
            })()}
          </>
        )}
      </div>
    </div>
  );
};

export default MyOverviewStats;
