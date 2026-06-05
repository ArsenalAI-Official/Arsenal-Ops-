import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Target, Plus, CheckCircle2, Calendar, Trash2 } from 'lucide-react';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';

interface Goal {
  id: number;
  title: string;
  description?: string;
  status: string;
  progress: number;
  due_date?: string;
  completed_at?: string;
}

interface Milestone {
  id: number;
  title: string;
  description?: string;
  due_date?: string;
  completed_at?: string;
  is_completed: boolean;
}

interface GoalsViewProps {
  goals: Goal[];
  milestones: Milestone[];
  onAddGoal?: (goal: { title: string; description?: string; due_date?: string }) => void;
  onAddMilestone?: (milestone: { title: string; description?: string; due_date?: string }) => void;
  onUpdateGoalProgress?: (goalId: number, progress: number) => void;
  onCompleteMilestone?: (milestoneId: number) => void;
  onDeleteGoal?: (goalId: number) => void;
  onDeleteMilestone?: (milestoneId: number) => void;
}

const GoalsView: React.FC<GoalsViewProps> = ({
  goals,
  milestones,
  onAddGoal,
  onAddMilestone,
  onUpdateGoalProgress,
  onCompleteMilestone,
  onDeleteGoal,
  onDeleteMilestone,
}) => {
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', description: '', due_date: '' });
  const [newMilestone, setNewMilestone] = useState({ title: '', description: '', due_date: '' });

  const handleAddGoal = () => {
    if (newGoal.title && onAddGoal) {
      onAddGoal({
        title: newGoal.title,
        description: newGoal.description || undefined,
        due_date: newGoal.due_date || undefined,
      });
      setNewGoal({ title: '', description: '', due_date: '' });
      setShowAddGoal(false);
    }
  };

  const handleAddMilestone = () => {
    if (newMilestone.title && onAddMilestone) {
      onAddMilestone({
        title: newMilestone.title,
        description: newMilestone.description || undefined,
        due_date: newMilestone.due_date || undefined,
      });
      setNewMilestone({ title: '', description: '', due_date: '' });
      setShowAddMilestone(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-[#E0B954]/15 text-[#E0B954] border-[#E0B954]/30';
      case 'cancelled':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Goals Section */}
      <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="w-5 h-5" />
              Goals
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddGoal(!showAddGoal)}
              className="border-[rgba(255,255,255,0.08)]"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Goal
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddGoal && (
            <div className="mb-4 p-4 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]">
              <Input
                placeholder="Goal title"
                value={newGoal.title}
                onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                className="mb-2 bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white"
              />
              <Input
                placeholder="Description (optional)"
                value={newGoal.description}
                onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                className="mb-2 bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white"
              />
              <Input
                type="date"
                value={newGoal.due_date}
                onChange={(e) => setNewGoal({ ...newGoal, due_date: e.target.value })}
                className="mb-3 bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white"
              />
              <div className="flex gap-2">
                <Button onClick={handleAddGoal} size="sm">
                  Add
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowAddGoal(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {goals.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Target className="text-[#737373]" />
                </EmptyMedia>
                <EmptyTitle className="text-[#737373]">No goals yet</EmptyTitle>
                <EmptyDescription>Create goals to track project objectives</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-4">
              {goals.map((goal) => (
                <div
                  key={goal.id}
                  className="p-4 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-medium">{goal.title}</h3>
                        <Badge variant="outline" className={getStatusColor(goal.status)}>
                          {goal.status}
                        </Badge>
                      </div>
                      {goal.description && (
                        <p className="text-[#737373] text-sm">{goal.description}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteGoal?.(goal.id)}
                      className="text-[#737373] hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[#737373] text-sm">Progress</span>
                      <span className="text-white text-sm font-medium">{goal.progress}%</span>
                    </div>
                    <Progress value={goal.progress} className="h-2" />
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    {goal.due_date && (
                      <div className="flex items-center gap-1 text-[#737373]">
                        <Calendar className="w-3 h-3" />
                        Due: {new Date(goal.due_date).toLocaleDateString()}
                      </div>
                    )}
                    <div className="flex gap-1">
                      {[25, 50, 75, 100].map((val) => (
                        <Button
                          key={val}
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => onUpdateGoalProgress?.(goal.id, val)}
                        >
                          {val}%
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Milestones Section */}
      <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Milestones
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddMilestone(!showAddMilestone)}
              className="border-[rgba(255,255,255,0.08)]"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Milestone
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddMilestone && (
            <div className="mb-4 p-4 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]">
              <Input
                placeholder="Milestone title"
                value={newMilestone.title}
                onChange={(e) => setNewMilestone({ ...newMilestone, title: e.target.value })}
                className="mb-2 bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white"
              />
              <Input
                placeholder="Description (optional)"
                value={newMilestone.description}
                onChange={(e) => setNewMilestone({ ...newMilestone, description: e.target.value })}
                className="mb-2 bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white"
              />
              <Input
                type="date"
                value={newMilestone.due_date}
                onChange={(e) => setNewMilestone({ ...newMilestone, due_date: e.target.value })}
                className="mb-3 bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white"
              />
              <div className="flex gap-2">
                <Button onClick={handleAddMilestone} size="sm">
                  Add
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowAddMilestone(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {milestones.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CheckCircle2 className="text-[#737373]" />
                </EmptyMedia>
                <EmptyTitle className="text-[#737373]">No milestones yet</EmptyTitle>
                <EmptyDescription>Create milestones to track key dates</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[rgba(255,255,255,0.08)]" />

              <div className="space-y-4">
                {milestones.map((milestone) => (
                  <div key={milestone.id} className="relative flex items-start gap-4 pl-10">
                    {/* Timeline dot */}
                    <div
                      className={`absolute left-2 w-4 h-4 rounded-full border-2 ${
                        milestone.is_completed
                          ? 'bg-[#E0B954] border-[#E0B954]'
                          : 'bg-[#0d0d0d] border-[#E0B954]'
                      }`}
                    />

                    <div className="flex-1 p-4 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-white font-medium">{milestone.title}</h3>
                          {milestone.description && (
                            <p className="text-[#737373] text-sm mt-1">{milestone.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {milestone.is_completed ? (
                            <Badge
                              variant="outline"
                              className="bg-[#E0B954]/15 text-[#E0B954] border-[#E0B954]/30"
                            >
                              Completed
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onCompleteMilestone?.(milestone.id)}
                              className="border-[rgba(255,255,255,0.08)]"
                            >
                              Complete
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDeleteMilestone?.(milestone.id)}
                            className="text-[#737373] hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      {milestone.due_date && (
                        <div className="flex items-center gap-1 text-[#737373] text-sm mt-2">
                          <Calendar className="w-3 h-3" />
                          {milestone.is_completed && milestone.completed_at
                            ? `Completed: ${new Date(milestone.completed_at).toLocaleDateString()}`
                            : `Due: ${new Date(milestone.due_date).toLocaleDateString()}`}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GoalsView;
