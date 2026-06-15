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

  // key-only card: type-icon avatar · key · external link
  const renderCompactRow = (
    keyStr: string,
    relatedId: number | null | undefined,
    Icon: React.ElementType,
    accentColor: string,
  ) => (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] cursor-pointer hover:border-[rgba(255,255,255,0.1)] transition-colors"
      onClick={() => openInBoard(relatedId)}
    >
      <div
        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
        style={{ backgroundColor: `${accentColor}20` }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: accentColor }} />
      </div>
      <span className="text-sm font-mono text-[#a3a3a3] flex-1">{keyStr}</span>
      <ExternalLink className="w-3.5 h-3.5 text-[#555] flex-shrink-0" />
    </div>
  );

  if (item.type === 'subtask') {
    if (!item.parent_key) return null;
    return (
      <div>
        <div className="flex items-center gap-1.5 text-xs text-[#8A8A8A] mb-2 font-medium">
          <Link2 className="w-3.5 h-3.5" /> Belongs to
        </div>
        {renderCompactRow(item.parent_key, item.parent_id, Link2, '#E0B954')}
      </div>
    );
  }

  if (!item.epic_key) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-[#8A8A8A] mb-2 font-medium">
        <Target className="w-3.5 h-3.5" /> Epic
      </div>
      {renderCompactRow(item.epic_key, item.epic_id, Target, '#A78BFA')}
    </div>
  );
};
