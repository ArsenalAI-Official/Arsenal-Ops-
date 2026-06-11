import type { MyTask, PersonalTask } from '../../types';
import type { MyTaskTab } from '../lib';

interface MyTasksTabsProps {
  myTasks: MyTask[];
  personalTasks: PersonalTask[];
  myTaskTab: MyTaskTab;
  onTabChange: (tab: MyTaskTab) => void;
}

const MyTasksTabs = ({ myTasks, personalTasks, myTaskTab, onTabChange }: MyTasksTabsProps) => {
  return (
    <div className="flex gap-0 px-5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
      {(['upcoming', 'overdue', 'completed', 'personal'] as const).map((tab) => {
        const count =
          tab === 'upcoming'
            ? myTasks.filter((t) => t.status !== 'done' && !t.is_overdue).length
            : tab === 'overdue'
              ? myTasks.filter((t) => t.is_overdue).length
              : tab === 'personal'
                ? personalTasks.filter((t) => !t.is_converted && t.status !== 'done').length
                : myTasks.filter((t) => t.status === 'done').length;
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              myTaskTab === tab
                ? 'border-[#E0B954] text-white'
                : 'border-transparent text-[#737373] hover:text-[#a3a3a3]'
            }`}
          >
            {tab === 'overdue' && count > 0 ? (
              <span className="flex items-center gap-1.5">
                Overdue
                <span className="bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              </span>
            ) : tab === 'personal' ? (
              <span className="flex items-center gap-1.5">
                Personal
                {count > 0 && (
                  <span className="bg-[#E0B954]/20 text-[#E0B954] text-xs px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
              </span>
            ) : (
              <span className="capitalize">{tab}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default MyTasksTabs;
