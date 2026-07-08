import { X } from 'lucide-react';
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/ui/Markdown';
import { TYPE_CONFIG } from '@/lib/workItemConfig';
import { getPriorityColor } from '../lib/timelineGrid';
import type { WorkItem } from '../types';

interface TicketDetailPanelProps {
  selectedItem: WorkItem;
  onClose: () => void;
}

const TicketDetailPanel: React.FC<TicketDetailPanelProps> = ({ selectedItem, onClose }) => {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-[#080808] border-l border-[rgba(255,255,255,0.07)] z-50 flex flex-col shadow-2xl shadow-black/50 overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-[rgba(255,255,255,0.05)] sticky top-0 bg-[#080808]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {(() => {
              const ti =
                TYPE_CONFIG[(selectedItem.type || 'task') as keyof typeof TYPE_CONFIG] ||
                TYPE_CONFIG.task;
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
            <span className="text-xs font-mono text-muted-foreground">{selectedItem.key}</span>
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
            {selectedItem.priority && (
              <Badge variant="outline" className={getPriorityColor(selectedItem.priority)}>
                {selectedItem.priority}
              </Badge>
            )}
          </div>

          {/* Description */}
          {selectedItem.description && (
            <div>
              <p className="text-xs font-medium text-[#737373] mb-2">Description</p>
              <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
                <Markdown>{selectedItem.description}</Markdown>
              </div>
            </div>
          )}

          {/* Acceptance Criteria */}
          {selectedItem.acceptance_criteria && (
            <div>
              <p className="text-xs font-medium text-[#737373] mb-2">Acceptance Criteria</p>
              <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
                <Markdown>{selectedItem.acceptance_criteria}</Markdown>
              </div>
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Assignee', value: selectedItem.assignee || 'Unassigned' },
              { label: 'Sprint', value: selectedItem.sprint || 'Backlog' },
              { label: 'Story Points', value: selectedItem.story_points ?? '-' },
              {
                label: 'Est. Hours',
                value: selectedItem.estimated_hours ? `${selectedItem.estimated_hours}h` : '-',
              },
              {
                label: 'Logged Hours',
                value: selectedItem.logged_hours ? `${selectedItem.logged_hours}h` : '0h',
              },
              {
                label: 'Start Date',
                value: selectedItem.start_date
                  ? new Date(selectedItem.start_date).toLocaleDateString()
                  : 'Not set',
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
        </div>
      </div>
    </>
  );
};

export default TicketDetailPanel;
