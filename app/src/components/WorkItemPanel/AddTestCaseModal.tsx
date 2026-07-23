import { X, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface AddTestCaseFormValues {
  title: string;
  description: string;
}

interface AddTestCaseModalProps {
  isPending: boolean;
  onClose: () => void;
  onSubmit: (form: AddTestCaseFormValues) => void;
}

const empty: AddTestCaseFormValues = {
  title: '',
  description: '',
};

export const AddTestCaseModal = ({ isPending, onClose, onSubmit }: AddTestCaseModalProps) => {
  const [form, setForm] = useState<AddTestCaseFormValues>(empty);

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    onSubmit({ title: form.title.trim(), description: form.description.trim() });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
          <h2 className="text-lg font-bold text-white">Add Test Case</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — a Test Case carries only title, description, and status
            (status defaults server-side and is changed from the panel). */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Title</label>
            <Input
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && form.title.trim()) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Test case title…"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">
              Description <span className="text-[#555]">(optional)</span>
            </label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Steps, expected result…"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[100px] resize-none whitespace-pre-wrap"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
            className="text-[#737373] rounded-xl px-5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.title.trim() || isPending}
            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-[#080808] font-medium rounded-xl px-6 shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
          >
            <Plus className="w-4 h-4 mr-2" />
            {isPending ? 'Adding…' : 'Add Test Case'}
          </Button>
        </div>
      </div>
    </div>
  );
};
