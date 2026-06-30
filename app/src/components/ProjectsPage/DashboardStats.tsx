import { Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import MyCapacityCard from './MyCapacityCard';
import type { MyTask } from './types';

interface DashboardStatsProps {
  userName?: string;
  myTasks: MyTask[];
  myTasksLoading: boolean;
  onTabChange?: (tab: 'upcoming' | 'overdue' | 'completed') => void;
}

const DashboardStats = ({
  userName,
  myTasks,
  myTasksLoading,
  onTabChange,
}: DashboardStatsProps) => {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfWeek = new Date(todayMidnight);
  endOfWeek.setDate(todayMidnight.getDate() + (6 - todayMidnight.getDay() + 1));

  const upcoming = myTasks.filter((t) => t.status !== 'done' && !t.is_overdue).length;

  const overdue = myTasks.filter((t) => t.is_overdue).length;

  const weekStart = new Date(todayMidnight);
  weekStart.setDate(todayMidnight.getDate() - todayMidnight.getDay());
  const completedThisWeek = myTasks.filter((t) => {
    if (t.status !== 'done' || !t.completed_at) return false;
    const d = new Date(t.completed_at);
    return d >= weekStart && d < endOfWeek;
  }).length;

  return (
    <div className="grid grid-cols-5 items-stretch gap-5 mb-8">
      <div className="col-span-2 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl px-6 py-5 flex flex-col justify-center relative overflow-hidden">
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 600 100"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M 180 100 C 260 72, 340 88, 390 58 C 430 33, 490 52, 600 18 L 600 100 Z"
            fill="rgba(212,160,23,0.07)"
          />
          <path
            d="M 300 100 C 355 76, 415 84, 455 62 C 495 40, 545 54, 600 36 L 600 100 Z"
            fill="rgba(212,160,23,0.10)"
          />
          <path
            d="M 420 100 C 458 80, 505 79, 542 64 C 566 54, 585 57, 600 50 L 600 100 Z"
            fill="rgba(212,160,23,0.13)"
          />
        </svg>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-[#080808] text-sm font-medium mb-3">
          {userName?.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Welcome back, {userName?.split(' ')[0]}
        </h2>
      </div>

      <div className="col-span-3 flex gap-4">
        <div
          className="flex-1 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl px-6 py-5 flex flex-col justify-between cursor-pointer hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          onClick={() => onTabChange?.('upcoming')}
        >
          <div className="mb-3">
            <Calendar className="w-4 h-4 text-[#E0B954]" />
          </div>
          {myTasksLoading ? (
            <div className="h-8 w-12 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse mb-1" />
          ) : (
            <div className="text-3xl font-bold text-[#E0B954] tracking-tight">{upcoming}</div>
          )}
          <div className="text-xs text-[#737373] font-medium mt-1">Upcoming</div>
        </div>

        <div
          className="flex-1 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl px-6 py-5 flex flex-col justify-between cursor-pointer hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          onClick={() => onTabChange?.('overdue')}
        >
          <div className="mb-3">
            <AlertCircle className="w-4 h-4 text-red-400" />
          </div>
          {myTasksLoading ? (
            <div className="h-8 w-12 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse mb-1" />
          ) : (
            <div className="text-3xl font-bold text-red-400 tracking-tight">{overdue}</div>
          )}
          <div className="text-xs text-[#737373] font-medium mt-1">Overdue</div>
        </div>

        <div
          className="flex-1 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl px-6 py-5 flex flex-col justify-between cursor-pointer hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          onClick={() => onTabChange?.('completed')}
        >
          <div className="mb-3">
            <CheckCircle2 className="w-4 h-4 text-[#34D399]" />
          </div>
          {myTasksLoading ? (
            <div className="h-8 w-12 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse mb-1" />
          ) : (
            <div className="text-3xl font-bold text-[#34D399] tracking-tight">
              {completedThisWeek}
            </div>
          )}
          <div className="text-xs text-[#737373] font-medium mt-1">Completed this week</div>
        </div>

        <MyCapacityCard />
      </div>
    </div>
  );
};

export default DashboardStats;
