import { Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useMemo, type ComponentType } from 'react';
import MyCapacityCard from './MyCapacityCard';
import type { MyTask } from './types';

interface DashboardStatsProps {
  myTasks: MyTask[];
  myTasksLoading: boolean;
  onTabChange?: (tab: 'upcoming' | 'overdue' | 'completed') => void;
}

interface StatCardProps {
  icon: ComponentType<{ className?: string }>;
  value: number;
  label: string;
  color: string;
  iconBg: string;
  loading: boolean;
  onClick?: () => void;
}

// Wide, short stat card — icon chip on the left, value + label stacked on the
// right. Shared by the three task-count cards; the capacity card renders its
// own variant (it carries a progress bar) via MyCapacityCard.
const StatCard = ({ icon: Icon, value, label, color, iconBg, loading, onClick }: StatCardProps) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-3.5 px-5 py-4 rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] text-left hover:border-[rgba(255,255,255,0.16)] hover:bg-[rgba(255,255,255,0.035)] transition-colors"
  >
    <span
      className="w-[42px] h-[42px] rounded-[11px] flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: iconBg, color }}
    >
      <Icon className="w-[18px] h-[18px]" />
    </span>
    <span className="flex flex-col leading-none min-w-0">
      {loading ? (
        <span className="h-7 w-10 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse" />
      ) : (
        <span className="text-[28px] font-bold tracking-[-0.02em]" style={{ color }}>
          {value}
        </span>
      )}
      <span className="text-[12.5px] text-muted-foreground mt-1.5">{label}</span>
    </span>
  </button>
);

const DashboardStats = ({ myTasks, myTasksLoading, onTabChange }: DashboardStatsProps) => {
  // `new Date()` is impure, so the week-bounds math is memoized per myTasks
  // change (react-hooks/purity) — mirrors ProjectsPage's greeting memo.
  const { upcoming, overdue, completedThisWeek } = useMemo(() => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfWeek = new Date(todayMidnight);
    endOfWeek.setDate(todayMidnight.getDate() + (6 - todayMidnight.getDay() + 1));
    const weekStart = new Date(todayMidnight);
    weekStart.setDate(todayMidnight.getDate() - todayMidnight.getDay());
    return {
      upcoming: myTasks.filter((t) => t.status !== 'done' && !t.is_overdue).length,
      overdue: myTasks.filter((t) => t.is_overdue).length,
      completedThisWeek: myTasks.filter((t) => {
        if (t.status !== 'done' || !t.completed_at) return false;
        const d = new Date(t.completed_at);
        return d >= weekStart && d < endOfWeek;
      }).length,
    };
  }, [myTasks]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
      <StatCard
        icon={Calendar}
        value={upcoming}
        label="Upcoming"
        color="#5896DE"
        iconBg="rgba(88,150,222,0.14)"
        loading={myTasksLoading}
        onClick={() => onTabChange?.('upcoming')}
      />
      <StatCard
        icon={AlertCircle}
        value={overdue}
        label="Overdue"
        color="#E5484D"
        iconBg="rgba(229,72,77,0.14)"
        loading={myTasksLoading}
        onClick={() => onTabChange?.('overdue')}
      />
      <StatCard
        icon={CheckCircle2}
        value={completedThisWeek}
        label="Done this week"
        color="var(--status-done)"
        iconBg="rgba(64,190,134,0.14)"
        loading={myTasksLoading}
        onClick={() => onTabChange?.('completed')}
      />
      <MyCapacityCard />
    </div>
  );
};

export default DashboardStats;
