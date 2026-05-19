import { BarChart3 } from 'lucide-react';
import type { MyTask } from './types';
import { parseLocalDate } from './utils';
import { STATUS_BARS, STATUS_COLOR } from './constants';

interface OverviewStats {
  total: number;
  done: number;
  in_progress: number;
  in_review: number;
  todo: number;
  overdue: number;
  completion_pct: number;
}

interface OverviewBoxProps {
  myTasks: MyTask[];
  myTasksLoading: boolean;
  overviewStats: OverviewStats;
  showAllDueSoon: boolean;
  setShowAllDueSoon: (next: boolean | ((prev: boolean) => boolean)) => void;
  onSelectTask: (task: MyTask) => void;
}

const OverviewBox = ({
  myTasks,
  myTasksLoading,
  overviewStats,
  showAllDueSoon,
  setShowAllDueSoon,
  onSelectTask,
}: OverviewBoxProps) => {
  const allDue = myTasks
    .filter((t) => t.due_date && t.status !== 'done')
    .sort(
      (a, b) => parseLocalDate(a.due_date!)!.getTime() - parseLocalDate(b.due_date!)!.getTime(),
    );
  const dueSoon = showAllDueSoon ? allDue : allDue.slice(0, 4);

  return (
    <div className="md:col-span-2 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-2xl flex flex-col h-[460px]">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#E0B954]" />
          <h3 className="text-sm font-semibold text-white">My Overview</h3>
        </div>
        <span className="text-xs text-[#737373]">{overviewStats.total} tasks</span>
      </div>
      <div className="flex-1 min-h-0 p-4 overflow-y-auto space-y-4">
        {myTasksLoading ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-[rgba(255,255,255,0.03)] rounded-xl p-3 text-center">
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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-[#737373]">Status distribution</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden flex w-full">
                {STATUS_BARS.map((s) => {
                  const count = overviewStats[s.key as keyof OverviewStats] as number;
                  const pct = overviewStats.total > 0 ? (count / overviewStats.total) * 100 : 0;
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
                  const count = overviewStats[s.key as keyof OverviewStats] as number;
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

            {allDue.length > 0 && (
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
                      onClick={() => onSelectTask(t)}
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
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OverviewBox;
