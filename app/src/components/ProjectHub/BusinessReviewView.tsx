import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Target,
  Activity,
  AlertCircle,
  MessageSquare,
  ExternalLink,
  ChevronDown,
  Circle,
  HelpCircle,
  X,
} from 'lucide-react';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';

interface WorkItem {
  id: string;
  key: string;
  title?: string;
  type: string;
  status: string;
  priority: string;
  assignee?: string;
  due_date?: string;
}

interface Milestone {
  id: number;
  title: string;
  description?: string;
  due_date?: string;
  is_completed: boolean;
}

interface Sprint {
  id: number;
  name: string;
  status: string;
  completion_pct: number;
  velocity?: number | null;
  total_items: number;
  done_count: number;
  total_points: number;
  completed_points: number;
  start_date?: string | null;
  end_date?: string | null;
}

interface ProjectAnalytics {
  total_items: number;
  total_story_points: number;
  completed_points: number;
  status_distribution: Record<string, number>;
  velocity_data: { sprint_name: string; committed: number; completed: number }[];
  team_performance: {
    name: string;
    total_items: number;
    completed_items: number;
    total_points: number;
    completed_points: number;
  }[];
}

interface BusinessReviewComment {
  id: number;
  comment_id: number;
  work_item_id: number;
  work_item_key: string;
  work_item_title: string;
  author_id: number | null;
  author_name: string;
  content: string;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
  mentions: number[];
}

interface BusinessReviewViewProps {
  project: any;
  analytics: ProjectAnalytics | null;
  sprints: Sprint[];
  milestones: Milestone[];
  workItems: WorkItem[];
}

const BusinessReviewView: React.FC<BusinessReviewViewProps> = ({
  project,
  analytics,
  sprints,
  milestones,
  workItems,
}) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [businessReviewComments, setBusinessReviewComments] = useState<BusinessReviewComment[]>([]);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [isBusinessReviewExpanded, setIsBusinessReviewExpanded] = useState(true);
  const [showHealthExplanation, setShowHealthExplanation] = useState(false);
  const [showOverdueDialog, setShowOverdueDialog] = useState(false);
  const [showBugsDialog, setShowBugsDialog] = useState(false);
  const [showCriticalDialog, setShowCriticalDialog] = useState(false);

  // Fetch business review comments on mount
  useEffect(() => {
    const fetchBusinessReviewComments = async () => {
      if (!project?.id) return;

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/comments/project/${project.id}/business-review`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (response.ok) {
          const comments = await response.json();
          setBusinessReviewComments(comments);
        }
      } catch (error) {
        console.error('Failed to fetch business review comments:', error);
      }
    };

    fetchBusinessReviewComments();
  }, [project?.id, token]);

  const toggleCommentExpanded = (commentId: number) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(commentId)) {
      newExpanded.delete(commentId);
    } else {
      newExpanded.add(commentId);
    }
    setExpandedComments(newExpanded);
  };

  const toggleCommentResolved = async (commentId: number, currentStatus: boolean) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/comments/${commentId}/resolve?is_resolved=${!currentStatus}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.ok) {
        // Update the local state
        setBusinessReviewComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, is_resolved: !currentStatus } : c)),
        );
      }
    } catch (error) {
      console.error('Failed to update comment resolved status:', error);
    }
  };

  const today = new Date();

  const overdueItems = workItems.filter(
    (item) => item.due_date && new Date(item.due_date) < today && item.status !== 'done',
  ).length;

  const openBugs = workItems.filter((item) => item.type === 'bug' && item.status !== 'done').length;

  // Filter lists for dialogs
  const overdueItemsList = workItems.filter(
    (item) => item.due_date && new Date(item.due_date) < today && item.status !== 'done',
  );
  const bugsList = workItems.filter((item) => item.type === 'bug' && item.status !== 'done');
  const criticalItemsList = workItems.filter(
    (item) => item.priority === 'critical' && item.status !== 'done',
  );

  const completedMilestones = milestones.filter((m) => m.is_completed).length;
  const totalMilestones = milestones.length;
  const milestonePct =
    totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  const activeSprint = sprints.find((s) => s.status === 'active');

  const completionPct =
    analytics && analytics.total_story_points > 0
      ? Math.round((analytics.completed_points / analytics.total_story_points) * 100)
      : 0;

  // Health score: start at 100, subtract for issues
  let healthScore = 100;
  const deductions: Array<{ label: string; amount: number; detail: string }> = [];

  const overdueDeduction = Math.min(30, overdueItems * 5);
  if (overdueDeduction > 0) {
    healthScore -= overdueDeduction;
    deductions.push({
      label: 'Overdue Items',
      amount: overdueDeduction,
      detail: `${overdueItems} overdue items × 5 points each (max 30)`,
    });
  }

  const bugsDeduction = Math.min(20, openBugs * 4);
  if (bugsDeduction > 0) {
    healthScore -= bugsDeduction;
    deductions.push({
      label: 'Open Bugs',
      amount: bugsDeduction,
      detail: `${openBugs} open bugs × 4 points each (max 20)`,
    });
  }

  if (totalMilestones > 0 && milestonePct < 50 && activeSprint) {
    healthScore -= 10;
    deductions.push({
      label: 'Low Milestone Progress',
      amount: 10,
      detail: `Only ${milestonePct}% of milestones completed with active sprint`,
    });
  }

  healthScore = Math.max(0, Math.min(100, healthScore));

  const getHealthMeta = (score: number) => {
    if (score >= 80)
      return {
        color: '#34D399',
        label: 'Healthy',
        borderColor: 'border-[#34D399]/20',
        bgColor: 'bg-[#34D399]/5',
      };
    if (score >= 60)
      return {
        color: '#FBBF24',
        label: 'At Risk',
        borderColor: 'border-[#FBBF24]/20',
        bgColor: 'bg-[#FBBF24]/5',
      };
    return {
      color: '#EF4444',
      label: 'Critical',
      borderColor: 'border-[#EF4444]/20',
      bgColor: 'bg-[#EF4444]/5',
    };
  };
  const health = getHealthMeta(healthScore);

  const onTimeDeliveryPct =
    analytics && analytics.total_items > 0
      ? Math.round(((analytics.status_distribution?.done || 0) / analytics.total_items) * 100)
      : 0;

  const criticalOpen = workItems.filter(
    (i) => i.priority === 'critical' && i.status !== 'done',
  ).length;

  const renderTextWithNewlines = (text: string) => {
    if (!text) return null;
    return text
      .split('\n')
      .map((line, index) => [
        <span key={`line-${index}`}>{line}</span>,
        index < text.split('\n').length - 1 ? <br key={`br-${index}`} /> : null,
      ])
      .flat()
      .filter(Boolean);
  };

  return (
    <div className="space-y-6">
      {/* Top Row: Health Score + KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Health Score */}
        <div
          onClick={() => setShowHealthExplanation(true)}
          className={`bg-[rgba(255,255,255,0.02)] border ${health.borderColor} ${health.bgColor} rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer hover:bg-[rgba(255,255,255,0.04)] transition-all`}
        >
          <div className="relative w-20 h-20 mb-3">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="10"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={health.color}
                strokeWidth="10"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - healthScore / 100)}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-white">{healthScore}</span>
            </div>
          </div>
          <p className="text-sm font-semibold text-white">Project Health</p>
          <span
            className="mt-1 text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${health.color}20`, color: health.color }}
          >
            {health.label}
          </span>
          <div className="mt-2 flex items-center gap-1 text-xs text-[#737373] hover:text-white transition-colors">
            <HelpCircle className="w-3 h-3" />
            Click to see calculation
          </div>
        </div>

        {/* On-Time Delivery */}
        <div
          onClick={() => setShowOverdueDialog(true)}
          className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 cursor-pointer hover:bg-[rgba(255,255,255,0.04)] transition-all"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-[#34D399]/10 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-[#34D399]" />
            </div>
            <span className="text-xs text-[#737373]">On-Time Delivery & Overdue</span>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-2xl font-bold text-white">{onTimeDeliveryPct}%</p>
              <p className="text-xs text-[#737373]">
                {analytics?.status_distribution?.done || 0} / {analytics?.total_items || 0}{' '}
                completed
              </p>
            </div>
            <div className="border-t border-[rgba(255,255,255,0.05)] pt-2">
              <p className="text-xs text-[#EF4444] font-medium">{overdueItems} overdue</p>
            </div>
          </div>
        </div>

        {/* Open Bugs */}
        <div
          onClick={() => setShowBugsDialog(true)}
          className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 cursor-pointer hover:bg-[rgba(255,255,255,0.04)] transition-all"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-[#EF4444]/10 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-[#EF4444]" />
            </div>
            <span className="text-xs text-[#737373]">Open Bugs</span>
          </div>
          <p className="text-2xl font-bold text-white">{openBugs}</p>
          <p className="text-xs text-[#737373] mt-1">issues to resolve</p>
        </div>

        {/* Critical Items */}
        <div
          onClick={() => setShowCriticalDialog(true)}
          className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 cursor-pointer hover:bg-[rgba(255,255,255,0.04)] transition-all"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-[#F97316]/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-[#F97316]" />
            </div>
            <span className="text-xs text-[#737373]">Critical Items Open</span>
          </div>
          <p className="text-2xl font-bold text-white">{criticalOpen}</p>
          <p className="text-xs text-[#737373] mt-1">awaiting attention</p>
        </div>
      </div>

      {/* Milestone Progress */}
      {milestones.length > 0 && (
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#C79E3B]/10 flex items-center justify-center">
                <Target className="w-4 h-4 text-[#C79E3B]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Milestone Progress</h3>
                <p className="text-xs text-[#737373]">
                  {completedMilestones} of {totalMilestones} completed
                </p>
              </div>
            </div>
            <Badge
              className={`border-0 ${
                milestonePct >= 50
                  ? 'bg-[#E0B954]/20 text-[#E0B954]'
                  : 'bg-[#F59E0B]/20 text-[#F59E0B]'
              }`}
            >
              {milestonePct}%
            </Badge>
          </div>
          <div className="space-y-3">
            {milestones.slice(0, 8).map((milestone) => {
              const isOverdue =
                milestone.due_date &&
                !milestone.is_completed &&
                new Date(milestone.due_date) < today;
              return (
                <div key={milestone.id} className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      milestone.is_completed
                        ? 'bg-[#E0B954]/20'
                        : isOverdue
                          ? 'bg-[#EF4444]/20'
                          : 'bg-[#737373]/20'
                    }`}
                  >
                    {milestone.is_completed ? (
                      <CheckCircle2 className="w-3 h-3 text-[#E0B954]" />
                    ) : isOverdue ? (
                      <AlertTriangle className="w-3 h-3 text-[#EF4444]" />
                    ) : (
                      <Clock className="w-3 h-3 text-[#737373]" />
                    )}
                  </div>
                  <span
                    className={`text-sm flex-1 ${
                      milestone.is_completed ? 'text-[#737373] line-through' : 'text-[#f5f5f5]'
                    }`}
                  >
                    {milestone.title}
                  </span>
                  {milestone.due_date && (
                    <span className={`text-xs ${isOverdue ? 'text-[#EF4444]' : 'text-[#737373]'}`}>
                      {new Date(milestone.due_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stakeholder Summary */}
      <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-[#E0B954]/10 flex items-center justify-center">
            <Activity className="w-4 h-4 text-[#E0B954]" />
          </div>
          <h3 className="text-sm font-semibold text-white">Stakeholder Summary</h3>
        </div>
        <div className="space-y-3">
          <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4">
            <p className="text-xs text-[#737373] mb-2">Overall Completion</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#E0B954] to-[#E0B954] rounded-full transition-all"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <span className="text-sm font-bold text-white">{completionPct}%</span>
            </div>
          </div>
          {activeSprint && (
            <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4">
              <p className="text-xs text-[#737373] mb-1">Active Sprint</p>
              <p className="text-sm font-semibold text-white">{activeSprint.name}</p>
              <p className="text-xs text-[#E0B954] mt-1">{activeSprint.completion_pct}% complete</p>
            </div>
          )}
          <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4">
            <p className="text-xs text-[#737373] mb-2">Key Metrics</p>
            <ul className="space-y-2">
              {[
                { label: 'Total Work Items', value: analytics?.total_items || 0 },
                {
                  label: 'Points Completed',
                  value: `${analytics?.completed_points || 0} / ${analytics?.total_story_points || 0}`,
                },
                {
                  label: 'Active Sprints',
                  value: sprints.filter((s) => s.status === 'active').length,
                },
              ].map(({ label, value }) => (
                <li key={label} className="flex items-center justify-between text-sm">
                  <span className="text-[#a3a3a3]">{label}</span>
                  <span className="text-white font-medium">{value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Business Review Comments */}
      <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-[#A78BFA]/10 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-[#A78BFA]" />
          </div>
          <h3 className="text-sm font-semibold text-white">Business Review Comments</h3>
          {businessReviewComments.length > 0 && (
            <Badge className="bg-[#A78BFA]/20 text-[#A78BFA] border-0 ml-auto">
              {businessReviewComments.length}
            </Badge>
          )}
          {businessReviewComments.length > 0 && (
            <button
              onClick={() => setIsBusinessReviewExpanded(!isBusinessReviewExpanded)}
              className="p-1 hover:bg-[rgba(167,139,250,0.1)] rounded-lg transition-colors"
              title={isBusinessReviewExpanded ? 'Collapse' : 'Expand'}
            >
              <ChevronDown
                className={`w-5 h-5 text-[#A78BFA] transition-transform ${isBusinessReviewExpanded ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>
        {businessReviewComments.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 text-[#737373] mx-auto mb-3" />
            <p className="text-sm text-[#737373]">No comments yet</p>
          </div>
        ) : (
          isBusinessReviewExpanded && (
            <>
              <div className="space-y-4">
                {businessReviewComments.slice(0, 10).map((comment) => {
                  const isExpanded = expandedComments.has(comment.id);
                  const isLongContent = comment.content.length > 150;
                  const displayContent = isExpanded
                    ? comment.content
                    : comment.content.substring(0, 150);

                  return (
                    <div
                      key={comment.id}
                      className={`rounded-xl p-4 ${comment.is_resolved ? 'bg-[rgba(52,211,153,0.05)] border border-[rgba(52,211,153,0.2)]' : 'bg-[rgba(167,139,250,0.05)] border border-[rgba(167,139,250,0.2)]'}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${comment.is_resolved ? 'bg-[rgba(52,211,153,0.2)] text-[#34D399]' : 'bg-[rgba(167,139,250,0.2)] text-[#A78BFA]'}`}
                            >
                              {comment.author_name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <span className="text-sm font-medium text-[#f5f5f5]">
                              {comment.author_name}
                            </span>
                            <span className="text-xs text-[#737373]">
                              {new Date(comment.created_at).toLocaleDateString()}
                            </span>
                            {comment.is_resolved && (
                              <span className="ml-auto px-2 py-0.5 rounded-md bg-[rgba(52,211,153,0.2)] text-[#34D399] text-[10px] font-medium">
                                RESOLVED
                              </span>
                            )}
                          </div>
                          <a
                            onClick={() =>
                              navigate(`/project/${project.id}/board/${comment.work_item_id}`)
                            }
                            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.3)] text-[#E0B954] hover:bg-[rgba(224,185,84,0.2)] transition-colors text-xs font-medium mb-2 cursor-pointer"
                          >
                            <span className="font-mono">{comment.work_item_key}</span>
                            <span className="truncate">{comment.work_item_title}</span>
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <button
                            onClick={() => toggleCommentResolved(comment.id, comment.is_resolved)}
                            className={`p-1.5 rounded-lg transition-colors ${comment.is_resolved ? 'hover:bg-[rgba(52,211,153,0.1)] text-[#34D399]' : 'hover:bg-[rgba(167,139,250,0.1)] text-[#A78BFA]'}`}
                            title={comment.is_resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                          >
                            {comment.is_resolved ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>
                          {isLongContent && (
                            <button
                              onClick={() => toggleCommentExpanded(comment.id)}
                              className="ml-2 p-1 hover:bg-[rgba(167,139,250,0.1)] rounded-lg transition-colors flex-shrink-0"
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              <ChevronDown
                                className={`w-4 h-4 text-[#A78BFA] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-[#a3a3a3] leading-relaxed whitespace-pre-wrap">
                        {renderTextWithNewlines(displayContent)}
                        {!isExpanded && isLongContent && (
                          <span className="text-[#737373]">...</span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
              {businessReviewComments.length > 10 && (
                <div className="mt-4 text-center">
                  <p className="text-xs text-[#737373]">
                    Showing 10 of {businessReviewComments.length} comments
                  </p>
                </div>
              )}
            </>
          )
        )}
      </div>

      {/* Overdue Items Dialog */}
      {showOverdueDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[rgba(255,255,255,0.05)] sticky top-0 bg-[#0d0d0d]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#EF4444]/20">
                  <Clock className="w-5 h-5 text-[#EF4444]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Overdue Items</h2>
                  <p className="text-xs text-[#737373]">
                    {overdueItemsList.length} item{overdueItemsList.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowOverdueDialog(false)}
                className="text-[#737373] hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-3">
              {overdueItemsList.length === 0 ? (
                <p className="text-sm text-[#737373] text-center py-8">No overdue items 🎉</p>
              ) : (
                overdueItemsList.map((item) => (
                  <a
                    key={item.id}
                    onClick={() => {
                      window.open(`/project/${project.id}/board/${item.id}`, '_blank');
                    }}
                    className="flex items-center gap-3 p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-all cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-md flex items-center justify-center bg-[#EF4444]/10 flex-shrink-0">
                      <Clock className="w-4 h-4 text-[#EF4444]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-mono text-[#E0B954] block mb-1">
                        {item.key}
                      </span>
                      <p className="text-sm text-white truncate">{item.title || item.key}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[#737373] flex-shrink-0" />
                  </a>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[rgba(255,255,255,0.05)]">
              <button
                onClick={() => setShowOverdueDialog(false)}
                className="w-full bg-[#E0B954] hover:bg-[#C79E3B] text-[#080808] font-medium py-2 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Bugs Dialog */}
      {showBugsDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[rgba(255,255,255,0.05)] sticky top-0 bg-[#0d0d0d]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#EF4444]/20">
                  <AlertCircle className="w-5 h-5 text-[#EF4444]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Open Bugs</h2>
                  <p className="text-xs text-[#737373]">
                    {bugsList.length} bug{bugsList.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBugsDialog(false)}
                className="text-[#737373] hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-3">
              {bugsList.length === 0 ? (
                <p className="text-sm text-[#737373] text-center py-8">No open bugs 🎉</p>
              ) : (
                bugsList.map((item) => (
                  <a
                    key={item.id}
                    onClick={() => {
                      window.open(`/project/${project.id}/board/${item.id}`, '_blank');
                    }}
                    className="flex items-center gap-3 p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-all cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-md flex items-center justify-center bg-[#EF4444]/10 flex-shrink-0">
                      <AlertCircle className="w-4 h-4 text-[#EF4444]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-mono text-[#E0B954] block mb-1">
                        {item.key}
                      </span>
                      <p className="text-sm text-white truncate">{item.title || item.key}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[#737373] flex-shrink-0" />
                  </a>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[rgba(255,255,255,0.05)]">
              <button
                onClick={() => setShowBugsDialog(false)}
                className="w-full bg-[#E0B954] hover:bg-[#C79E3B] text-[#080808] font-medium py-2 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Critical Items Dialog */}
      {showCriticalDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[rgba(255,255,255,0.05)] sticky top-0 bg-[#0d0d0d]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#F97316]/20">
                  <AlertTriangle className="w-5 h-5 text-[#F97316]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Critical Items</h2>
                  <p className="text-xs text-[#737373]">
                    {criticalItemsList.length} item{criticalItemsList.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCriticalDialog(false)}
                className="text-[#737373] hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-3">
              {criticalItemsList.length === 0 ? (
                <p className="text-sm text-[#737373] text-center py-8">No critical items 🎉</p>
              ) : (
                criticalItemsList.map((item) => (
                  <a
                    key={item.id}
                    onClick={() => {
                      window.open(`/project/${project.id}/board/${item.id}`, '_blank');
                    }}
                    className="flex items-center gap-3 p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-all cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-md flex items-center justify-center bg-[#F97316]/10 flex-shrink-0">
                      <AlertTriangle className="w-4 h-4 text-[#F97316]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-mono text-[#E0B954] block mb-1">
                        {item.key}
                      </span>
                      <p className="text-sm text-white truncate">{item.title || item.key}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[#737373] flex-shrink-0" />
                  </a>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[rgba(255,255,255,0.05)]">
              <button
                onClick={() => setShowCriticalDialog(false)}
                className="w-full bg-[#E0B954] hover:bg-[#C79E3B] text-[#080808] font-medium py-2 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Health Explanation Modal */}
      {showHealthExplanation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[rgba(255,255,255,0.05)] sticky top-0 bg-[#0d0d0d]">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${health.color}20` }}
                >
                  <HelpCircle className="w-5 h-5" style={{ color: health.color }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">How Health is Calculated</h2>
                  <p className="text-xs text-[#737373]">Score breakdown</p>
                </div>
              </div>
              <button
                onClick={() => setShowHealthExplanation(false)}
                className="text-[#737373] hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Current Score */}
              <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#737373]">Current Score</span>
                  <span className="text-2xl font-bold text-white">{healthScore}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${healthScore}%`, backgroundColor: health.color }}
                    />
                  </div>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${health.color}20`, color: health.color }}
                  >
                    {health.label}
                  </span>
                </div>
              </div>

              {/* How It Works */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">How It Works</h3>
                <div className="space-y-2 text-sm text-[#a3a3a3]">
                  <p>
                    Your project starts with a base score of{' '}
                    <strong className="text-white">100 points</strong>.
                  </p>
                  <p>
                    Points are deducted based on project health indicators below. The lower the
                    deductions, the healthier your project.
                  </p>
                </div>
              </div>

              {/* Deductions */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Deductions Applied</h3>
                <div className="space-y-3">
                  {deductions.length > 0 ? (
                    deductions.map((d, idx) => (
                      <div
                        key={idx}
                        className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-white">{d.label}</span>
                          <span className="text-sm font-bold text-[#EF4444]">-{d.amount}</span>
                        </div>
                        <p className="text-xs text-[#737373]">{d.detail}</p>
                      </div>
                    ))
                  ) : (
                    <div className="bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.2)] rounded-lg p-3">
                      <p className="text-sm text-[#34D399] font-medium">
                        ✓ No deductions - Project is healthy!
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Score Ranges */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Score Ranges</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#34D399' }} />
                    <span className="text-sm text-[#a3a3a3]">
                      <strong>80-100:</strong> Healthy
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#FBBF24' }} />
                    <span className="text-sm text-[#a3a3a3]">
                      <strong>60-79:</strong> At Risk
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#EF4444' }} />
                    <span className="text-sm text-[#a3a3a3]">
                      <strong>0-59:</strong> Critical
                    </span>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className="bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.2)] rounded-lg p-3">
                <p className="text-xs text-[#E0B954] font-medium mb-2">✨ Tips to Improve Health</p>
                <ul className="text-xs text-[#a3a3a3] space-y-1">
                  <li>• Resolve overdue items to reduce penalties</li>
                  <li>• Fix bugs to maintain code quality</li>
                  <li>• Keep milestone progress above 50%</li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[rgba(255,255,255,0.05)]">
              <button
                onClick={() => setShowHealthExplanation(false)}
                className="w-full bg-[#E0B954] hover:bg-[#C79E3B] text-[#080808] font-medium py-2 rounded-lg transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessReviewView;
