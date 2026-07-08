import { Clock } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/Markdown';
import { NumberInput } from '@/components/ui/number-input';
import type { WorkItem } from '../types';
import { PanelLayout } from './PanelLayout';
import { PropertiesRail, type RailDeveloper } from './rail/PropertiesRail';

// The view-mode body of WorkItemPanel: the reference's two-pane layout. The main
// column carries title → description → subtasks/hierarchy → contributors/sprint
// → comments; the rail carries the inline-editable Properties + (for the
// assignee, when allowed) the Log-hours control. All property edits flow through
// the single `onPatchField` seam the orchestrator provides.
interface WorkItemTwoPaneViewProps {
  item: WorkItem;
  itemDetail: WorkItem;
  railDevelopers: RailDeveloper[];
  canWrite: boolean;
  /** status === 'done' — freezes non-status fields (server rule). */
  isFrozen: boolean;
  onPatchField: (edits: Partial<WorkItem>) => void;
  collapsed: boolean;
  variant: 'full' | 'compact';
  isAssignee: boolean;
  isLoggingHours: boolean;
  onLogHours: () => void;
  logHoursRef: RefObject<HTMLInputElement | null>;
  /** Variant-specific slots, computed by the orchestrator. */
  linkedItems: ReactNode;
  contributors: ReactNode;
  sprintActions: ReactNode;
  comments: ReactNode;
}

export const WorkItemTwoPaneView = ({
  item,
  itemDetail,
  railDevelopers,
  canWrite,
  isFrozen,
  onPatchField,
  collapsed,
  variant,
  isAssignee,
  isLoggingHours,
  onLogHours,
  logHoursRef,
  linkedItems,
  contributors,
  sprintActions,
  comments,
}: WorkItemTwoPaneViewProps) => {
  // Log-hours stays a discrete action (POST /log-hours), not a rail field: only
  // the assignee (or the compact my-tasks context) may log, and never on epics.
  const canLogHours = (variant === 'compact' || isAssignee) && item.type !== 'epic';

  return (
    <PanelLayout
      collapsed={collapsed}
      main={
        <div className="space-y-6">
          <h1 className="text-2xl leading-snug font-bold text-white">{item.title}</h1>

          <div>
            <div className="mb-2 text-[11px] font-semibold tracking-wider text-[#8A8A8A] uppercase">
              Description
            </div>
            {itemDetail.description ? (
              <Markdown>{itemDetail.description}</Markdown>
            ) : (
              <p className="text-sm text-[#555] italic">No description — add one via Edit.</p>
            )}
          </div>

          {linkedItems}
          {contributors}
          {sprintActions}
          {comments}
        </div>
      }
      rail={
        <div className="space-y-5">
          <PropertiesRail
            item={itemDetail}
            developers={railDevelopers}
            canWrite={canWrite}
            isFrozen={isFrozen}
            onPatchField={onPatchField}
          />

          {canLogHours && (
            <div className="border-t border-[rgba(255,255,255,0.05)] pt-4">
              <div className="mb-3 text-[10px] font-semibold tracking-wider text-[#8A8A8A] uppercase">
                Log Work Hours
              </div>
              <div className="flex items-center gap-2">
                <NumberInput
                  ref={logHoursRef}
                  placeholder="Hours"
                  min="0"
                  max="24"
                  aria-label="Hours to log"
                  className="h-8 flex-1"
                />
                <Button
                  size="sm"
                  disabled={isLoggingHours}
                  onClick={onLogHours}
                  className="h-8 rounded-lg bg-[#E0B954] font-medium text-[#080808] hover:bg-[#C79E3B] disabled:opacity-50"
                >
                  <Clock className="mr-1.5 h-3.5 w-3.5" />
                  {isLoggingHours ? 'Logging…' : 'Log'}
                </Button>
              </div>
            </div>
          )}
        </div>
      }
    />
  );
};
