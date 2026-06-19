import { Upload, FileText, Download, X } from 'lucide-react';
import { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';

interface RoadmapUploadFormProps {
  roadmapFile: File | null;
  setRoadmapFile: Dispatch<SetStateAction<File | null>>;
  sprintWeeks: number;
  setSprintWeeks: Dispatch<SetStateAction<number>>;
  onRoadmapFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenTemplate: () => void;
}

const RoadmapUploadForm = ({
  roadmapFile,
  setRoadmapFile,
  sprintWeeks,
  setSprintWeeks,
  onRoadmapFileUpload,
  onOpenTemplate,
}: RoadmapUploadFormProps) => {
  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium text-[#a3a3a3] block mb-3">Weeks per Sprint</label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="6"
            value={sprintWeeks}
            onChange={(e) => setSprintWeeks(parseInt(e.target.value))}
            className="flex-1 h-2 bg-[rgba(255,255,255,0.1)] rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #E0B954 0%, #E0B954 ${(sprintWeeks / 6) * 100}%, rgba(255,255,255,0.1) ${(sprintWeeks / 6) * 100}%, rgba(255,255,255,0.1) 100%)`,
            }}
          />
          <div className="w-16 h-10 bg-[rgba(224,185,84,0.15)] border border-[#E0B954]/30 rounded-lg flex items-center justify-center">
            <span className="text-sm font-semibold text-[#E0B954]">{sprintWeeks} weeks</span>
          </div>
        </div>
        <p className="text-xs text-[#737373] mt-2">
          This will help determine how sprints are created from your roadmap
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-[#a3a3a3] block mb-3">Upload Roadmap File</label>
        <div
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.xlsx,.xls';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              // Synthetic event: the upload handler only reads e.target.files?.[0],
              // and there's no real <input> to dispatch from here.
              if (file)
                onRoadmapFileUpload({
                  target: { files: [file] },
                } as unknown as React.ChangeEvent<HTMLInputElement>);
            };
            input.click();
          }}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            roadmapFile
              ? 'border-[#E0B954] bg-[#E0B954]/5'
              : 'border-[rgba(255,255,255,0.08)] hover:border-[#E0B954]/50 hover:bg-[rgba(255,255,255,0.02)]'
          }`}
        >
          {roadmapFile ? (
            <div className="flex items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#E0B954]/20 flex items-center justify-center">
                <FileText className="w-6 h-6 text-[#E0B954]" />
              </div>
              <div className="text-left">
                <p className="text-white font-medium">{roadmapFile.name}</p>
                <p className="text-xs text-[#737373]">{(roadmapFile.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRoadmapFile(null);
                }}
                className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.08)] text-[#737373] hover:text-red-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 text-[#737373] mx-auto mb-3" />
              <p className="text-[#a3a3a3] mb-1">Click to upload or drag and drop</p>
              <p className="text-xs text-[#737373]">Excel files (.xlsx, .xls)</p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 bg-[rgba(224,185,84,0.05)] border border-[rgba(224,185,84,0.2)] rounded-xl p-4">
        <div>
          <p className="text-sm font-medium text-white">Don't have a roadmap file?</p>
          <p className="text-xs text-[#a3a3a3] mt-0.5">
            Download a starter template — pre-filled from your PRD if one's been analyzed, otherwise
            a blank scaffold with the right columns.
          </p>
        </div>
        <Button
          onClick={onOpenTemplate}
          className="bg-[#E0B954] hover:bg-[#C79E3B] text-black shrink-0"
        >
          <Download className="w-4 h-4 mr-1" />
          Download template
        </Button>
      </div>

      <div className="bg-[rgba(102,184,255,0.1)] border border-[rgba(102,184,255,0.3)] rounded-xl p-4">
        <p className="text-xs text-[#66b8ff] flex gap-2 items-start">
          <span className="mt-0.5">ℹ️</span>
          <span>
            Roadmap file should contain tables with columns: Type, Name, Description, Milestone,
            Epic, Priority, Effort, Assignee, and Weekly hours.
          </span>
        </p>
      </div>
    </div>
  );
};

export default RoadmapUploadForm;
