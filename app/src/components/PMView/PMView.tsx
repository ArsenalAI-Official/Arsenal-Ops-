import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';
import HoursDebugPanel from '../HoursDebugPanel';
import DeveloperHoursTable from './sections/DeveloperHoursTable';
import PMSummaryCards from './sections/PMSummaryCards';
import SprintOverview from './sections/SprintOverview';
import type { HoursAnalytics, PMViewProps } from './types';

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-progress"></div>
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

  // Clamp at 100: logged can exceed allocated once over-budget is surfaced (the
  // over-run shows on the negative "Remaining" card), but "Progress" caps at
  // 100% so the figure doesn't read as >100% done.
  const progressPercentage =
    analytics.total_allocated_hours > 0
      ? Math.min(
          100,
          Math.round((analytics.total_logged_hours / analytics.total_allocated_hours) * 100),
        )
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
