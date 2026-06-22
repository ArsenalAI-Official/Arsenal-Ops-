import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { Users, FolderKanban, Ticket, Calendar, ChevronRight } from 'lucide-react';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import type { DashboardStats } from '@/client';

type AdminTab = 'dashboard' | 'employees' | 'projects' | 'users' | 'roles';

interface DashboardTabProps {
  stats: DashboardStats;
  setActiveTab: (tab: AdminTab) => void;
}

const DashboardTab = ({ stats, setActiveTab }: DashboardTabProps) => {
  const statusColor = (s: string) => {
    const key = s.toLowerCase();
    if (key === 'done' || key === 'completed' || key === 'closed') return '#34D399';
    if (key === 'in_progress' || key === 'in progress') return '#E0B954';
    if (key === 'in_review' || key === 'in review' || key === 'review') return '#A78BFA';
    if (key === 'blocked') return '#EF4444';
    if (key === 'cancelled' || key === 'canceled' || key === 'wontfix') return '#525252';
    if (key === 'backlog') return '#64748B';
    if (key === 'todo' || key === 'to_do' || key === 'to do') return '#94A3B8';
    if (key === 'open' || key === 'new') return '#60A5FA';
    return '#737373';
  };
  const priorityColor = (p: string) => {
    const key = p.toLowerCase();
    if (key === 'critical') return '#EF4444';
    if (key === 'high') return '#F97316';
    if (key === 'medium') return '#F59E0B';
    if (key === 'low') return '#E0B954';
    return '#737373';
  };
  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  const statusData = Object.entries(stats.tickets_by_status)
    .map(([name, value]) => ({
      name,
      label: name.replace(/_/g, ' '),
      value,
      color: statusColor(name),
    }))
    .sort((a, b) => b.value - a.value);
  const priorityData = Object.entries(stats.tickets_by_priority)
    .map(([name, value]) => ({
      name,
      label: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: priorityColor(name),
    }))
    .sort((a, b) => {
      const ai = priorityOrder.indexOf(a.name.toLowerCase());
      const bi = priorityOrder.indexOf(b.name.toLowerCase());
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  const kpis: Array<{
    label: string;
    value: number;
    icon: typeof Users;
    color: string;
    tab?: AdminTab;
  }> = [
    {
      label: 'Total Employees',
      value: stats.total_employees,
      icon: Users,
      color: '#E0B954',
      tab: 'employees',
    },
    {
      label: 'Total Projects',
      value: stats.total_projects,
      icon: FolderKanban,
      color: '#E0B954',
      tab: 'projects',
    },
    {
      label: 'Total Tickets',
      value: stats.total_tickets,
      icon: Ticket,
      color: '#F59E0B',
    },
    {
      label: 'Active Sprints',
      value: stats.active_sprints,
      icon: Calendar,
      color: '#EC4899',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((stat, i) => {
          const clickable = !!stat.tab;
          const Wrapper: any = clickable ? 'button' : 'div';
          return (
            <Wrapper
              key={i}
              {...(clickable
                ? {
                    onClick: () => setActiveTab(stat.tab as AdminTab),
                    type: 'button',
                    title: `Go to ${stat.label.replace('Total ', '')} tab`,
                  }
                : {})}
              className={`text-left bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 transition-colors ${
                clickable
                  ? 'cursor-pointer hover:border-[rgba(224,185,84,0.3)] hover:bg-[rgba(255,255,255,0.015)] focus:outline-none focus:ring-1 focus:ring-[#E0B954]'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${stat.color}20` }}>
                  <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
                {clickable && <ChevronRight className="w-4 h-4 text-[#737373]" />}
              </div>
              <div className="text-2xl font-bold text-white tabular-nums">{stat.value}</div>
              <div className="text-sm text-[#737373]">{stat.label}</div>
            </Wrapper>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Tickets by Status — donut */}
        <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Tickets by Status</h3>
          {statusData.length === 0 || stats.total_tickets === 0 ? (
            <Empty>
              <EmptyDescription>No ticket data yet.</EmptyDescription>
            </Empty>
          ) : (
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0" style={{ width: 180, height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {statusData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#121212',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 8,
                        fontSize: 12,
                        textTransform: 'capitalize',
                      }}
                      itemStyle={{ color: '#a3a3a3' }}
                      wrapperStyle={{ outline: 'none', zIndex: 50 }}
                      formatter={(value: number, name: string) => [
                        `${value} (${Math.round((value / stats.total_tickets) * 100)}%)`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-2xl font-bold text-white tabular-nums">
                    {stats.total_tickets}
                  </div>
                  <div className="text-[10px] text-[#737373] uppercase tracking-wider">Total</div>
                </div>
              </div>
              <ul className="flex-1 space-y-1.5 min-w-0">
                {statusData.map((d) => {
                  const pct = Math.round((d.value / stats.total_tickets) * 100);
                  return (
                    <li key={d.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="text-[#a3a3a3] capitalize truncate">{d.label}</span>
                      <span className="ml-auto text-[#737373] tabular-nums">{d.value}</span>
                      <span className="text-[#525252] tabular-nums w-9 text-right">{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Tickets by Priority — bar chart */}
        <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Tickets by Priority</h3>
          {priorityData.length === 0 || stats.total_tickets === 0 ? (
            <Empty>
              <EmptyDescription>No ticket data yet.</EmptyDescription>
            </Empty>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={priorityData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#a3a3a3', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#737373', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{
                    backgroundColor: '#121212',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600 }}
                  itemStyle={{ color: '#a3a3a3' }}
                  formatter={(value: number) => [`${value} tickets`, '']}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {priorityData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardTab;
export type { DashboardStats, AdminTab };
