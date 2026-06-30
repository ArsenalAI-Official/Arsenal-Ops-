import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import type { MyTask, PersonalTask } from '../types';
import MyTasksHeader from './components/MyTasksHeader';
import MyTasksTabs from './components/MyTasksTabs';
import PersonalTasksList from './components/PersonalTasksList';
import StatusBar from './components/StatusBar';
import WorkItemRow from './components/WorkItemRow';
import { sortPersonalTasks, sortUpcomingTasks, sortCompletedTasks, type MyTaskTab } from './lib';

interface MyTasksBoxProps {
  myTasks: MyTask[];
  personalTasks: PersonalTask[];
  myTasksLoading: boolean;
  myTaskTab: MyTaskTab;
  setMyTaskTab: (tab: MyTaskTab) => void;
  showAllTasks: boolean;
  setShowAllTasks: (next: boolean | ((prev: boolean) => boolean)) => void;
  onSelectTask: (task: MyTask) => void;
  onAddPersonalTaskClick: () => void;
  onEditPersonalTask: (task: PersonalTask) => void;
  onConvertPersonalTask: (task: PersonalTask) => void;
  onDeletePersonalTask: (taskId: number) => void;
  onTogglePersonalTaskComplete: (task: PersonalTask) => void;
  onNavigateToPersonalTasks: () => void;
  onChangeTaskStatus: (task: MyTask, newStatus: string) => void;
  onQuickDueDateChange: (task: MyTask & { is_personal?: boolean }, isoDate: string) => void;
}

const MyTasksBox = ({
  myTasks,
  personalTasks,
  myTasksLoading,
  myTaskTab,
  setMyTaskTab,
  showAllTasks,
  setShowAllTasks,
  onSelectTask,
  onAddPersonalTaskClick,
  onEditPersonalTask,
  onConvertPersonalTask,
  onDeletePersonalTask,
  onTogglePersonalTaskComplete,
  onNavigateToPersonalTasks,
  onChangeTaskStatus,
  onQuickDueDateChange,
}: MyTasksBoxProps) => {
  const [openDateRowId, setOpenDateRowId] = useState<string | null>(null);
  // Header search box — mirrors the pattern in `ProjectsBox` so the home
  // page has consistent search affordances. Filters across every tab
  // (matches task title, ticket key, project name for work items; title +
  // description for personal tasks). Empty string = no filter.
  const [taskSearch, setTaskSearch] = useState('');
  // "Tag to project" promotes a personal task into a project ticket via
  // POST /api/personal-tasks/{id}/convert-to-ticket — gated server-side on
  // `project.assign_personal_task`. Hide the per-task button when the user
  // lacks the cap so they don't get a 403 toast.
  const { can } = useAuth();
  const canAssignToProject = can('project.assign_personal_task');

  const normalizedSearch = taskSearch.trim().toLowerCase();
  const matchesSearch = (...fields: (string | null | undefined)[]): boolean => {
    if (!normalizedSearch) return true;
    return fields.some((f) => (f ?? '').toLowerCase().includes(normalizedSearch));
  };

  const filteredMyTasks = myTasks.filter((t) => {
    const inTab =
      myTaskTab === 'upcoming'
        ? t.status !== 'done' && !t.is_overdue
        : myTaskTab === 'overdue'
          ? t.is_overdue
          : myTaskTab === 'completed'
            ? t.status === 'done'
            : false;
    if (!inTab) return false;
    return matchesSearch(t.title, t.key, t.project_name);
  });

  const sortedFiltered =
    myTaskTab === 'upcoming'
      ? sortUpcomingTasks(filteredMyTasks)
      : myTaskTab === 'completed'
        ? sortCompletedTasks(filteredMyTasks)
        : filteredMyTasks;
  const visibleTasks = showAllTasks ? sortedFiltered : sortedFiltered.slice(0, 6);
  const activePersonalTasks = personalTasks.filter(
    (t) => !t.is_converted && matchesSearch(t.title, t.description),
  );
  const visiblePersonalTasks = [...activePersonalTasks].sort(sortPersonalTasks).slice(0, 5);

  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-2xl flex flex-col h-full">
      <MyTasksHeader
        taskSearch={taskSearch}
        setTaskSearch={setTaskSearch}
        onAddPersonalTaskClick={onAddPersonalTaskClick}
      />

      <MyTasksTabs
        myTasks={myTasks}
        personalTasks={personalTasks}
        myTaskTab={myTaskTab}
        onTabChange={(tab) => {
          setMyTaskTab(tab);
          setShowAllTasks(false);
        }}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
        {myTaskTab === 'personal' ? (
          <PersonalTasksList
            activePersonalTasks={activePersonalTasks}
            visiblePersonalTasks={visiblePersonalTasks}
            canAssignToProject={canAssignToProject}
            onAddPersonalTaskClick={onAddPersonalTaskClick}
            onTogglePersonalTaskComplete={onTogglePersonalTaskComplete}
            onEditPersonalTask={onEditPersonalTask}
            onConvertPersonalTask={onConvertPersonalTask}
            onDeletePersonalTask={onDeletePersonalTask}
            onNavigateToPersonalTasks={onNavigateToPersonalTasks}
          />
        ) : myTasksLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="sm" tone="gold" />
          </div>
        ) : filteredMyTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="w-8 h-8 text-[#E0B954]/30 mb-2" />
            <p className="text-sm text-[#737373]">
              {myTaskTab === 'completed'
                ? 'No completed tasks yet'
                : myTaskTab === 'overdue'
                  ? 'No overdue tasks 🎉'
                  : 'No upcoming tasks'}
            </p>
          </div>
        ) : (
          visibleTasks.map((task) => (
            <WorkItemRow
              key={task.id}
              task={task}
              myTaskTab={myTaskTab}
              openDateRowId={openDateRowId}
              setOpenDateRowId={setOpenDateRowId}
              onSelectTask={onSelectTask}
              onChangeTaskStatus={onChangeTaskStatus}
              onQuickDueDateChange={onQuickDueDateChange}
            />
          ))
        )}
        {myTaskTab !== 'personal' && filteredMyTasks.length > 6 && (
          <button
            onClick={() => setShowAllTasks((p) => !p)}
            className="w-full text-center text-xs text-[#737373] hover:text-[#E0B954] py-2.5 transition-colors"
          >
            {showAllTasks ? 'Show less' : `Show ${filteredMyTasks.length - 6} more`}
          </button>
        )}
      </div>

      {(myTaskTab === 'upcoming' || myTaskTab === 'overdue') && filteredMyTasks.length > 0 && (
        <StatusBar filteredMyTasks={filteredMyTasks} />
      )}
    </div>
  );
};

export default MyTasksBox;
