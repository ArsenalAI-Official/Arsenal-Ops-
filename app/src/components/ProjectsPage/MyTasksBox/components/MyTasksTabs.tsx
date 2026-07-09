import { useMemo } from 'react';
import type { MyTask, PersonalTask } from '../../types';
import { isFocusTask, type MyTaskTab } from '../lib';

interface MyTasksTabsProps {
  myTasks: MyTask[];
  personalTasks: PersonalTask[];
  myTaskTab: MyTaskTab;
  onTabChange: (tab: MyTaskTab) => void;
}

const TAB_LABELS: Record<MyTaskTab, string> = {
  focus: 'Focus',
  upcoming: 'Upcoming',
  overdue: 'Overdue',
  completed: 'Completed',
  personal: 'Personal',
};

const MyTasksTabs = ({ myTasks, personalTasks, myTaskTab, onTabChange }: MyTasksTabsProps) => {
  const today = useMemo(() => new Date(), []);
  const countFor = (tab: MyTaskTab): number => {
    switch (tab) {
      case 'focus':
        return myTasks.filter((t) => isFocusTask(t, today)).length;
      case 'upcoming':
        return myTasks.filter((t) => t.status !== 'done' && !t.is_overdue).length;
      case 'overdue':
        return myTasks.filter((t) => t.is_overdue).length;
      case 'completed':
        return myTasks.filter((t) => t.status === 'done').length;
      case 'personal':
        return personalTasks.filter((t) => !t.is_converted && t.status !== 'done').length;
    }
  };

  return (
    <div className="flex gap-1 px-5 flex-wrap border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
      {(['focus', 'upcoming', 'overdue', 'completed', 'personal'] as const).map((tab) => {
        const active = myTaskTab === tab;
        const count = countFor(tab);
        // A count pill shows on Focus and Overdue (the "needs attention" tabs)
        // and Personal (so the badge parity with the old design is kept).
        const showCount = (tab === 'focus' || tab === 'overdue' || tab === 'personal') && count > 0;
        const isUrgent = tab === 'overdue' && count > 0;
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex items-center gap-1.5 text-[12.5px] px-3 py-2.5 border-b-2 -mb-px transition-colors ${
              active
                ? 'font-bold border-brand text-white'
                : 'font-medium border-transparent text-muted-foreground hover:text-[#a3a3a3]'
            }`}
          >
            {TAB_LABELS[tab]}
            {showCount && (
              <span
                className={`text-[10.5px] font-bold px-1.5 rounded-full ${
                  isUrgent
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-[rgba(255,255,255,0.08)] text-[#a3a3a3]'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default MyTasksTabs;
