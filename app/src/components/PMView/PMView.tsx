import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';
import HoursDebugPanel from '../HoursDebugPanel';
import type { HoursAnalytics, PMViewProps } from './types';
import PMSummaryCards from './sections/PMSummaryCards';
import SprintOverview from './sections/SprintOverview';
import DeveloperHoursTable from './sections/DeveloperHoursTable';

export default function PMView({ projectId, token, sprints = [] }: PMViewProps) {
  const { can } = useAuth();
  const [analytics, setAnalytics] = useState<HoursAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [progressExpanded, setProgressExpanded] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [projectId]);

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
        <PMSummaryCards analytics={analytics} progressPercentage={progressPercentage} />
      )}

      {/* Unified Sprint Overview - Hours Breakdown & Progression */}
      <SprintOverview
        sprints={sprints}
        analytics={analytics}
        progressExpanded={progressExpanded}
        setProgressExpanded={setProgressExpanded}
      />

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
      {can('project.pm.developer_hours') && <DeveloperHoursTable analytics={analytics} />}

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
