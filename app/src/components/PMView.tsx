import React, { useState, useEffect } from 'react';
import {
  Clock,
  Users,
  Calendar,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';
import HoursDebugPanel from './HoursDebugPanel';

interface Sprint {
  id: number;
  name: string;
  status: string;
  start_date?: string;
  end_date?: string;
  goal?: string;
  completion_pct: number;
  capacity_hours: number;
  velocity: number;
  done_count: number;
  total_items: number;
  completed_points: number;
  total_points: number;
}

interface PMViewProps {
  projectId: string;
  token: string;
  sprints?: Sprint[];
}

interface HoursAnalytics {
  project_name: string;
  total_allocated_hours: number;
  total_logged_hours: number;
  total_remaining_hours: number;
  sprint_hours: SprintHours[];
  developer_hours: DeveloperHours[];
  weekly_hours: WeeklyHours[];
}

interface SprintHours {
  sprint_id: number;
  sprint_name: string;
  status: string;
  allocated_hours: number;
  logged_hours: number;
  remaining_hours: number;
  total_items: number;
}

interface TimeEntry {
  hours: number;
  logged_at: string;
  is_this_week: boolean;
  description?: string;
}

interface TicketBreakdown {
  ticket_id: number;
  key: string;
  title: string;
  status: string;
  estimated_hours: number;
  total_logged_on_ticket: number;
  my_logged_hours: number;
  remaining_hours: number;
  time_entries: TimeEntry[];
}

interface HoursOnOthersTicket {
  ticket_key: string;
  ticket_title: string;
  ticket_assignee: string;
  hours: number;
  logged_at: string;
}

interface CapacityTicket {
  id: number;
  key: string;
  title: string;
  status: string;
  priority: string;
  project_id: number;
  project_name: string | null;
  estimated_hours: number;
  logged_hours: number;
  remaining_hours: number;
  started_at: string | null;
  last_assigned_at: string | null;
  completed_at: string | null;
  counted_hours: number;
  counted_basis: string;
}

interface DeveloperHours {
  developer_id: number;
  developer_name: string;
  developer_email: string;
  role: string;
  allocated_hours: number;
  logged_hours: number;
  remaining_hours: number;
  current_week_logged: number;
  total_items: number;
  completed_items: number;
  done_logged_hours?: number;
  weekly_logged_history?: Array<{ week_start: string; week_end: string; hours: number }>;
  my_tickets: TicketBreakdown[];
  hours_logged_on_others_tickets: HoursOnOthersTicket[];
  attribution_note: string;
  // Sat-Fri capacity breakdown for THIS project (matches admin capacity rules)
  week_start?: string;
  week_end?: string;
  this_week_in_progress_hours?: number;
  this_week_in_review_hours?: number;
  this_week_done_hours?: number;
  this_week_capacity_used?: number;
  this_week_remaining_capacity?: number;
  this_week_tickets?: CapacityTicket[];
}

interface WeeklyHours {
  week: string;
  week_end: string;
  week_label: string;
  allocated_hours: number;
  logged_hours: number;
  items_completed: number;
}

export default function PMView({ projectId, token, sprints = [] }: PMViewProps) {
  const { can } = useAuth();
  const [analytics, setAnalytics] = useState<HoursAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedDeveloper, setExpandedDeveloper] = useState<number | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [expandedView, setExpandedView] = useState<'capacity' | 'logged'>('capacity');

  useEffect(() => {
    fetchAnalytics();
  }, [projectId]);

  const toggleDeveloperExpand = (devId: number) => {
    setExpandedDeveloper(expandedDeveloper === devId ? null : devId);
    setExpandedView('capacity'); // every fresh expansion starts on the capacity view
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/workitems/projects/${projectId}/hours-analytics`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        setAnalytics(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch hours analytics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E0B954]"></div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <p className="text-[#737373]">No analytics data available</p>
      </div>
    );
  }

  const progressPercentage =
    analytics.total_allocated_hours > 0
      ? Math.round((analytics.total_logged_hours / analytics.total_allocated_hours) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {can('project.pm.summary_cards') && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#E0B954]/20 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-[#E0B954]" />
                </div>
                <div>
                  <p className="text-xs text-[#737373]">Total Project Hours</p>
                  <p className="text-xl font-bold text-white">{analytics.total_allocated_hours}h</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#E0B954]/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-[#E0B954]" />
                </div>
                <div>
                  <p className="text-xs text-[#737373]">Logged Hours</p>
                  <p className="text-xl font-bold text-white">{analytics.total_logged_hours}h</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
                </div>
                <div>
                  <p className="text-xs text-[#737373]">Remaining Hours</p>
                  <p className="text-xl font-bold text-white">{analytics.total_remaining_hours}h</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#C79E3B]/20 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-[#C79E3B]" />
                </div>
                <div>
                  <p className="text-xs text-[#737373]">Progress</p>
                  <p className="text-xl font-bold text-white">{progressPercentage}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Unified Sprint Overview - Hours Breakdown & Progression */}
      <Card className="bg-[rgba(255,255,255,0.02)] border border-[rgba(224,185,84,0.12)] rounded-2xl p-5 shadow-[0_0_30px_rgba(224,185,84,0.05)]">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#C79E3B] flex items-center justify-center shadow-lg shadow-[#E0B954]/25">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-white">Sprint Overview</CardTitle>
              <p className="text-xs text-[#737373]">
                Progress, hours breakdown, and delivery status
              </p>
            </div>
          </div>
          {sprints.length > 1 && (
            <button
              onClick={() => setProgressExpanded((p) => !p)}
              className="flex items-center gap-1.5 text-xs text-[#E0B954] hover:text-[#F3D57E] px-3 py-1.5 rounded-lg bg-[#E0B954]/10 hover:bg-[#E0B954]/15 transition-colors font-medium flex-shrink-0"
            >
              {progressExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" /> Show Active Only
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" /> Show all {sprints.length}
                </>
              )}
            </button>
          )}
        </CardHeader>
        <CardContent>
          {sprints.length === 0 ? (
            <div className="text-center py-8 text-[#737373]">
              <p>No sprints created yet. Create a sprint to start tracking progress and hours.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {(progressExpanded ? sprints : sprints.filter((s) => s.status === 'active')).map(
                (sprint) => {
                  // Get the corresponding sprint data from analytics
                  const sprintAnalytics = analytics.sprint_hours.find(
                    (sh) => sh.sprint_id === sprint.id,
                  );

                  // Calculate expected progress based on time elapsed
                  const now = new Date();
                  let expectedPct = 0;
                  if (sprint.start_date && sprint.end_date) {
                    const start = new Date(sprint.start_date);
                    const end = new Date(sprint.end_date);
                    const totalMs = end.getTime() - start.getTime();
                    const elapsedMs = Math.min(now.getTime() - start.getTime(), totalMs);
                    expectedPct =
                      totalMs > 0 ? Math.max(0, Math.round((elapsedMs / totalMs) * 100)) : 0;
                    if (sprint.status === 'completed') expectedPct = 100;
                    if (now < start) expectedPct = 0;
                  }
                  const actual = sprint.completion_pct;
                  const delta = actual - expectedPct;
                  const isAhead = delta >= 0;
                  const isFar = Math.abs(delta) > 15;

                  // Use analytics data for hours, fallback to sprint data
                  const allocatedHours =
                    sprintAnalytics?.allocated_hours ?? sprint.capacity_hours ?? 0;
                  const loggedHours = sprintAnalytics?.logged_hours ?? sprint.velocity ?? 0;
                  const remainingHours =
                    sprintAnalytics?.remaining_hours ?? Math.max(0, allocatedHours - loggedHours);

                  return (
                    <div
                      key={sprint.id}
                      className={`border rounded-xl p-5 transition-colors ${
                        sprint.status === 'completed'
                          ? 'border-[#E0B954]/20 bg-[rgba(224,185,84,0.03)]'
                          : isFar && !isAhead
                            ? 'border-[#EF4444]/20 bg-[rgba(239,68,68,0.03)]'
                            : 'border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]'
                      }`}
                    >
                      {/* Header: Sprint Name, Status, Delta */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                sprint.status === 'active'
                                  ? 'bg-[#E0B954] animate-pulse'
                                  : sprint.status === 'completed'
                                    ? 'bg-[#E0B954]'
                                    : 'bg-[#737373]'
                              }`}
                            />
                            <p className="text-base font-bold text-white">{sprint.name}</p>
                            <Badge
                              className={`text-[10px] border-0 ml-1 ${
                                sprint.status === 'active'
                                  ? 'bg-[#E0B954]/20 text-[#E0B954]'
                                  : sprint.status === 'completed'
                                    ? 'bg-[#E0B954]/20 text-[#E0B954]'
                                    : 'bg-[#737373]/20 text-[#737373]'
                              }`}
                            >
                              {sprint.status}
                            </Badge>
                          </div>
                          {/* Date Range */}
                          {sprint.start_date && sprint.end_date && (
                            <p className="text-xs text-[#737373]">
                              📅{' '}
                              {new Date(sprint.start_date).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}{' '}
                              –{' '}
                              {new Date(sprint.end_date).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </p>
                          )}
                        </div>
                        <span
                          className={`text-xs font-bold px-3 py-1 rounded-lg whitespace-nowrap ml-4 flex-shrink-0 ${
                            isAhead
                              ? 'bg-[#E0B954]/15 text-[#E0B954]'
                              : isFar
                                ? 'bg-[#EF4444]/15 text-[#EF4444]'
                                : 'bg-[#F59E0B]/15 text-[#F59E0B]'
                          }`}
                        >
                          {isAhead ? '↗' : '↙'} {Math.abs(delta)}%
                        </span>
                      </div>

                      {sprint.goal && (
                        <p className="text-xs text-[#a3a3a3] mb-4 italic line-clamp-2">
                          \"{sprint.goal}\"
                        </p>
                      )}

                      {/* Sprint Progress Section */}
                      <div className="mb-5 pb-5 border-b border-[rgba(255,255,255,0.05)]">
                        <h4 className="text-xs font-semibold text-[#737373] uppercase tracking-wider mb-3">
                          Progress Tracking
                        </h4>
                        <div className="space-y-3">
                          {/* Actual Progress */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm font-medium text-white">Completion</span>
                              <span className="text-sm font-bold text-[#E0B954]">{actual}%</span>
                            </div>
                            <div className="h-2.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-[#E0B954] to-[#F3D57E] rounded-full transition-all duration-500"
                                style={{ width: `${actual}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Hours Breakdown Section */}
                      <div className="mb-5 pb-5 border-b border-[rgba(255,255,255,0.05)]">
                        <h4 className="text-xs font-semibold text-[#737373] uppercase tracking-wider mb-3">
                          Hours Breakdown
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                          {/* Total Allocated Hours */}
                          <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.04)] rounded-lg p-3">
                            <div className="text-[10px] text-[#737373] font-medium mb-1.5">
                              Total Allocated
                            </div>
                            <div className="text-lg font-bold text-white">{allocatedHours}h</div>
                            <p className="text-[9px] text-[#737373] mt-1">
                              Based on {sprint.total_items} tickets
                            </p>
                          </div>
                          {/* Logged Hours */}
                          <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.04)] rounded-lg p-3 border-l-2 border-l-[#E0B954]">
                            <div className="text-[10px] text-[#737373] font-medium mb-1.5">
                              Logged Hours
                            </div>
                            <div className="text-lg font-bold text-[#E0B954]">{loggedHours}h</div>
                            <p className="text-[9px] text-[#737373] mt-1">Hours tracked</p>
                          </div>
                          {/* Remaining Hours */}
                          <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.04)] rounded-lg p-3">
                            <div className="text-[10px] text-[#737373] font-medium mb-1.5">
                              Remaining Hours
                            </div>
                            <div className="text-lg font-bold text-[#F59E0B]">
                              {remainingHours}h
                            </div>
                            <p className="text-[9px] text-[#737373] mt-1">Not yet logged</p>
                          </div>
                        </div>
                      </div>

                      {/* Summary Stats */}
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="py-2">
                          <div className="text-sm font-bold text-white">
                            {sprint.done_count}/{sprint.total_items}
                          </div>
                          <div className="text-[10px] text-[#737373]">Items Completed</div>
                        </div>
                        <div className="py-2 border-l border-r border-[rgba(255,255,255,0.05)]">
                          <div className="text-sm font-bold text-[#E0B954]">
                            {sprint.completed_points}/{sprint.total_points}
                          </div>
                          <div className="text-[10px] text-[#737373]">Story Points</div>
                        </div>
                        <div className="py-2">
                          <div className="text-sm font-bold text-white">{actual}%</div>
                          <div className="text-[10px] text-[#737373]">Overall Progress</div>
                        </div>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Hours Table */}
      {/* TEMPORARILY HIDDEN - Uncomment to show
            {!isSubsectionRestricted('weekly hours breakdown') && (
            <Card className="bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-white flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        Weekly Hours Breakdown
                        <span className="text-xs text-[#737373] font-normal ml-2">(Last 10 weeks)</span>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setWeekFilter(weekFilter === 'all' ? 'with-activity' : 'all')}
                            className={`border-[rgba(255,255,255,0.08)] text-xs ${weekFilter === 'with-activity' ? 'bg-[#E0B954]/20 text-[#E0B954]' : 'text-[#737373]'}`}
                        >
                            <Filter className="w-3 h-3 mr-1" />
                            {weekFilter === 'all' ? 'Show All' : 'With Activity'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[rgba(255,255,255,0.05)]">
                                    <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase">Week</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-[#737373] uppercase">Allocated</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-[#737373] uppercase">Logged</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-[#737373] uppercase">Completed Items</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics.weekly_hours
                                    .filter(week => weekFilter === 'all' || week.logged_hours > 0 || week.allocated_hours > 0 || week.items_completed > 0)
                                    .slice(0, 10)
                                    .map((week, idx) => (
                                    <tr key={idx} className={`border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] ${week.logged_hours > 0 ? 'bg-[#E0B954]/5' : ''}`}>
                                        <td className="py-3 px-4 text-sm text-white font-medium">
                                            {(() => {
                                                const [year, month, day] = week.week.split('-');
                                                const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                                return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                                            })()}
                                        </td>
                                        <td className="py-3 px-4 text-sm text-right text-white">{week.allocated_hours}h</td>
                                        <td className="py-3 px-4 text-sm text-right">
                                            <span className={week.logged_hours > 0 ? 'text-[#E0B954] font-semibold' : 'text-[#737373]'}>
                                                {week.logged_hours}h
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-right">
                                            <Badge variant="outline" className="border-[rgba(255,255,255,0.08)] text-[#a3a3a3]">
                                                {week.items_completed}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {analytics.weekly_hours.length === 0 && (
                            <div className="text-center py-8 text-[#737373]">
                                <p>No sprints created yet. Weeks will appear once sprints are started.</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
            )}
            */}

      {/* Developer Hours Table */}
      {can('project.pm.developer_hours') && (
        <Card className="bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Developer Hours Summary
            </CardTitle>
            <p className="text-xs text-[#737373] mt-1">
              Click on a developer row to see detailed ticket breakdown.
              <span className="text-[#C79E3B]">
                {' '}
                Hours are attributed to the person who logged them.
              </span>
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.05)]">
                    <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase">
                      Developer
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase">
                      Role
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-[#737373] uppercase">
                      Allocated
                    </th>
                    <th
                      className="text-right py-3 px-4 text-xs font-medium text-[#737373] uppercase"
                      title="All-time hours logged on this project. Click any cell to see the weekly breakdown."
                    >
                      Total Logged
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-[#C79E3B] uppercase">
                      This Week
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-[#737373] uppercase">
                      Remaining
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-[#737373] uppercase">
                      Done
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.developer_hours.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[#737373]">
                        No developers assigned to this project
                      </td>
                    </tr>
                  ) : (
                    analytics.developer_hours.map((dev) => {
                      const isExpanded = expandedDeveloper === dev.developer_id;

                      return (
                        <React.Fragment key={dev.developer_id}>
                          <tr
                            className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] cursor-pointer"
                            onClick={() => toggleDeveloperExpand(dev.developer_id)}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-white text-sm font-semibold">
                                  {dev.developer_name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm text-white">{dev.developer_name}</p>
                                  <p className="text-xs text-[#737373]">{dev.developer_email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant="outline"
                                className="border-[rgba(255,255,255,0.08)] text-[#a3a3a3]"
                              >
                                {dev.role}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-sm text-right text-white">
                              {dev.allocated_hours}h
                            </td>
                            <td className="py-3 px-4 text-sm text-right">
                              <span
                                className={
                                  dev.logged_hours > 0 ? 'text-[#E0B954]' : 'text-[#737373]'
                                }
                              >
                                {dev.logged_hours}h
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm min-w-[260px]">
                              {(() => {
                                const inProgressH = dev.this_week_in_progress_hours ?? 0;
                                const inReviewH = dev.this_week_in_review_hours ?? 0;
                                const doneH = dev.this_week_done_hours ?? 0;
                                const capUsed = dev.this_week_capacity_used ?? 0;
                                return (
                                  <div className="flex flex-col items-end gap-1">
                                    <div className="flex items-center gap-2 w-full max-w-[220px]">
                                      <div className="flex-1 h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden flex">
                                        {capUsed > 0 && (
                                          <>
                                            <div
                                              className="h-full bg-[#E0B954]"
                                              style={{
                                                width: `${Math.min(100, (inProgressH / 40) * 100)}%`,
                                              }}
                                              title={`${inProgressH}h in-progress`}
                                            />
                                            <div
                                              className="h-full bg-[#A78BFA]"
                                              style={{
                                                width: `${Math.min(100, (inReviewH / 40) * 100)}%`,
                                              }}
                                              title={`${inReviewH}h in-review`}
                                            />
                                            <div
                                              className="h-full bg-[#34D399]"
                                              style={{
                                                width: `${Math.min(100, (doneH / 40) * 100)}%`,
                                              }}
                                              title={`${doneH}h done`}
                                            />
                                          </>
                                        )}
                                      </div>
                                      <span
                                        className={`text-xs font-mono tabular-nums whitespace-nowrap ${capUsed > 0 ? 'text-[#C79E3B] font-semibold' : 'text-[#737373]'}`}
                                      >
                                        {capUsed}h/40h
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-[#737373] flex items-center gap-1.5 flex-wrap justify-end">
                                      <span className="flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-sm bg-[#E0B954]" />
                                        {inProgressH}h prog
                                      </span>
                                      <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                      <span className="flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-sm bg-[#A78BFA]" />
                                        {inReviewH}h rev
                                      </span>
                                      <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                      <span className="flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-sm bg-[#34D399]" />
                                        {doneH}h done
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-4 text-sm text-right">
                              <span
                                className={
                                  dev.remaining_hours > 0 ? 'text-[#F59E0B]' : 'text-[#737373]'
                                }
                              >
                                {dev.remaining_hours}h
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm text-right">
                              <Badge className="bg-[#E0B954]/20 text-[#E0B954] border-0">
                                {dev.completed_items}/{dev.total_items}
                              </Badge>
                            </td>
                          </tr>

                          {/* Expanded Detail Row */}
                          {isExpanded && (
                            <tr className="bg-[rgba(255,255,255,0.01)]">
                              <td colSpan={7} className="py-4 px-4">
                                <div className="space-y-4">
                                  {/* View toggle: Capacity (default) | Logged hours per week */}
                                  <div className="flex items-center gap-2">
                                    {(
                                      [
                                        { id: 'capacity', label: 'Capacity (this week)' },
                                        { id: 'logged', label: 'Logged hours per week' },
                                      ] as const
                                    ).map((opt) => {
                                      const active = expandedView === opt.id;
                                      return (
                                        <button
                                          key={opt.id}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedView(opt.id);
                                          }}
                                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                            active
                                              ? 'bg-[#E0B954]/20 text-[#E0B954] border border-[#E0B954]/40'
                                              : 'bg-[rgba(255,255,255,0.03)] text-[#a3a3a3] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]'
                                          }`}
                                        >
                                          {opt.label}
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {/* Logged hours per week view */}
                                  {expandedView === 'logged' &&
                                    (() => {
                                      const history = dev.weekly_logged_history ?? [];
                                      if (history.length === 0) {
                                        return (
                                          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-4 text-sm text-[#737373] text-center">
                                            No logged hours yet on this project.
                                          </div>
                                        );
                                      }
                                      const maxHours = Math.max(...history.map((w) => w.hours), 1);
                                      return (
                                        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-3">
                                          <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-xs font-semibold text-white">
                                              Logged hours per week
                                            </h4>
                                            <span className="text-xs font-mono tabular-nums text-[#E0B954]">
                                              {dev.logged_hours}h total · {history.length}{' '}
                                              {history.length === 1 ? 'week' : 'weeks'}
                                            </span>
                                          </div>
                                          <ul className="space-y-2">
                                            {history.map((w) => {
                                              // Backend buckets Sat→Fri; for display we show Mon→Fri
                                              // (skip the weekend, same underlying bucket).
                                              const satStart = new Date(w.week_start);
                                              const monStart = new Date(
                                                satStart.getTime() + 2 * 24 * 60 * 60 * 1000,
                                              );
                                              const friEnd = new Date(w.week_end);
                                              const pct = Math.round((w.hours / maxHours) * 100);
                                              return (
                                                <li key={w.week_start} className="space-y-1">
                                                  <div className="flex items-center justify-between text-xs">
                                                    <span className="text-[#a3a3a3] font-mono">
                                                      {monStart.toLocaleDateString(undefined, {
                                                        month: 'short',
                                                        day: 'numeric',
                                                      })}
                                                      {' → '}
                                                      {friEnd.toLocaleDateString(undefined, {
                                                        month: 'short',
                                                        day: 'numeric',
                                                      })}
                                                    </span>
                                                    <span className="text-[#E0B954] font-mono tabular-nums">
                                                      {w.hours}h
                                                    </span>
                                                  </div>
                                                  <div className="h-1.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                                                    <div
                                                      className="h-full bg-[#E0B954] rounded-full"
                                                      style={{ width: `${pct}%` }}
                                                    />
                                                  </div>
                                                </li>
                                              );
                                            })}
                                          </ul>
                                        </div>
                                      );
                                    })()}

                                  {/* This Week — by status breakdown (Sat-Fri) */}
                                  {expandedView === 'capacity' &&
                                    dev.this_week_tickets &&
                                    dev.this_week_tickets.length > 0 && (
                                      <div>
                                        <div className="flex items-center justify-between mb-2">
                                          <h4 className="text-xs font-medium text-[#C79E3B] uppercase">
                                            This Week — by status
                                          </h4>
                                          {dev.week_start && dev.week_end && (
                                            <span className="text-[10px] text-[#737373] font-mono">
                                              {new Date(dev.week_start).toLocaleDateString(
                                                undefined,
                                                { month: 'short', day: 'numeric' },
                                              )}
                                              {' → '}
                                              {new Date(dev.week_end).toLocaleDateString(
                                                undefined,
                                                {
                                                  month: 'short',
                                                  day: 'numeric',
                                                },
                                              )}
                                              {' (Sat → Fri, UTC)'}
                                            </span>
                                          )}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                          {(
                                            [
                                              {
                                                key: 'in_progress',
                                                label: 'In progress',
                                                color: '#E0B954',
                                                total: dev.this_week_in_progress_hours ?? 0,
                                              },
                                              {
                                                key: 'in_review',
                                                label: 'In review',
                                                color: '#A78BFA',
                                                total: dev.this_week_in_review_hours ?? 0,
                                              },
                                              {
                                                key: 'done',
                                                label: 'Done this week',
                                                color: '#34D399',
                                                total: dev.this_week_done_hours ?? 0,
                                              },
                                            ] as const
                                          ).map((group) => {
                                            const groupTickets = (
                                              dev.this_week_tickets ?? []
                                            ).filter((t) => t.status === group.key);
                                            return (
                                              <div
                                                key={group.key}
                                                className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-3"
                                              >
                                                <div className="flex items-center justify-between mb-2">
                                                  <div className="flex items-center gap-2">
                                                    <span
                                                      className="w-2 h-2 rounded-sm"
                                                      style={{ background: group.color }}
                                                    />
                                                    <span className="text-xs font-semibold text-white">
                                                      {group.label}
                                                    </span>
                                                    <span className="text-[10px] text-[#737373]">
                                                      ({groupTickets.length})
                                                    </span>
                                                  </div>
                                                  <span
                                                    className="text-xs font-mono tabular-nums"
                                                    style={{ color: group.color }}
                                                  >
                                                    {group.total}h
                                                  </span>
                                                </div>
                                                {groupTickets.length === 0 ? (
                                                  <div className="text-[11px] text-[#737373] py-1">
                                                    No tickets
                                                  </div>
                                                ) : (
                                                  <ul className="space-y-1.5">
                                                    {groupTickets.map((t) => (
                                                      <li
                                                        key={t.id}
                                                        className="flex items-start gap-2 text-xs"
                                                      >
                                                        <span className="font-mono text-[#E0B954] mt-0.5 flex-shrink-0">
                                                          {t.key}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                          <div className="text-white truncate">
                                                            {t.title}
                                                          </div>
                                                          <div className="text-[10px] text-[#737373] mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                            <span>est {t.estimated_hours}h</span>
                                                            <span className="text-[rgba(255,255,255,0.15)]">
                                                              ·
                                                            </span>
                                                            <span>logged {t.logged_hours}h</span>
                                                            {t.counted_basis ===
                                                              'remaining (transferred)' && (
                                                              <span className="px-1 py-0.5 rounded bg-[#FBBF24]/15 text-[#FBBF24] text-[9px] font-semibold uppercase tracking-wider">
                                                                transferred
                                                              </span>
                                                            )}
                                                          </div>
                                                        </div>
                                                        <span
                                                          className="font-mono tabular-nums flex-shrink-0"
                                                          style={{ color: group.color }}
                                                          title={`Counted as ${t.counted_basis}`}
                                                        >
                                                          +{t.counted_hours}h
                                                        </span>
                                                      </li>
                                                    ))}
                                                  </ul>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                  <p className="text-xs text-[#737373] italic">
                                    {dev.attribution_note}
                                  </p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug Panel Toggle */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          className="text-xs text-[#737373] hover:text-white"
        >
          {showDebugPanel ? 'Hide Diagnostics' : 'Show Diagnostics'}
        </Button>
      </div>

      {/* Debug Panel. HoursDebugPanel reads its own capability internally via
          `can('admin.projects')` — no isAdmin prop chain needed. */}
      {showDebugPanel && <HoursDebugPanel projectId={projectId} token={token} />}
    </div>
  );
}
