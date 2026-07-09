import { ExternalLink, Target, Link2 } from 'lucide-react';
import type { WorkItem } from '../types';

export interface WorkItemCompactHierarchyProps {
  item: WorkItem;
  onOpenInBoard: (projectId: number, taskId: string) => void;
}

export const WorkItemCompactHierarchy = ({
  item,
  onOpenInBoard,
}: WorkItemCompactHierarchyProps) => {
  const openInBoard = (relatedId: number | null | undefined) => {
    if (!relatedId) return;
    const projectId = (item as WorkItem & { project_id?: number }).project_id ?? 0;
    onOpenInBoard(projectId, String(relatedId));
  };

  const sectionLabel = (text: string) => (
    <div className="mb-3 text-[11px] font-semibold tracking-wider text-[#8A8A8A] uppercase">
      {text}
    </div>
  );

  // key-only row: type-icon avatar · key · open-in-board
  const renderCompactRow = (
    keyStr: string,
    relatedId: number | null | undefined,
    Icon: React.ElementType,
    accentColor: string,
  ) => (
    <button
      type="button"
      className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5 text-left transition-colors hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.04)]"
      onClick={() => openInBoard(relatedId)}
    >
      <div
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${accentColor}22` }}
      >
        <Icon className="h-3 w-3" style={{ color: accentColor }} />
      </div>
      <span className="flex-1 font-mono text-sm text-[#a3a3a3]">{keyStr}</span>
      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-[#555] transition-colors group-hover:text-[#8A8A8A]" />
    </button>
  );

  if (item.type === 'subtask') {
    if (!item.parent_key) return null;
    return (
      <div>
        {sectionLabel('Belongs to')}
        {renderCompactRow(item.parent_key, item.parent_id, Link2, '#E0B954')}
      </div>
    );
  }

  if (!item.epic_key) return null;
  return (
    <div>
      {sectionLabel('Epic')}
      {renderCompactRow(item.epic_key, item.epic_id, Target, '#A78BFA')}
    </div>
  );
};
