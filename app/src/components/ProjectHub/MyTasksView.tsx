import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Briefcase, AlertTriangle, CheckCircle2, Calendar } from 'lucide-react';
import { parseLocalDate } from '@/lib/dates';

interface Task {
  id: string;
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  project_id: number;
  project_name: string;
  due_date?: string;
  estimated_hours?: number;
  logged_hours?: number;
  remaining_hours?: number;
  is_overdue?: boolean;
}

interface MyTasksViewProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
}

const MyTasksView: React.FC<MyTasksViewProps> = ({ tasks, onTaskClick }) => {
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'overdue'>('all');

  const filteredTasks = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    switch (filter) {
      case 'today':
        return tasks.filter((task) => {
          if (!task.due_date) return false;
          const dueDate = parseLocalDate(task.due_date);
          return dueDate >= today && dueDate < new Date(today.getTime() + 24 * 60 * 60 * 1000);
        });
      case 'week':
        return tasks.filter((task) => {
          if (!task.due_date) return false;
          const dueDate = parseLocalDate(task.due_date);
          return dueDate >= today && dueDate <= weekEnd;
        });
      case 'overdue':
        return tasks.filter((task) => task.is_overdue);
      default:
        return tasks;
    }
  }, [tasks, filter]);

  // Group by project
  const groupedTasks = useMemo(() => {
    return filteredTasks.reduce(
      (acc, task) => {
        if (!acc[task.project_name]) {
          acc[task.project_name] = [];
        }
        acc[task.project_name].push(task);
        return acc;
      },
      {} as Record<string, Task[]>,
    );
  }, [filteredTasks]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'bg-[#E0B954]/15 text-[#E0B954] border-[#E0B954]/30';
      case 'in_progress':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'in_review':
        return 'bg-[#E0B954]/15 text-[#E0B954] border-[#E0B954]/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const stats = useMemo(() => {
    return {
      total: tasks.length,
      overdue: tasks.filter((t) => t.is_overdue).length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      completed: tasks.filter((t) => t.status === 'done').length,
    };
  }, [tasks]);

  return (
    <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Briefcase className="w-5 h-5" />
          My Tasks
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-3 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]">
            <p className="text-2xl font-bold text-white">{stats.total}</p>
            <p className="text-[#737373] text-sm">Total</p>
          </div>
          <div className="p-3 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]">
            <p className="text-2xl font-bold text-[#F59E0B]">{stats.inProgress}</p>
            <p className="text-[#737373] text-sm">In Progress</p>
          </div>
          <div className="p-3 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]">
            <p className="text-2xl font-bold text-[#EF4444]">{stats.overdue}</p>
            <p className="text-[#737373] text-sm">Overdue</p>
          </div>
          <div className="p-3 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]">
            <p className="text-2xl font-bold text-[#E0B954]">{stats.completed}</p>
            <p className="text-[#737373] text-sm">Completed</p>
          </div>
        </div>

        {/* Filters */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="mb-6">
          <TabsList className="bg-[#0A0A14] border border-[rgba(255,255,255,0.05)]">
            <TabsTrigger value="all" className="data-[state=active]:bg-[#E0B954]">
              All ({tasks.length})
            </TabsTrigger>
            <TabsTrigger value="today" className="data-[state=active]:bg-[#E0B954]">
              Today
            </TabsTrigger>
            <TabsTrigger value="week" className="data-[state=active]:bg-[#E0B954]">
              This Week
            </TabsTrigger>
            <TabsTrigger value="overdue" className="data-[state=active]:bg-[#E0B954]">
              Overdue ({stats.overdue})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Tasks by Project */}
        {Object.keys(groupedTasks).length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="w-12 h-12 text-[#E0B954] mx-auto mb-2" />
            <p className="text-[#737373]">No tasks found</p>
            <p className="text-[#737373] text-sm">
              {filter === 'all' ? 'You have no assigned tasks' : `No ${filter} tasks`}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedTasks).map(([projectName, projectTasks]) => (
              <div key={projectName}>
                <h3 className="text-[#C79E3B] font-medium mb-3 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  {projectName}
                  <span className="text-[#737373] text-sm font-normal">
                    ({projectTasks.length})
                  </span>
                </h3>
                <div className="space-y-2">
                  {projectTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.08)] cursor-pointer transition-colors"
                      onClick={() => onTaskClick?.(task)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[#E0B954] text-sm font-medium">{task.key}</span>
                            <span className="text-white">{task.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={getStatusColor(task.status)}>
                              {task.status.replace('_', ' ')}
                            </Badge>
                            <Badge variant="outline" className={getPriorityColor(task.priority)}>
                              {task.priority}
                            </Badge>
                            {task.is_overdue && (
                              <Badge
                                variant="outline"
                                className="bg-red-500/20 text-red-400 border-red-500/30"
                              >
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Overdue
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {task.due_date && (
                            <div className="flex items-center gap-1 text-[#737373] text-sm mb-1">
                              <Calendar className="w-3 h-3" />
                              {parseLocalDate(task.due_date).toLocaleDateString()}
                            </div>
                          )}
                          {task.logged_hours !== undefined &&
                            task.estimated_hours !== undefined && (
                              <div className="text-[#737373] text-sm">
                                {task.estimated_hours}h / {task.logged_hours}h
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MyTasksView;
