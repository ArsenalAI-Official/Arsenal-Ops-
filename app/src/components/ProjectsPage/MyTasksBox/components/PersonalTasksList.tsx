import { Plus, X, CheckCircle2, Edit2, Circle, Flag, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PersonalTask } from '../../types';
import { priorityColor } from '../lib';

interface PersonalTasksListProps {
  activePersonalTasks: PersonalTask[];
  visiblePersonalTasks: PersonalTask[];
  canAssignToProject: boolean;
  onAddPersonalTaskClick: () => void;
  onTogglePersonalTaskComplete: (task: PersonalTask) => void;
  onEditPersonalTask: (task: PersonalTask) => void;
  onConvertPersonalTask: (task: PersonalTask) => void;
  onDeletePersonalTask: (taskId: number) => void;
  onNavigateToPersonalTasks: () => void;
}

const PersonalTasksList = ({
  activePersonalTasks,
  visiblePersonalTasks,
  canAssignToProject,
  onAddPersonalTaskClick,
  onTogglePersonalTaskComplete,
  onEditPersonalTask,
  onConvertPersonalTask,
  onDeletePersonalTask,
  onNavigateToPersonalTasks,
}: PersonalTasksListProps) => {
  if (activePersonalTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <CheckCircle2 className="w-8 h-8 text-[#E0B954]/30 mb-2" />
        <p className="text-sm text-[#737373]">No personal tasks yet</p>
        <button
          onClick={onAddPersonalTaskClick}
          className="mt-3 text-xs text-[#E0B954] hover:text-[#C79E3B] flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add your first task
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {visiblePersonalTasks.map((task) => {
        const color = priorityColor(task.priority);
        return (
          <div
            key={task.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgba(255,255,255,0.03)] transition-colors group ${
              task.status === 'done' ? 'opacity-60' : ''
            }`}
          >
            <button
              onClick={() => onTogglePersonalTaskComplete(task)}
              className="flex-shrink-0 text-[#737373] hover:text-[#E0B954] transition-colors"
              title={task.status === 'done' ? 'Mark as pending' : 'Mark as complete'}
            >
              {task.status === 'done' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Circle className="w-4 h-4" />
              )}
            </button>
            <span
              className={`flex-1 text-sm truncate ${
                task.status === 'done' ? 'line-through text-[#737373]' : 'text-[#f5f5f5]'
              }`}
            >
              {task.title}
            </span>
            <Badge
              variant="outline"
              className="text-xs"
              style={{
                borderColor: color + '40',
                color,
                backgroundColor: color + '15',
              }}
            >
              <Flag className="w-3 h-3 mr-1" />
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </Badge>
            <button
              onClick={() => onEditPersonalTask(task)}
              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-[#E0B954] hover:text-[#C79E3B] flex-shrink-0 transition-opacity"
              title="Edit task"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </button>
            {canAssignToProject && (
              <button
                onClick={() => onConvertPersonalTask(task)}
                className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-[#E0B954] hover:text-[#C79E3B] flex-shrink-0 transition-opacity"
                title="Convert to project ticket"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Tag to project
              </button>
            )}
            <button
              onClick={() => onDeletePersonalTask(task.id)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-[#737373] hover:text-red-400 transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
      {activePersonalTasks.length > 5 && (
        <button
          onClick={onNavigateToPersonalTasks}
          className="w-full text-center text-xs text-[#737373] hover:text-[#E0B954] py-2.5 transition-colors"
        >
          View all ({activePersonalTasks.length - 5} more) →
        </button>
      )}
    </div>
  );
};

export default PersonalTasksList;
