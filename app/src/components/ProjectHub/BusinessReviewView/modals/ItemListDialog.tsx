import React from 'react';
import { ExternalLink, X } from 'lucide-react';
import type { WorkItem } from '../types';

interface ItemListDialogProps {
  title: string;
  countNoun: string;
  items: WorkItem[];
  emptyMessage: string;
  headerIcon: React.ReactNode;
  headerIconBgClass: string;
  rowIcon: React.ReactNode;
  rowIconBgClass: string;
  projectId: string | number;
  onClose: () => void;
}

const ItemListDialog: React.FC<ItemListDialogProps> = ({
  title,
  countNoun,
  items,
  emptyMessage,
  headerIcon,
  headerIconBgClass,
  rowIcon,
  rowIconBgClass,
  projectId,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[rgba(255,255,255,0.05)] sticky top-0 bg-[#0d0d0d]">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${headerIconBgClass}`}
            >
              {headerIcon}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="text-xs text-[#737373]">
                {items.length} {countNoun}
                {items.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#737373] hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-[#737373] text-center py-8">{emptyMessage}</p>
          ) : (
            items.map((item) => (
              <a
                key={item.id}
                onClick={() => {
                  window.open(`/project/${projectId}/board/${item.id}`, '_blank');
                }}
                className="flex items-center gap-3 p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-all cursor-pointer"
              >
                <div
                  className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${rowIconBgClass}`}
                >
                  {rowIcon}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-[#E0B954] block mb-1">{item.key}</span>
                  <p className="text-sm text-white truncate">{item.title || item.key}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-[#737373] flex-shrink-0" />
              </a>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[rgba(255,255,255,0.05)]">
          <button
            onClick={onClose}
            className="w-full bg-[#E0B954] hover:bg-[#C79E3B] text-[#080808] font-medium py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItemListDialog;
