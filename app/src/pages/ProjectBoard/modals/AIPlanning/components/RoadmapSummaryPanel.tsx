import { Target } from 'lucide-react';
import { formatSprintRange } from '../lib/formatSprintRange';
import type { RoadmapParsedData, RoadmapSummary } from '../useAIPlanning';

interface RoadmapSummaryPanelProps {
  roadmapSummary: RoadmapSummary;
  roadmapParsedData: RoadmapParsedData | null;
}

const RoadmapSummaryPanel = ({ roadmapSummary, roadmapParsedData }: RoadmapSummaryPanelProps) => {
  return (
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <Target className="w-4 h-4 text-muted-foreground" />
        Roadmap Summary
      </h3>

      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-[rgba(102,184,255,0.1)] rounded-lg p-3">
          <p className="text-xs text-[#737373] mb-1">Epics</p>
          <p className="text-lg font-bold text-[#66b8ff]">{roadmapSummary.total_epics}</p>
        </div>
        <div className="bg-[rgba(166,162,156,0.1)] rounded-lg p-3">
          <p className="text-xs text-[#737373] mb-1">Tasks</p>
          <p className="text-lg font-bold text-muted-foreground">{roadmapSummary.total_tasks}</p>
        </div>
        <div className="bg-[rgba(16,185,129,0.1)] rounded-lg p-3">
          <p className="text-xs text-[#737373] mb-1">Team Size</p>
          <p className="text-lg font-bold text-[#10b981]">{roadmapSummary.total_assignees}</p>
        </div>
        <div className="bg-[rgba(245,158,11,0.1)] rounded-lg p-3">
          <p className="text-xs text-[#737373] mb-1">Duration</p>
          <p className="text-lg font-bold text-[#F59E0B]">
            {roadmapSummary.timeline.duration_weeks}w
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="mb-4 pb-4 border-b border-[rgba(255,255,255,0.07)]">
        <p className="text-xs font-medium text-[#737373] mb-2">Timeline</p>
        <p className="text-sm text-[#a3a3a3]">
          {roadmapSummary.timeline.start} → {roadmapSummary.timeline.end}
        </p>
      </div>

      {/* Sprints — per-sprint date list that will be committed.
          Reads from `roadmapParsedData.sprints` (passed verbatim
          from the parser; no extra API surface). When milestone
          date ranges have calendar gaps, the parser splits sprints
          at the gap so each sprint stays calendar-continuous —
          the gap weeks surface as a callout below the list. */}
      {roadmapParsedData?.sprints && roadmapParsedData.sprints.length > 0 && (
        <div className="mb-4 pb-4 border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-[#737373]">
              Sprints ({roadmapParsedData.sprints.length})
            </p>
            <span className="text-[10px] text-[#525252]">Created on confirm</span>
          </div>
          <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
            {roadmapParsedData.sprints.map((sprint) => (
              <div
                key={sprint.number}
                className="flex items-center justify-between gap-3 text-xs bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-semibold text-muted-foreground tabular-nums shrink-0">
                    Sprint {sprint.number}
                  </span>
                  <span className="text-[#a3a3a3] truncate">
                    {formatSprintRange(sprint.start_week, sprint.end_week)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[#737373] shrink-0 tabular-nums">
                  <span>{sprint.duration_weeks}w</span>
                  <span>
                    {sprint.task_count ?? sprint.tasks?.length ?? 0} task
                    {(sprint.task_count ?? sprint.tasks?.length ?? 0) === 1 ? '' : 's'}
                  </span>
                  {typeof sprint.total_hours === 'number' && sprint.total_hours > 0 && (
                    <span>{Math.round(sprint.total_hours)}h</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Calendar-gap callout — sprints intentionally don't bridge
              uncovered weeks (would produce calendar-discontinuous
              ranges in burndowns). The detailed `uncovered_week`
              entries are also surfaced in the Warnings list below;
              this is a one-liner pointer up here so the user spots
              gaps without scrolling. */}
          {roadmapParsedData?.meta?.missing_weeks &&
            roadmapParsedData.meta.missing_weeks.length > 0 && (
              <p className="mt-2 text-[10px] text-[#f59e0b]">
                {roadmapParsedData.meta.missing_weeks.length} calendar week
                {roadmapParsedData.meta.missing_weeks.length === 1 ? '' : 's'} not covered by any
                milestone — no sprint for{' '}
                {roadmapParsedData.meta.missing_weeks.length === 1 ? 'that week' : 'those weeks'}.
                See warnings below.
              </p>
            )}
        </div>
      )}

      {/* Team Members */}
      {roadmapSummary.assignees && roadmapSummary.assignees.length > 0 && (
        <div className="mb-4 pb-4 border-b border-[rgba(255,255,255,0.07)]">
          <p className="text-xs font-medium text-[#737373] mb-2">Team Members</p>
          <div className="flex flex-wrap gap-2">
            {roadmapSummary.assignees.map((assignee: string, i: number) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-[#a3a3a3] text-xs"
              >
                {assignee}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {roadmapSummary.warnings && roadmapSummary.warnings.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-[#f59e0b] mb-2">
            ⚠️ Warnings ({roadmapSummary.warnings.length})
          </p>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-2">
            {roadmapSummary.warnings.map((warning, i) => (
              <div
                key={i}
                className="text-xs text-[#737373] bg-[rgba(245,158,11,0.08)] p-2 rounded"
              >
                <p className="font-medium text-[#f59e0b]">{warning.issue}</p>
                <p className="text-xs">
                  {warning.task}: {warning.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conflicts */}
      {roadmapSummary.conflicts && roadmapSummary.conflicts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[#ef4444] mb-2">
            🔴 Conflicts ({roadmapSummary.conflicts.length})
          </p>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-2">
            {roadmapSummary.conflicts.map((conflict, i) => (
              <div key={i} className="text-xs text-[#737373] bg-[rgba(239,68,68,0.08)] p-2 rounded">
                <p className="font-medium text-[#ef4444]">
                  {conflict.assignee} - Week {conflict.week}
                </p>
                <p>
                  {conflict.total_hrs}h scheduled (tasks: {conflict.tasks.join(', ')})
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RoadmapSummaryPanel;
