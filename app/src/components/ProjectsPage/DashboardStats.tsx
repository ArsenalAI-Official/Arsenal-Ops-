import { Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { MyTask } from './types';
import { parseLocalDate } from './utils';

interface DashboardStatsProps {
    userName?: string;
    myTasks: MyTask[];
    myTasksLoading: boolean;
}

const DashboardStats = ({ userName, myTasks, myTasksLoading }: DashboardStatsProps) => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfWeek = new Date(todayMidnight);
    endOfWeek.setDate(todayMidnight.getDate() + (6 - todayMidnight.getDay() + 1));

    const dueThisWeek = myTasks.filter(t => {
        if (t.status === 'done' || t.is_overdue || !t.due_date) return false;
        const d = parseLocalDate(t.due_date);
        return d && d >= todayMidnight && d < endOfWeek;
    }).length;

    const overdue = myTasks.filter(t => t.is_overdue).length;

    const weekStart = new Date(todayMidnight);
    weekStart.setDate(todayMidnight.getDate() - todayMidnight.getDay());
    const completedThisWeek = myTasks.filter(t => {
        if (t.status !== 'done' || !t.completed_at) return false;
        const d = new Date(t.completed_at);
        return d >= weekStart && d < endOfWeek;
    }).length;

    return (
        <div className="flex items-stretch gap-4 mb-8">
            <div className="flex-1 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl px-6 py-5 flex flex-col justify-center">
                <p className="text-xs text-[#737373] font-medium mb-1">Good to see you</p>
                <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back, {userName?.split(' ')[0]}</h2>
            </div>

            <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl px-6 py-5 flex flex-col justify-between min-w-[160px]">
                <div className="flex items-center justify-between mb-3">
                    <Calendar className="w-4 h-4 text-[#E0B954]" />
                    <span className="text-[10px] font-medium text-[#E0B954] bg-[rgba(224,185,84,0.1)] px-2 py-0.5 rounded-full">this week</span>
                </div>
                {myTasksLoading
                    ? <div className="h-8 w-12 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse mb-1" />
                    : <div className="text-3xl font-bold text-[#E0B954] tracking-tight">{dueThisWeek}</div>
                }
                <div className="text-xs text-[#737373] font-medium mt-1">Due this week</div>
            </div>

            <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl px-6 py-5 flex flex-col justify-between min-w-[160px]">
                <div className="flex items-center justify-between mb-3">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-[10px] font-medium text-red-400 bg-[rgba(239,68,68,0.1)] px-2 py-0.5 rounded-full">overdue</span>
                </div>
                {myTasksLoading
                    ? <div className="h-8 w-12 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse mb-1" />
                    : <div className="text-3xl font-bold text-red-400 tracking-tight">{overdue}</div>
                }
                <div className="text-xs text-[#737373] font-medium mt-1">Overdue</div>
            </div>

            <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl px-6 py-5 flex flex-col justify-between min-w-[160px]">
                <div className="flex items-center justify-between mb-3">
                    <CheckCircle2 className="w-4 h-4 text-[#34D399]" />
                    <span className="text-[10px] font-medium text-[#34D399] bg-[rgba(52,211,153,0.1)] px-2 py-0.5 rounded-full">this week</span>
                </div>
                {myTasksLoading
                    ? <div className="h-8 w-12 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse mb-1" />
                    : <div className="text-3xl font-bold text-[#34D399] tracking-tight">{completedThisWeek}</div>
                }
                <div className="text-xs text-[#737373] font-medium mt-1">Completed this week</div>
            </div>
        </div>
    );
};

export default DashboardStats;
