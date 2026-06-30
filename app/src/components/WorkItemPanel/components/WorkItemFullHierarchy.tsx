import { Plus, Target, ClipboardList, Link2, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { STATUS_CONFIG } from '../constants';
import { avatarColor } from '../lib/renderContent';
import type { WorkItem } from '../types';

export interface WorkItemFullHierarchyProps {
  item: WorkItem;
  fullWorkItems: WorkItem[];
  subtasksOfCurrent: WorkItem[];
  projectId: string | undefined;
  navigate: (path: string) => void;
  onAddSubtask: () => void;
}

export const WorkItemFullHierarchy = ({
  item,
  fullWorkItems,
  subtasksOfCurrent,
  projectId,
  navigate,
  onAddSubtask,
}: WorkItemFullHierarchyProps) => {
  const subjectType = item.type;
  const subjectId = parseInt(item.id);

  const epicItem = item.epic_id
    ? fullWorkItems.find((wi) => wi.id === item.epic_id?.toString())
    : null;

  const renderEmpty = (label: string) => (
    <div className="flex items-center px-3 py-2 rounded-lg border border-dashed border-[rgba(255,255,255,0.06)] text-xs text-[#555] italic">
      {label}
    </div>
  );

  const sectionLabel = (icon: React.ReactNode, text: string) => (
    <div className="flex items-center gap-1.5 text-xs text-[#8A8A8A] mb-2 font-medium">
      {icon}
      {text}
    </div>
  );

  // Shared row renderer: avatar · key+title+progress · status badge
  const renderItemRow = (target: WorkItem) => {
    const sc = STATUS_CONFIG[target.status as keyof typeof STATUS_CONFIG];
    const allocated = target.assigned_hours ?? 0;
    const logged = target.logged_hours ?? 0;
    const pct = allocated > 0 ? Math.min(100, Math.round((logged / allocated) * 100)) : 0;
    const barColor = logged >= allocated && allocated > 0 ? '#34D399' : '#E0B954';
    const ac = avatarColor(target.assignee_id);
    return (
      <div
        key={target.id}
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] cursor-pointer hover:border-[rgba(255,255,255,0.1)] transition-colors"
        onClick={() => navigate(`/project/${projectId}/board/${target.id}`)}
      >
        {/* Assignee avatar */}
        <div
          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold"
          style={{ backgroundColor: `${ac}20`, color: ac }}
        >
          {target.assignee ? target.assignee.charAt(0).toUpperCase() : '—'}
        </div>
        {/* Key + title + progress bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[11px] text-[#737373] font-mono flex-shrink-0">{target.key}</span>
            <span className="text-sm text-white truncate">{target.title}</span>
          </div>
          <div className="h-1 rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          </div>
        </div>
        {/* Hours — logged / allocated */}
        <span className="text-[11px] text-[#555] flex-shrink-0 tabular-nums">
          {logged}h/{allocated}h
        </span>
        {/* Status badge — right end */}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide flex-shrink-0"
          style={{ color: sc?.color ?? '#737373', background: `${sc?.color ?? '#737373'}1a` }}
        >
          {sc?.label ?? target.status}
        </span>
      </div>
    );
  };

  // ── Subtask: only show parent ("Belongs to") ──────────────────────────
  if (subjectType === 'subtask') {
    const parentItem = item.parent_id
      ? fullWorkItems.find((wi) => wi.id === item.parent_id?.toString())
      : null;
    return (
      <div>
        {sectionLabel(<Link2 className="w-3.5 h-3.5" />, 'Belongs to')}
        {parentItem ? renderItemRow(parentItem) : renderEmpty('No parent')}
      </div>
    );
  }

  // ── Epic: show member items ───────────────────────────────────────────
  if (subjectType === 'epic') {
    const epicItems = fullWorkItems.filter((wi) => wi.epic_id === subjectId);
    return (
      <div>
        {sectionLabel(
          <List className="w-3.5 h-3.5" />,
          `Items${epicItems.length > 0 ? ` (${epicItems.length})` : ''}`,
        )}
        {epicItems.length > 0 ? (
          <div className="space-y-1.5">{epicItems.map(renderItemRow)}</div>
        ) : (
          renderEmpty('No items')
        )}
      </div>
    );
  }

  // ── Bug / Story / Task: Epic + Subtasks (with creation form) ─────────
  const subtasks = subtasksOfCurrent;
  return (
    <div className="space-y-4">
      <div>
        {sectionLabel(<Target className="w-3.5 h-3.5" />, 'Epic')}
        {epicItem ? renderItemRow(epicItem) : renderEmpty('No epic')}
      </div>
      <div>
        {sectionLabel(
          <ClipboardList className="w-3.5 h-3.5" />,
          `Subtasks${subtasks.length > 0 ? ` (${subtasks.length})` : ''}`,
        )}
        {subtasks.length > 0 && (
          <div className="space-y-1.5 mb-3">{subtasks.map(renderItemRow)}</div>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onAddSubtask}
          className="w-full border border-dashed border-[rgba(255,255,255,0.08)] text-[#555] hover:bg-[rgba(255,255,255,0.04)] hover:text-white hover:border-[rgba(255,255,255,0.15)] rounded-lg h-9 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add a subtask
        </Button>
      </div>
    </div>
  );
};
