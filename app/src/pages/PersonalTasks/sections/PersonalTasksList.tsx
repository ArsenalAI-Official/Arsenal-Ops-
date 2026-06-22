import { CheckCircle2, Circle, Trash2, Edit2, Calendar, Flag, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import type { PersonalTask } from '../types';
import { PRIORITY_CONFIG } from '../types';

interface PersonalTasksListProps {
  isLoading: boolean;
  tasks: PersonalTask[];
  filteredTasks: PersonalTask[];
  canAssignToProject: boolean;
  onToggleComplete: (task: PersonalTask) => void;
  onConvert: (task: PersonalTask) => void;
  onEdit: (task: PersonalTask) => void;
  onDelete: (taskId: number) => void;
}

const PersonalTasksList = ({
  isLoading,
  tasks,
  filteredTasks,
  canAssignToProject,
  onToggleComplete,
  onConvert,
  onEdit,
  onDelete,
}: PersonalTasksListProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="sm" className="w-6 h-6" />
      </div>
    );
  }

  if (filteredTasks.length === 0) {
    return (
      <div className="text-center py-20">
        <CheckCircle2 className="w-12 h-12 text-[#E0B954]/30 mx-auto mb-3" />
        <p className="text-[#737373]">
          {tasks.length === 0
            ? 'No tasks yet. Create one to get started!'
            : 'No tasks match your filters.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filteredTasks.map((task) => (
        <div
          key={task.id}
          className={`group relative bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-xl p-4 transition-all duration-300 hover:border-[rgba(224,185,84,0.2)] hover:bg-[rgba(255,255,255,0.035)] ${
            task.status === 'done' ? 'opacity-60' : ''
          }`}
        >
          <div className="flex items-start gap-4">
            {/* Checkbox */}
            <button
              onClick={() => onToggleComplete(task)}
              className="flex-shrink-0 mt-1 text-[#737373] hover:text-[#E0B954] transition-colors"
              title={task.status === 'done' ? 'Mark as pending' : 'Mark as complete'}
            >
              {task.status === 'done' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Circle className="w-5 h-5" />
              )}
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3
                className={`font-semibold text-white ${task.status === 'done' ? 'line-through text-[#737373]' : ''}`}
              >
                {task.title}
              </h3>
              {task.description && (
                <p className="text-sm text-[#a3a3a3] mt-1 line-clamp-2">{task.description}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {task.due_date && (
                  <div className="flex items-center gap-1 text-xs text-[#737373]">
                    <Calendar className="w-3 h-3" />
                    {new Date(task.due_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                )}
                {task.estimated_hours > 0 && (
                  <Badge
                    variant="outline"
                    className="text-xs bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]"
                  >
                    {task.estimated_hours}h
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={{
                    borderColor: PRIORITY_CONFIG[task.priority]?.color + '40',
                    color: PRIORITY_CONFIG[task.priority]?.color,
                    backgroundColor: PRIORITY_CONFIG[task.priority]?.color + '15',
                  }}
                >
                  <Flag className="w-3 h-3 mr-1" />
                  {PRIORITY_CONFIG[task.priority]?.label}
                </Badge>
                {task.is_converted && (
                  <Badge className="text-xs bg-[#34D399]/20 text-[#34D399] border-0">
                    Converted
                  </Badge>
                )}
              </div>
            </div>

            {/* Actions */}
            {!task.is_converted && (
              <div className="flex-shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {canAssignToProject && (
                  <button
                    onClick={() => onConvert(task)}
                    className="p-2 rounded-lg hover:bg-[rgba(224,185,84,0.1)] text-[#737373] hover:text-[#E0B954] transition-colors"
                    title="Tag to project"
                  >
                    <Tag className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => onEdit(task)}
                  className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.08)] text-[#737373] hover:text-[#E0B954] transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(task.id)}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-[#737373] hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default PersonalTasksList;
