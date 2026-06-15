import React from 'react';
import { Badge } from '@/components/ui/badge';
import { X, BookOpen, Target } from 'lucide-react';
import { TYPE_CONFIG } from '@/lib/workItemConfig';
import { getStatusIcon } from '../components/StatusIcon';
import { getPriorityColor } from '../lib/listLogic';
import type { WorkItem } from '../types';

interface TicketDetailPanelProps {
  selectedItem: WorkItem;
  workItems: WorkItem[];
  onClose: () => void;
  onSelectItem: (item: WorkItem) => void;
}

const TicketDetailPanel: React.FC<TicketDetailPanelProps> = ({
  selectedItem,
  workItems,
  onClose,
  onSelectItem,
}) => {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-[#080808] border-l border-[rgba(255,255,255,0.07)] z-50 flex flex-col shadow-2xl shadow-black/50 overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-[rgba(255,255,255,0.05)] sticky top-0 bg-[#080808]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {(() => {
              const ti =
                TYPE_CONFIG[selectedItem.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.task;
              return (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium flex-shrink-0"
                  style={{ backgroundColor: ti.bg, color: ti.color }}
                >
                  <ti.icon className="w-4 h-4" />
                  {ti.label}
                </div>
              );
            })()}
            <span className="text-xs font-mono text-[#E0B954]">{selectedItem.key}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          <h2 className="text-lg font-semibold text-white leading-tight">{selectedItem.title}</h2>

          {/* Status + Priority */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className="border-[rgba(255,255,255,0.08)] text-[#a3a3a3] capitalize"
            >
              {selectedItem.status.replace(/_/g, ' ')}
            </Badge>
            <Badge variant="outline" className={getPriorityColor(selectedItem.priority)}>
              {selectedItem.priority}
            </Badge>
          </div>

          {/* Description */}
          {selectedItem.description && (
            <div>
              <p className="text-xs font-medium text-[#737373] mb-2">Description</p>
              <p className="text-sm text-[#f5f5f5] leading-relaxed bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
                {selectedItem.description}
              </p>
            </div>
          )}

          {/* Acceptance Criteria */}
          {selectedItem.acceptance_criteria && (
            <div>
              <p className="text-xs font-medium text-[#737373] mb-2">Acceptance Criteria</p>
              <p className="text-sm text-[#f5f5f5] leading-relaxed bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
                {selectedItem.acceptance_criteria}
              </p>
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Assignee', value: selectedItem.assignee || 'Unassigned' },
              { label: 'Sprint', value: selectedItem.sprint || 'Backlog' },
              { label: 'Story Points', value: String(selectedItem.story_points ?? '-') },
              {
                label: 'Est. Hours',
                value: selectedItem.estimated_hours ? `${selectedItem.estimated_hours}h` : '-',
              },
              {
                label: 'Logged Hours',
                value: selectedItem.logged_hours ? `${selectedItem.logged_hours}h` : '0h',
              },
              {
                label: 'Due Date',
                value: selectedItem.due_date
                  ? new Date(selectedItem.due_date).toLocaleDateString()
                  : 'Not set',
              },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[rgba(255,255,255,0.025)] rounded-xl p-3">
                <p className="text-xs text-[#737373] mb-1">{label}</p>
                <p className="text-sm font-medium text-white">{value}</p>
              </div>
            ))}
          </div>

          {/* Hierarchy */}
          {(selectedItem.epic_key || selectedItem.parent_key) && (
            <div>
              <p className="text-xs font-medium text-[#737373] mb-2">Hierarchy</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedItem.epic_key && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[rgba(167,139,250,0.12)] text-[#A78BFA] text-xs">
                    <Target className="w-3 h-3" />
                    Epic: {selectedItem.epic_key}
                  </span>
                )}
                {selectedItem.epic_key && selectedItem.parent_key && (
                  <span className="text-[#555] text-xs">›</span>
                )}
                {selectedItem.parent_key && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[rgba(224,185,84,0.10)] text-[#E0B954] text-xs">
                    <BookOpen className="w-3 h-3" />
                    Parent: {selectedItem.parent_key}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Child items */}
          {(() => {
            const children = workItems.filter((i) => i.parent_id === parseInt(selectedItem.id));
            return children.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-[#737373] mb-2">
                  Child Items ({children.length})
                </p>
                <div className="space-y-1.5">
                  {children.map((child) => (
                    <div
                      key={child.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] cursor-pointer hover:border-[rgba(255,255,255,0.08)] transition-colors"
                      onClick={() => onSelectItem(child)}
                    >
                      {getStatusIcon(child.status)}
                      <span className="text-xs font-mono text-[#737373] flex-shrink-0">
                        {child.key}
                      </span>
                      <span className="text-sm text-[#a3a3a3] truncate">{child.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}
        </div>
      </div>
    </>
  );
};

export default TicketDetailPanel;
