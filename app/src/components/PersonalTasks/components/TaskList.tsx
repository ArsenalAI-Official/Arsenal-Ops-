import { CheckCircle2, Calendar, ArrowRight, Trash2, Edit2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { parseLocalDate } from '@/lib/dateUtils';
import type { PersonalTask } from '../types';
import { getStatusColor, getPriorityColor } from '../types';

interface TaskListProps {
  activeTasks: PersonalTask[];
  convertedTasks: PersonalTask[];
  onEdit: (task: PersonalTask) => void;
  onConvert: (task: PersonalTask) => void;
  onDelete: (taskId: number) => void;
}

const TaskList = ({ activeTasks, convertedTasks, onEdit, onConvert, onDelete }: TaskListProps) => {
  return (
    <>
      {/* Active Tasks */}
      <div className="space-y-3">
        {activeTasks.length === 0 ? (
          <div className="text-center py-8 text-[#737373]">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No personal tasks yet</p>
            <p className="text-sm">Create a task to get started</p>
          </div>
        ) : (
          activeTasks.map((task) => (
            <div
              key={task.id}
              className="p-4 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.1)] transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-white font-medium mb-1">{task.title}</h4>
                  {task.description && (
                    <p className="text-[#737373] text-sm mb-2 line-clamp-2">{task.description}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={getStatusColor(task.status)}>{task.status}</Badge>
                    <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                    {task.estimated_hours > 0 && (
                      <span className="text-[#737373] text-xs">{task.estimated_hours}h</span>
                    )}
                    {task.due_date && (
                      <span className="text-[#737373] text-xs flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {parseLocalDate(task.due_date)?.toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(task)}
                    className="text-[#E0B954] hover:text-[#C79E3B] hover:bg-[#E0B954]/10"
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onConvert(task)}
                    className="text-[#E0B954] hover:text-[#C79E3B] hover:bg-[#E0B954]/10"
                  >
                    <ArrowRight className="w-4 h-4 mr-1" />
                    Convert
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(task.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Converted Tasks */}
      {convertedTasks.length > 0 && (
        <div className="mt-6 pt-6 border-t border-[rgba(255,255,255,0.05)]">
          <h4 className="text-[#737373] text-sm font-medium mb-3">Converted to Project Tickets</h4>
          <div className="space-y-2">
            {convertedTasks.map((task) => (
              <div
                key={task.id}
                className="p-3 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)] opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="text-white line-through">{task.title}</span>
                  <Badge className="bg-green-500/20 text-green-400">Converted</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default TaskList;
