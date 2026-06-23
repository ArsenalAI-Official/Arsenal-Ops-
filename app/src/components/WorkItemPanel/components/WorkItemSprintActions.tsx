import { ArrowRight, Inbox } from 'lucide-react';
import type { SprintResponse } from '@/client';
import { Button } from '@/components/ui/button';
import type { WorkItem } from '../types';

export interface WorkItemSprintActionsProps {
  item: WorkItem;
  sprints: SprintResponse[];
  onMoveToSprint: (itemId: string, targetSprintId: number | null) => void;
  getNextSprint: (currentSprintId: number | null) => number | null;
}

export const WorkItemSprintActions = ({
  item,
  sprints,
  onMoveToSprint,
  getNextSprint,
}: WorkItemSprintActionsProps) => {
  if (sprints.length === 0) return null;

  const nextSprintId = item.sprint_id ? getNextSprint(item.sprint_id) : null;
  const hasAnyAction = item.sprint_id || !item.sprint_id;
  if (!hasAnyAction) return null;

  // Resolve the current sprint name for display. Falls back to a numeric
  // placeholder if the ticket's sprint isn't in the local sprints array
  // (rare — could happen if the sprint list is stale relative to the item).
  const currentSprint = item.sprint_id
    ? (sprints.find((s) => s.id === item.sprint_id) ?? null)
    : null;
  const currentSprintLabel = currentSprint
    ? currentSprint.name
    : item.sprint_id
      ? `Sprint #${item.sprint_id}`
      : 'Backlog';

  return (
    <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
      <div className="text-xs text-[#8A8A8A] mb-3 font-semibold uppercase tracking-wider">
        Sprint
      </div>
      {/* "Currently in" indicator — shows the sprint the ticket belongs to
          (or "Backlog" when unassigned to a sprint). Gold-tinted when in a
          sprint so it visually anchors the action buttons below; muted gray
          for backlog. */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-[#737373]">Currently in</span>
        {item.sprint_id ? (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.2)] text-[#E0B954]">
            {currentSprintLabel}
          </span>
        ) : (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] text-[#a3a3a3]">
            Backlog
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {item.sprint_id && nextSprintId && item.status !== 'done' && (
          <Button
            size="sm"
            onClick={() => onMoveToSprint(item.id, nextSprintId)}
            className="rounded-lg text-xs h-9 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] text-[#F59E0B] hover:bg-[rgba(245,158,11,0.2)]"
          >
            <ArrowRight className="w-3 h-3 mr-1" /> Push to Next Sprint
          </Button>
        )}
        {item.sprint_id && (
          <Button
            size="sm"
            onClick={() => onMoveToSprint(item.id, null)}
            className="rounded-lg text-xs h-9 bg-transparent border border-[rgba(255,255,255,0.07)] text-[#737373] hover:text-white hover:border-[rgba(244,246,255,0.15)]"
          >
            <Inbox className="w-3 h-3 mr-1" /> Remove from Sprint
          </Button>
        )}
        {!item.sprint_id && (
          <select
            onChange={(e) => {
              if (e.target.value) {
                onMoveToSprint(item.id, parseInt(e.target.value));
                e.target.value = '';
              }
            }}
            className="h-9 text-xs bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#a3a3a3] rounded-lg px-3 appearance-none cursor-pointer hover:border-[rgba(244,246,255,0.15)]"
            defaultValue=""
          >
            <option value="">Add to Sprint…</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};
