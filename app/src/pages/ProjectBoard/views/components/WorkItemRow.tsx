import type { ComponentType } from 'react';
import StatusDotMenu from '@/components/ProjectsPage/StatusDotMenu';
import { avatarColor } from '@/lib/avatarColor';
import type { WorkItem } from '@/types/workItems';
import { parseLocalDate } from '../../lib/listGrouping';

/** Type-config entry shape (icon + label + colors) used to render the Type cell. */
export interface WorkItemRowTypeConfig {
  icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  label: string;
  bg: string;
}

/** Priority-config entry shape — only the hex is read by the row. */
export interface WorkItemRowPriorityStyle {
  hex: string;
}

export interface WorkItemRowProps {
  /** The work item this row renders. */
  item: WorkItem;
  /** Hierarchy indent depth (epic view uses 1 for child rows; 0 elsewhere). */
  depth?: 0 | 1;
  /** Resolved type-config entry for `item.type` (already defaulted to task). */
  typeInfo: WorkItemRowTypeConfig;
  /** Resolved priority-config entry for `item.priority` (already defaulted to medium). */
  priorityStyle: WorkItemRowPriorityStyle;
  /**
   * Whether the user may mutate the item's status. When false the status cell
   * renders read-only text instead of the StatusDotMenu. The epic view passes
   * `true` unconditionally to preserve its prior (ungated) behavior.
   */
  canWriteTracker: boolean;
  /**
   * Whether the due-date cell should color overdue dates red. Only the week
   * grouping computes/colors overdue; sprint + epic rows pass false.
   */
  isOverdue?: boolean;
  /**
   * Whether the completed cell should use the gold accent when populated. Only
   * the week grouping does this; sprint + epic rows keep the muted gray.
   */
  highlightCompleted?: boolean;
  onStatusChange: (item: WorkItem, newStatus: string) => void;
  onPrefetchComments: (itemId: string) => void;
  onOpenItem: (itemId: string) => void;
}

/**
 * The single 8-column work-item grid row. Previously triplicated verbatim
 * across the epic, sprint, and week list-group renderers in ProjectBoard.
 * Behavior-neutral: the two cosmetic divergences between those copies (the
 * epic view's hierarchy indent + ungated StatusDotMenu, and the week view's
 * overdue/completed coloring) are threaded as the `depth` / `canWriteTracker`
 * / `isOverdue` / `highlightCompleted` props so every prior pixel is preserved.
 */
const WorkItemRow = ({
  item,
  depth = 0,
  typeInfo,
  priorityStyle,
  canWriteTracker,
  isOverdue = false,
  highlightCompleted = false,
  onStatusChange,
  onPrefetchComments,
  onOpenItem,
}: WorkItemRowProps) => {
  const TypeIcon = typeInfo.icon;
  const dueDate = item.due_date ? parseLocalDate(item.due_date) : null;
  return (
    <div
      onMouseEnter={() => onPrefetchComments(item.id)}
      onClick={() => onOpenItem(item.id)}
      className="grid grid-cols-[120px_1fr_120px_100px_80px_120px_110px_110px] gap-4 px-5 py-3.5 border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.025)] cursor-pointer transition-colors group"
    >
      <div className="flex items-center">
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
          style={{ backgroundColor: typeInfo.bg, color: typeInfo.color }}
        >
          <TypeIcon className="w-3 h-3" />
          {typeInfo.label}
        </div>
      </div>
      <div
        className="flex items-center gap-3 min-w-0"
        style={{ paddingLeft: depth === 1 ? 24 : 0 }}
      >
        {depth === 1 && (
          <span className="text-[#444] font-mono text-xs shrink-0" aria-hidden>
            └─
          </span>
        )}
        <span className="text-[10px] text-muted-foreground font-mono font-medium shrink-0">
          {item.key}
        </span>
        <span className="text-sm text-[#f5f5f5] truncate group-hover:text-white transition-colors">
          {item.title}
        </span>
      </div>
      <div className="flex items-center">
        {canWriteTracker ? (
          <StatusDotMenu
            status={item.status}
            onChange={(newStatus) => onStatusChange(item, newStatus)}
          />
        ) : (
          <span className="text-xs text-[#a3a3a3] capitalize">{item.status.replace('_', ' ')}</span>
        )}
      </div>
      <div className="flex items-center">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
          style={{
            backgroundColor: priorityStyle.hex + '33',
            color: priorityStyle.hex,
          }}
        >
          {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
        </span>
      </div>
      <div className="flex items-center">
        <span className="text-sm font-semibold text-muted-foreground">{item.story_points}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {item.assignee && item.assignee !== 'Unassigned' ? (
          (() => {
            const c = avatarColor(item.assignee_id ?? item.assignee);
            return (
              <>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: c.bg, color: c.fg, border: `1px solid ${c.ring}` }}
                  title={item.assignee}
                >
                  <span className="text-[9px] font-semibold">
                    {item.assignee.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-[#a3a3a3] truncate">{item.assignee}</span>
              </>
            );
          })()
        ) : (
          <span className="text-xs text-[#555] truncate">—</span>
        )}
      </div>
      <div className="flex items-center">
        <span className={`text-xs truncate ${isOverdue ? 'text-[#EF4444]' : 'text-[#a3a3a3]'}`}>
          {dueDate ? dueDate.toLocaleDateString() : '—'}
        </span>
      </div>
      <div className="flex items-center">
        <span
          className={`text-xs truncate ${
            highlightCompleted && item.completed_at ? 'text-status-done' : 'text-[#a3a3a3]'
          }`}
        >
          {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : '—'}
        </span>
      </div>
    </div>
  );
};

export default WorkItemRow;
