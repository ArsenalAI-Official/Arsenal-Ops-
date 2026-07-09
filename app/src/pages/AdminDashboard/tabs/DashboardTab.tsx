import { Users, FolderKanban, Ticket, Calendar, ChevronRight } from 'lucide-react';
import type { ElementType } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { DashboardStats } from '@/client';
import { StatusDonut } from '@/components/charts/StatusDonut';
import { Empty, EmptyDescription } from '@/components/ui/empty';

type AdminTab = 'dashboard' | 'employees' | 'projects' | 'users' | 'roles';

interface DashboardTabProps {
  stats: DashboardStats;
  setActiveTab: (tab: AdminTab) => void;
}

const DashboardTab = ({ stats, setActiveTab }: DashboardTabProps) => {
  // Style Guide 1a priority ramp (literal hexes: these feed a recharts donut,
  // which can't read CSS vars). Kept in lockstep with PRIORITY_COLOR.
  const priorityColor = (p: string) => {
    const key = p.toLowerCase();
    if (key === 'critical') return '#E5484D';
    if (key === 'high') return '#EC7A3C';
    if (key === 'medium') return '#94A3B8';
    if (key === 'low') return '#64748B';
    return '#64748B';
  };
  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  const statusData = Object.entries(stats.tickets_by_status)
    .map(([name, value]) => ({
      name,
      label: name.replace(/_/g, ' '),
      value,
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
      color: '#A6A29C',
      tab: 'employees',
    },
    {
      label: 'Total Projects',
      value: stats.total_projects,
      icon: FolderKanban,
      color: '#A6A29C',
      tab: 'projects',
    },
    {
      label: 'Total Tickets',
      value: stats.total_tickets,
      icon: Ticket,
      color: '#A6A29C',
    },
    {
      label: 'Active Sprints',
      value: stats.active_sprints,
      icon: Calendar,
      color: '#A6A29C',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((stat, i) => {
          const clickable = !!stat.tab;
          const Wrapper: ElementType = clickable ? 'button' : 'div';
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
                  ? 'cursor-pointer hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.015)] focus:outline-none focus:ring-1 focus:ring-brand'
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
            <StatusDonut data={statusData} />
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
