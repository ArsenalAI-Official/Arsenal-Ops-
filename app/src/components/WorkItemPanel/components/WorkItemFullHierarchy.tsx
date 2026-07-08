import { Plus, ExternalLink } from 'lucide-react';
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

  const renderEmpty = (label: string) => (
    <div className="flex items-center rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] px-3 py-2.5 text-xs text-[#555] italic">
      {label}
    </div>
  );

  const sectionLabel = (text: string) => (
    <div className="mb-3 text-[11px] font-semibold tracking-wider text-[#8A8A8A] uppercase">
      {text}
    </div>
  );

  // Reference-style row: avatar · key · title · status chip · open-in-board.
  const renderItemRow = (target: WorkItem) => {
    const sc = STATUS_CONFIG[target.status as keyof typeof STATUS_CONFIG];
    const ac = avatarColor(target.assignee_id) ?? '#737373';
    return (
      <button
        type="button"
        key={target.id}
        className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5 text-left transition-colors hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.04)]"
        onClick={() => navigate(`/project/${projectId}/board/${target.id}`)}
      >
        <div
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
          style={{ backgroundColor: `${ac}22`, color: ac }}
        >
          {target.assignee ? target.assignee.charAt(0).toUpperCase() : '—'}
        </div>
        <span className="flex-shrink-0 font-mono text-[11px] text-[#737373]">{target.key}</span>
        <span className="flex-1 truncate text-sm text-[#F4F6FF]">{target.title}</span>
        <span
          className="flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
          style={{ color: sc?.color ?? '#737373', background: `${sc?.color ?? '#737373'}1a` }}
        >
          {sc?.label ?? target.status}
        </span>
        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-[#555] transition-colors group-hover:text-[#8A8A8A]" />
      </button>
    );
  };

  // ── Subtask: only show parent ("Belongs to") ──────────────────────────
  if (subjectType === 'subtask') {
    const parentItem = item.parent_id
      ? fullWorkItems.find((wi) => wi.id === item.parent_id?.toString())
      : null;
    return (
      <div>
        {sectionLabel('Belongs to')}
        {parentItem ? renderItemRow(parentItem) : renderEmpty('No parent')}
      </div>
    );
  }

  // ── Epic: show member items ───────────────────────────────────────────
  if (subjectType === 'epic') {
    const epicItems = fullWorkItems.filter((wi) => wi.epic_id === subjectId);
    return (
      <div>
        {sectionLabel(`Items${epicItems.length > 0 ? ` · ${epicItems.length}` : ''}`)}
        {epicItems.length > 0 ? (
          <div className="space-y-2">{epicItems.map(renderItemRow)}</div>
        ) : (
          renderEmpty('No items')
        )}
      </div>
    );
  }

  // ── Bug / Story / Task: Subtasks only. Epic lives in the Properties rail
  // now, so it's no longer duplicated here (matches the reference layout). ──
  const subtasks = subtasksOfCurrent;
  return (
    <div>
      {sectionLabel(`Subtasks${subtasks.length > 0 ? ` · ${subtasks.length}` : ''}`)}
      {subtasks.length > 0 && <div className="mb-2 space-y-2">{subtasks.map(renderItemRow)}</div>}
      <Button
        variant="ghost"
        onClick={onAddSubtask}
        className="h-10 w-full rounded-xl border border-dashed border-[rgba(255,255,255,0.1)] text-sm text-[#737373] hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#a3a3a3]"
      >
        <Plus className="mr-1.5 h-4 w-4" /> Add a subtask
      </Button>
    </div>
  );
};
