import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
  Wrench,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateProjectScope, invalidateWorkItemScope } from '@/lib/invalidations';

interface HoursDebugPanelProps {
  projectId: string;
  token: string;
}

interface ConsistencyIssue {
  ticket_key: string;
  ticket_title: string;
  stored_logged_hours: number;
  sum_from_time_entries: number;
  difference: number;
  time_entries_count: number;
}

interface DebugData {
  project_id: number;
  project_name: string;
  week_range: {
    start: string;
    end: string;
  };
  total_work_items: number;
  total_time_entries: number;
  consistency_issues: ConsistencyIssue[];
  data_summary: {
    total_hours_from_entries: number;
    total_hours_from_work_items: number;
    developers_with_entries: number[];
  };
}

interface RepairResult {
  dry_run: boolean;
  repairs_found: number;
  repairs_applied: number;
  repairs: Array<{
    ticket_key: string;
    old_logged_hours: number;
    new_logged_hours: number;
    difference: number;
  }>;
  message: string;
}

export default function HoursDebugPanel({ projectId, token }: HoursDebugPanelProps) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  // Only callers with admin.projects capability can repair inconsistencies.
  // This replaces the legacy `isAdmin` prop chain that propagated through
  // PMView from a parent that wasn't actually computing role state.
  const isAdmin = can('admin.projects');
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const fetchDebugData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/workitems/projects/${projectId}/hours-debug`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDebugData(await res.json());
        setRepairResult(null);
      }
    } catch (err) {
      console.error('Failed to fetch debug data:', err);
    } finally {
      setLoading(false);
    }
  };

  const runRepair = async (dryRun: boolean = true) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/workitems/projects/${projectId}/repair-hours?dry_run=${dryRun}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        setRepairResult(await res.json());
        if (!dryRun) {
          invalidateWorkItemScope(queryClient, projectId);
          invalidateProjectScope(queryClient, projectId);
        }
      }
    } catch (err) {
      console.error('Failed to run repair:', err);
    } finally {
      setLoading(false);
    }
  };

  const hasInconsistencies = debugData && debugData.consistency_issues.length > 0;
  const hoursMismatch =
    debugData &&
    debugData.data_summary.total_hours_from_entries !==
      debugData.data_summary.total_hours_from_work_items;

  return (
    <Card className="bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2 text-base">
          <Wrench className="w-4 h-4" />
          Hours Calculation Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDebugData}
              disabled={loading}
              className="border-[rgba(255,255,255,0.08)] text-xs"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Run Diagnostics
            </Button>

            {isAdmin && hasInconsistencies && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runRepair(true)}
                  disabled={loading}
                  className="border-[rgba(255,255,255,0.08)] text-xs"
                >
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Preview Repair
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runRepair(false)}
                  disabled={loading}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Apply Repair
                </Button>
              </>
            )}
          </div>

          {/* Summary */}
          {debugData && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-[#737373]">Work Items:</span>
                <span className="text-white">{debugData.total_work_items}</span>
                <span className="text-[#737373]">Time Entries:</span>
                <span className="text-white">{debugData.total_time_entries}</span>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span className="text-[#737373]">Hours from Entries:</span>
                <span className="text-[#E0B954]">
                  {debugData.data_summary.total_hours_from_entries}h
                </span>
                <span className="text-[#737373]">Hours from Work Items:</span>
                <span className={hoursMismatch ? 'text-red-400' : 'text-[#E0B954]'}>
                  {debugData.data_summary.total_hours_from_work_items}h
                </span>
              </div>

              {hoursMismatch && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm">
                  <AlertTriangle className="w-4 h-4 text-red-400 inline mr-2" />
                  <span className="text-red-400">
                    Data inconsistency detected! Difference:{' '}
                    {debugData.data_summary.total_hours_from_entries -
                      debugData.data_summary.total_hours_from_work_items}
                    h
                  </span>
                </div>
              )}

              {/* Consistency Issues */}
              {hasInconsistencies && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-1 text-xs text-[#737373] hover:text-white"
                  >
                    {showDetails ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                    {debugData.consistency_issues.length} ticket(s) with inconsistent hours
                  </button>

                  {showDetails && (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {debugData.consistency_issues.map((issue, idx) => (
                        <div key={idx} className="p-2 bg-[rgba(255,255,255,0.03)] rounded text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-medium">{issue.ticket_key}</span>
                            <Badge
                              variant="outline"
                              className={
                                issue.difference > 0
                                  ? 'border-green-500/30 text-green-400'
                                  : 'border-red-500/30 text-red-400'
                              }
                            >
                              {issue.difference > 0 ? '+' : ''}
                              {issue.difference}h
                            </Badge>
                          </div>
                          <p className="text-[#737373] truncate">{issue.ticket_title}</p>
                          <div className="flex gap-3 mt-1 text-[#737373]">
                            <span>Stored: {issue.stored_logged_hours}h</span>
                            <span>From entries: {issue.sum_from_time_entries}h</span>
                            <span>Entries: {issue.time_entries_count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!hasInconsistencies && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded text-sm">
                  <CheckCircle className="w-4 h-4 text-green-400 inline mr-2" />
                  <span className="text-green-400">All hours calculations are consistent!</span>
                </div>
              )}
            </div>
          )}

          {/* Repair Result */}
          {repairResult && (
            <div className="space-y-3 border-t border-[rgba(255,255,255,0.05)] pt-3">
              <h4 className="text-sm font-medium text-white">
                {repairResult.dry_run ? 'Repair Preview' : 'Repair Results'}
              </h4>
              <p className="text-xs text-[#737373]">{repairResult.message}</p>

              {repairResult.repairs.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {repairResult.repairs.map((repair, idx) => (
                    <div key={idx} className="p-2 bg-[rgba(255,255,255,0.03)] rounded text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium">{repair.ticket_key}</span>
                        <Badge
                          variant="outline"
                          className={
                            repair.difference > 0
                              ? 'border-green-500/30 text-green-400'
                              : 'border-red-500/30 text-red-400'
                          }
                        >
                          {repair.difference > 0 ? '+' : ''}
                          {repair.difference}h
                        </Badge>
                      </div>
                      <div className="flex gap-3 mt-1 text-[#737373]">
                        <span>
                          {repair.old_logged_hours}h → {repair.new_logged_hours}h
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
