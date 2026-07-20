import { TrendingUp, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import type { ProjectAnalyticsResponse, SprintResponse } from '@/client';
import { Badge } from '@/components/ui/badge';

interface TrackerTabProps {
  hubLoading: boolean;
  sprints: SprintResponse[];
  analytics: ProjectAnalyticsResponse | null;
  sprintsExpanded: boolean;
  setSprintsExpanded: (updater: (prev: boolean) => boolean) => void;
}

const TrackerTab = ({
  hubLoading,
  sprints,
  analytics,
  sprintsExpanded,
  setSprintsExpanded,
}: TrackerTabProps) => {
  if (hubLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {/* Active Sprints skeleton */}
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(224,185,84,0.12)] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-[rgba(255,255,255,0.06)]" />
            <div className="h-4 w-28 bg-[rgba(255,255,255,0.07)] rounded" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-[rgba(255,255,255,0.025)] rounded-lg p-3 space-y-2">
                <div className="h-3 w-24 bg-[rgba(255,255,255,0.05)] rounded" />
                <div className="h-1.5 w-full bg-[rgba(255,255,255,0.04)] rounded-full" />
              </div>
            ))}
          </div>
        </div>
        {/* Work Items skeleton */}
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 space-y-3">
          <div className="h-4 w-32 bg-[rgba(255,255,255,0.07)] rounded" />
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-2.5 border-b border-[rgba(255,255,255,0.04)]"
            >
              <div className="h-4 w-4 rounded bg-[rgba(255,255,255,0.06)] flex-shrink-0" />
              <div className="h-3 w-14 bg-[rgba(255,255,255,0.05)] rounded" />
              <div className="h-3 flex-1 bg-[rgba(255,255,255,0.05)] rounded" />
              <div className="h-5 w-16 bg-[rgba(255,255,255,0.04)] rounded-full" />
              <div className="h-5 w-16 bg-[rgba(255,255,255,0.04)] rounded-full" />
              <div className="h-3 w-20 bg-[rgba(255,255,255,0.04)] rounded" />
            </div>
          ))}
        </div>
        {/* Analytics skeleton */}
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 space-y-4">
          <div className="space-y-1.5">
            <div className="h-4 w-36 bg-[rgba(255,255,255,0.07)] rounded" />
            <div className="h-3 w-52 bg-[rgba(255,255,255,0.04)] rounded" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4 h-52" />
            ))}
            <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4 col-span-2 h-64" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active Sprints */}
      {sprints.length > 0 && (
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(224,185,84,0.12)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#C79E3B] flex items-center justify-center shadow-lg shadow-[#E0B954]/20">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Active Sprints</h3>
                <p className="text-xs text-[#737373]">
                  {sprints.filter((s) => s.status === 'active').length} active · {sprints.length}{' '}
                  total
                </p>
              </div>
            </div>
            {sprints.length > 2 && (
              <button
                onClick={() => setSprintsExpanded((p) => !p)}
                className="flex items-center gap-1.5 text-xs text-[#E0B954] hover:text-[#F3D57E] px-3 py-1.5 rounded-lg bg-[#E0B954]/10 hover:bg-[#E0B954]/15 transition-colors font-medium flex-shrink-0"
              >
                {sprintsExpanded ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" /> Collapse
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" /> Show all {sprints.length}
                  </>
                )}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(sprintsExpanded ? sprints : sprints.slice(0, 2)).map((sprint) => (
              <div
                key={sprint.id}
                className={`border rounded-xl p-4 ${
                  sprint.status === 'active'
                    ? 'border-[#E0B954]/30 bg-[#E0B954]/5'
                    : sprint.status === 'completed'
                      ? 'border-[#E0B954]/20 bg-[rgba(224,185,84,0.03)]'
                      : 'border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        sprint.status === 'active'
                          ? 'bg-[#E0B954] animate-pulse'
                          : sprint.status === 'completed'
                            ? 'bg-[#E0B954]'
                            : 'bg-[#737373]'
                      }`}
                    />
                    <p className="text-sm font-semibold text-white truncate">{sprint.name}</p>
                  </div>
                  <Badge
                    className={`text-[10px] border-0 flex-shrink-0 ${
                      sprint.status === 'active'
                        ? 'bg-[#E0B954]/20 text-[#E0B954]'
                        : sprint.status === 'completed'
                          ? 'bg-[#E0B954]/20 text-[#E0B954]'
                          : 'bg-[#737373]/20 text-[#737373]'
                    }`}
                  >
                    {sprint.status}
                  </Badge>
                </div>
                {sprint.goal && (
                  <p className="text-xs text-[#a3a3a3] mb-2 line-clamp-1">{sprint.goal}</p>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#E0B954] to-[#E0B954] rounded-full transition-all"
                      style={{ width: `${sprint.completion_pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-[#E0B954] w-10 text-right">
                    {sprint.completion_pct}%
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[#737373]">
                  <span>
                    {sprint.done_count}/{sprint.total_items} done
                  </span>
                  <span>·</span>
                  <span>{sprint.total_points} pts</span>
                  {sprint.start_date && sprint.end_date && (
                    <>
                      <span>·</span>
                      <span>{new Date(sprint.end_date).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analytics Charts */}
      {analytics && (
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#C79E3B] flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Project Analytics</h3>
              {analytics.total_items > 0 ? (
                <p className="text-xs text-[#737373]">
                  {analytics.total_items} items &bull; {analytics.completed_points}/
                  {analytics.total_story_points} points completed
                </p>
              ) : (
                <p className="text-xs text-[#737373]">No work items yet</p>
              )}
            </div>
          </div>
          {analytics.total_items === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BarChart3 className="w-12 h-12 text-[#334155] mb-3" />
              <p className="text-sm text-[#737373] font-medium">No Analytics Data</p>
              <p className="text-xs text-[#334155] mt-1">
                Create work items to see analytics and charts
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4">
                <h4 className="text-sm font-medium text-[#a3a3a3] mb-4">Status Distribution</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={Object.entries(analytics.status_distribution).map(([name, value]) => ({
                        name,
                        value,
                      }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ value, cx, cy, midAngle }) => {
                        const RADIAN = Math.PI / 180;
                        const radius = 65;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        return (
                          <text
                            x={x}
                            y={y}
                            fill="#ffffff"
                            fontSize="14"
                            fontWeight="bold"
                            textAnchor="middle"
                            dominantBaseline="central"
                          >
                            {value}
                          </text>
                        );
                      }}
                      labelLine={false}
                    >
                      {Object.entries(analytics.status_distribution).map(([name], index) => {
                        const statusColors: Record<string, string> = {
                          backlog: '#6B7280',
                          todo: '#60A5FA',
                          in_progress: '#E0B954',
                          in_review: '#A78BFA',
                          done: '#34D399',
                          blocked: '#EF4444',
                        };
                        const fallback = [
                          '#6B7280',
                          '#60A5FA',
                          '#E0B954',
                          '#A78BFA',
                          '#34D399',
                          '#EF4444',
                        ];
                        return (
                          <Cell
                            key={`cell-${index}`}
                            fill={statusColors[name] ?? fallback[index % fallback.length]}
                          />
                        );
                      })}
                    </Pie>
                    <Legend
                      formatter={(value: string) =>
                        value.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
                      }
                      wrapperStyle={{ paddingTop: '12px' }}
                      iconType="circle"
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4">
                <h4 className="text-sm font-medium text-[#a3a3a3] mb-4">
                  Sprint Velocity (Story Points vs Sprints)
                </h4>
                {analytics.velocity_data.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.velocity_data} margin={{ left: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis
                        dataKey="sprint_name"
                        tick={{ fill: '#737373', fontSize: 10 }}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis tick={{ fill: '#737373' }} />
                      <Legend wrapperStyle={{ paddingTop: '12px' }} />
                      <Bar
                        dataKey="committed"
                        fill="#60A5FA"
                        name="Estimated"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="completed"
                        fill="#34D399"
                        name="Completed"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-[#737373]">
                    <p>No Sprints Created for the project</p>
                  </div>
                )}
              </div>
              <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4">
                <h4 className="text-sm font-medium text-[#a3a3a3] mb-4">
                  Burndown Chart (Last 14 Days)
                </h4>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={analytics.burndown_data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="date" tick={{ fill: '#737373', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#737373' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#121212',
                        border: 'none',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="remaining"
                      stroke="#EF4444"
                      name="Remaining Items"
                      strokeWidth={2}
                      dot={{ fill: '#EF4444', r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="completed"
                      stroke="#34D399"
                      name="Completed Items"
                      strokeWidth={2}
                      dot={{ fill: '#34D399', r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrackerTab;
