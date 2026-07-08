import { Clock } from 'lucide-react';
import { parseLocalDate } from '@/components/ProjectsPage/utils';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/Markdown';
import { NumberInput } from '@/components/ui/number-input';
import { avatarColor } from '@/lib/avatarColor';
import { STATUS_CONFIG, PRIORITY_COLOR } from '../constants';
import type { WorkItem } from '../types';

export interface WorkItemViewModeProps {
  item: WorkItem;
  itemDetail: WorkItem;
  variant: 'full' | 'compact';
  isAssignee: boolean;
  canAssignToMe: boolean;
  onAssignToMe: () => void;
  isSavingEdit: boolean;
  onStatusChange: (newStatus: string) => void;
  isLoggingHours: boolean;
  onLogHours: () => void;
  logHoursRef: React.RefObject<HTMLInputElement | null>;
  /** Variant-specific "Linked Items" content. `null` hides the whole section. */
  linkedItems: React.ReactNode;
  /** Full-variant contributors block. */
  contributors: React.ReactNode;
  /** Full-variant sprint actions block. */
  sprintActions: React.ReactNode;
  /** Activity & comments block. */
  comments: React.ReactNode;
}

export const WorkItemViewMode = ({
  item,
  itemDetail,
  variant,
  isAssignee,
  canAssignToMe,
  onAssignToMe,
  isSavingEdit,
  onStatusChange,
  isLoggingHours,
  onLogHours,
  logHoursRef,
  linkedItems,
  contributors,
  sprintActions,
  comments,
}: WorkItemViewModeProps) => {
  const priorityColor = PRIORITY_COLOR[item.priority] ?? '#737373';

  return (
    <>
      {/* Title + description */}
      <div className="pb-4 border-b border-[rgba(255,255,255,0.05)]">
        <h2 className="text-xl font-bold text-white mb-2">{item.title}</h2>
        <div className="flex items-center gap-2 mb-3">
          {(() => {
            const c = avatarColor(item.assignee_id ?? item.assignee);
            return (
              <div
                className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold"
                style={{ backgroundColor: c.bg, color: c.fg, border: `1px solid ${c.ring}` }}
              >
                {item.assignee ? item.assignee.charAt(0).toUpperCase() : '—'}
              </div>
            );
          })()}
          <span className="text-sm text-[#a3a3a3]">{item.assignee || 'Unassigned'}</span>
          {/* Assign-to-me quick action — surfaces only when the ticket has
              no assignee (and isn't an epic, and the viewer has a Developer
              row). Routes through the same save path as the inline Edit
              form, so cache / toast / invalidation behave identically. */}
          {canAssignToMe && (
            <button
              type="button"
              onClick={onAssignToMe}
              disabled={isSavingEdit}
              className="text-xs font-medium px-2.5 py-1 rounded-md bg-[rgba(255,255,255,0.06)] text-muted-foreground hover:bg-[rgba(255,255,255,0.12)] hover:text-white disabled:opacity-50 transition-colors"
            >
              Assign to me
            </button>
          )}
        </div>
        {itemDetail.description ? (
          <Markdown>{itemDetail.description}</Markdown>
        ) : (
          <p className="text-sm leading-relaxed">
            <span className="text-[#555] italic">No description — click Edit to add one.</span>
          </p>
        )}
      </div>

      {/* Status buttons */}
      <div className="pt-4">
        <div className="text-xs text-progress mb-3 font-semibold uppercase tracking-wider">
          Status
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(
            Object.keys(STATUS_CONFIG).filter((s) => s !== 'backlog') as Array<
              keyof typeof STATUS_CONFIG
            >
          ).map((status) => (
            <Button
              key={status}
              size="sm"
              onClick={() => onStatusChange(status)}
              aria-pressed={item.status === status}
              className={`rounded-lg text-xs h-9 transition-all ${
                item.status === status
                  ? 'text-white shadow-lg'
                  : 'bg-transparent border border-[rgba(255,255,255,0.07)] text-[#737373] hover:text-white hover:border-[rgba(244,246,255,0.15)]'
              }`}
              style={
                item.status === status
                  ? {
                      backgroundColor: STATUS_CONFIG[status].color,
                      boxShadow: `0 4px 12px ${STATUS_CONFIG[status].color}33`,
                    }
                  : {}
              }
            >
              {STATUS_CONFIG[status].label}
            </Button>
          ))}
        </div>
      </div>

      {/* Stat grid — Story Points, Priority, Due Date, Hours */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.10)] rounded-xl p-3.5">
          <dl>
            <dt className="text-[10px] text-progress font-medium uppercase tracking-wider mb-1">
              Story Points
            </dt>
            <dd className="text-lg font-bold text-[#a3a3a3]">{item.story_points}</dd>
          </dl>
        </div>
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.10)] rounded-xl p-3.5">
          <dl>
            <dt className="text-[10px] text-progress font-medium uppercase tracking-wider mb-1">
              Priority
            </dt>
            <dd className="text-lg font-bold" style={{ color: priorityColor }}>
              {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
            </dd>
          </dl>
        </div>
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.10)] rounded-xl p-3.5">
          <dl>
            <dt className="text-[10px] text-progress font-medium uppercase tracking-wider mb-1">
              Due Date
            </dt>
            <dd
              className="text-lg font-bold"
              style={{
                color: (() => {
                  if (!itemDetail.due_date) return '#555';
                  const d = parseLocalDate(itemDetail.due_date);
                  if (!d) return 'var(--text-mid)';
                  // eslint-disable-next-line react-hooks/purity -- preserves the original due-date urgency color, which compares the due date against the current time on each render.
                  const diffDays = Math.ceil((d.getTime() - Date.now()) / 86400000);
                  return diffDays < 0 ? '#EF4444' : diffDays <= 7 ? '#F59E0B' : '#34D399';
                })(),
              }}
            >
              {itemDetail.due_date
                ? (parseLocalDate(itemDetail.due_date)?.toLocaleDateString() ?? 'Not set')
                : 'Not set'}
            </dd>
          </dl>
        </div>
        {/* Hours card — full width */}
        {item.type !== 'epic' && (
          <div className="col-span-3 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.10)] rounded-xl p-3.5">
            <dl>
              <dt className="text-[10px] text-progress font-medium uppercase tracking-wider mb-2">
                Hours
              </dt>
              <dd>
                {(() => {
                  const allocated = item.assigned_hours || 0;
                  const logged = item.logged_hours || 0;
                  const pct =
                    allocated > 0 ? Math.min(100, Math.round((logged / allocated) * 100)) : 0;
                  const barColor = pct >= 100 ? '#34D399' : 'var(--progress)';
                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-progress">
                        <span>
                          <span className="text-white font-semibold">{logged}h</span> logged
                        </span>
                        <span>
                          <span className="text-white font-semibold">{item.remaining_hours}h</span>{' '}
                          remaining of {allocated}h
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: barColor }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </dd>
            </dl>
          </div>
        )}
      </div>

      {/* Log Work Hours — directly below hours card for quick access */}
      {(variant === 'compact' || isAssignee) && item.type !== 'epic' && (
        <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
          <div className="text-xs text-progress mb-3 font-semibold uppercase tracking-wider">
            Log Work Hours
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor={`log-hours-${item.id}`} className="sr-only">
              Hours to log
            </label>
            <NumberInput
              ref={logHoursRef}
              id={`log-hours-${item.id}`}
              placeholder="Hours"
              min="0"
              max="24"
              className="w-28 h-9"
              aria-describedby={`log-hours-status-${item.id}`}
            />
            <Button
              size="sm"
              disabled={isLoggingHours}
              onClick={onLogHours}
              className="bg-[#E0B954] hover:bg-[#C79E3B] text-[#080808] font-medium rounded-xl h-9 disabled:opacity-50"
            >
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              {isLoggingHours ? 'Logging…' : 'Log Hours'}
            </Button>
          </div>
          <p id={`log-hours-status-${item.id}`} className="text-xs text-progress mt-2">
            <span className="text-white font-medium">{item.logged_hours || 0}h</span> logged ·{' '}
            <span className="text-white font-medium">{item.remaining_hours}h</span> remaining
          </p>
        </div>
      )}

      {/* Metadata rows */}
      {itemDetail.reporter_name && (
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.03)]">
            <span className="text-xs text-progress">Created By</span>
            <span className="text-sm text-[#f5f5f5]">{itemDetail.reporter_name}</span>
          </div>
        </div>
      )}

      {/* Linked Items */}
      {linkedItems}

      {/* Tags */}
      {item.tags?.length > 0 && (
        <div>
          <div className="text-xs text-progress mb-2 font-medium">Tags</div>
          <div className="flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-[#a3a3a3] text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Contributors (full only) */}
      {contributors}

      {/* Sprint actions (full only) */}
      {sprintActions}

      {/* Comments */}
      {comments}
    </>
  );
};
