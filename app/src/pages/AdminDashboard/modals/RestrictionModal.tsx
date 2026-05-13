import React from 'react';
import { X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface RestrictionModalProps {
  showRestrictionModal: boolean;
  editingRestriction: any | null;
  restrictionForm: { name: string; tab_name: string; subsection: string };
  setRestrictionForm: React.Dispatch<React.SetStateAction<{ name: string; tab_name: string; subsection: string }>>;
  setShowRestrictionModal: (show: boolean) => void;
  handleSaveRestriction: () => void;
}

const RestrictionModal: React.FC<RestrictionModalProps> = ({
  showRestrictionModal,
  editingRestriction,
  restrictionForm,
  setRestrictionForm,
  setShowRestrictionModal,
  handleSaveRestriction,
}) => {
  if (!showRestrictionModal) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={() => setShowRestrictionModal(false)}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
          <h2 className="text-lg font-bold text-white">
            {editingRestriction ? 'Edit Restriction' : 'Add Custom Restriction'}
          </h2>
          <button
            onClick={() => setShowRestrictionModal(false)}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">
              Restriction Name *
            </label>
            <Input
              value={restrictionForm.name}
              onChange={(e) => setRestrictionForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g., NoWorkload, NoAnalytics"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">
              Tab Name *
            </label>
            <select
              value={restrictionForm.tab_name}
              onChange={(e) => setRestrictionForm((f) => ({ ...f, tab_name: e.target.value }))}
              className="w-full bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 px-3 text-sm"
            >
              <option value="">Select a tab...</option>
              <option value="project_manager">Project Manager</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">
              Subsection *
            </label>
            <Input
              value={restrictionForm.subsection}
              onChange={(e) =>
                setRestrictionForm((f) => ({ ...f, subsection: e.target.value }))
              }
              placeholder="e.g., workload, analytics, timeline"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
            />
            <p className="text-[10px] text-[#737373] mt-1">
              The subsection within the tab that will be hidden from users with this
              restriction.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-[rgba(255,255,255,0.05)]">
          <button
            onClick={() => setShowRestrictionModal(false)}
            className="px-4 py-2 rounded-lg text-[#737373] hover:bg-[rgba(255,255,255,0.05)] transition"
          >
            Cancel
          </button>
          <Button
            onClick={handleSaveRestriction}
            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
          >
            <Save className="w-4 h-4 mr-2" />
            {editingRestriction ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RestrictionModal;
