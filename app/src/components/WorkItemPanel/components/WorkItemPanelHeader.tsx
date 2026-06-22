import { Pencil, Trash2, X, Ban, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkItem } from '../types';
import { TYPE_CONFIG } from '../constants';

export interface WorkItemPanelHeaderProps {
  item: WorkItem;
  variant: 'full' | 'compact';
  canWriteTracker: boolean;
  isEditing: boolean;
  isDoneAndNotEditing: boolean;
  onToggleEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  /** True while the bulk unblock mutation is in flight. Drives the spinner
   *  on the Unblock button and prevents double-clicks. */
  isUnblocking?: boolean;
  /** Fires bulk unblock: resolves all unresolved blocker comments on the
   *  ticket in one shot. Parent owns the mutation lifecycle (toast +
   *  invalidations). When omitted, the button is hidden. */
  onUnblock?: () => void;
}

export const WorkItemPanelHeader = ({
  item,
  variant,
  canWriteTracker,
  isEditing,
  isDoneAndNotEditing,
  onToggleEdit,
  onDelete,
  onClose,
  isUnblocking = false,
  onUnblock,
}: WorkItemPanelHeaderProps) => {
  const typeConfig = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.task;

  return (
    <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium"
          style={{ backgroundColor: typeConfig.bg, color: typeConfig.color }}
        >
          <typeConfig.icon className="w-4 h-4" />
          {typeConfig.label}
        </div>
        <span className="text-sm font-mono text-[#E0B954]">{item.key}</span>
        {/* Blocked chip — sits next to the key so it's the first thing
            readers see when opening a blocked ticket. Derived from the
            server-computed `is_blocked` field. */}
        {item.is_blocked && (
          <span
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[rgba(239,68,68,0.15)] text-[#EF4444] border border-[rgba(239,68,68,0.3)]"
            title="This ticket has unresolved blocker comments"
          >
            <Ban className="w-3 h-3" />
            Blocked
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {/* Unblock — only shown when the ticket is blocked AND the user
            holds the write cap (matches backend `project.tracker_write`
            gate on POST /unblock). Resolves every unresolved blocker
            comment in one shot; idempotent if already unblocked. */}
        {item.is_blocked && canWriteTracker && onUnblock && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onUnblock}
            disabled={isUnblocking}
            className="text-[#34D399] hover:text-[#10B981] hover:bg-[rgba(52,211,153,0.1)] rounded-lg h-8 px-2.5 disabled:opacity-60"
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            {isUnblocking ? 'Unblocking…' : 'Unblock'}
          </Button>
        )}
        {/* Edit (full variant — in header). Hidden when caller lacks
            project.tracker_write so users don't see an action that would 403. */}
        {variant === 'full' && canWriteTracker && (
          <Button
            size="sm"
            variant="ghost"
            disabled={isDoneAndNotEditing}
            title={isDoneAndNotEditing ? 'Re-open this ticket before editing.' : undefined}
            onClick={onToggleEdit}
            className="text-[#737373] hover:text-white hover:bg-[rgba(255,255,255,0.06)] rounded-lg h-8 px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Pencil className="w-3.5 h-3.5 mr-1" />
            {isEditing ? 'Cancel' : 'Edit'}
          </Button>
        )}
        {/* Delete (full only — same capability gate as Edit). */}
        {variant === 'full' && canWriteTracker && (
          <Button
            size="sm"
            variant="ghost"
            aria-label="Delete work item"
            onClick={onDelete}
            className="text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg h-8 px-2.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label="Close panel"
          className="text-[#737373] hover:text-white hover:bg-[rgba(255,255,255,0.06)] rounded-lg h-8 px-2.5"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
