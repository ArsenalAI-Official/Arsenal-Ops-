import { Dispatch, SetStateAction, RefObject } from 'react';
import { Upload, FileText, Calendar, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface PrdUploadFormProps {
  prdFile: File | null;
  setPrdFile: Dispatch<SetStateAction<File | null>>;
  prdText: string;
  setPrdText: Dispatch<SetStateAction<string>>;
  additionalContext: string;
  setAdditionalContext: Dispatch<SetStateAction<string>>;
  startDate: string;
  setStartDate: Dispatch<SetStateAction<string>>;
  endDate: string;
  setEndDate: Dispatch<SetStateAction<string>>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const PrdUploadForm = ({
  prdFile,
  setPrdFile,
  prdText,
  setPrdText,
  additionalContext,
  setAdditionalContext,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  fileInputRef,
  onFileUpload,
}: PrdUploadFormProps) => {
  return (
    <div className="space-y-6">
      <label className="text-sm font-medium text-[#a3a3a3] block mb-3">Upload PRD Document</label>
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          prdFile
            ? 'border-[#E0B954] bg-[#E0B954]/5'
            : 'border-[rgba(255,255,255,0.08)] hover:border-[#E0B954]/50 hover:bg-[rgba(255,255,255,0.02)]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          onChange={onFileUpload}
          className="hidden"
        />
        {prdFile ? (
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#E0B954]/20 flex items-center justify-center">
              <FileText className="w-6 h-6 text-[#E0B954]" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium">{prdFile.name}</p>
              <p className="text-xs text-[#737373]">{(prdFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPrdFile(null);
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
            <p className="text-xs text-[#737373]">PDF, Word, or Text files</p>
          </>
        )}
      </div>

      {/* OR Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-[rgba(255,255,255,0.07)]" />
        <span className="text-xs text-[#737373] font-medium">OR</span>
        <div className="flex-1 h-px bg-[rgba(255,255,255,0.07)]" />
      </div>

      {/* Text Input */}
      <div>
        <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
          Enter PRD Content Manually
        </label>
        <Textarea
          value={prdText}
          onChange={(e) => setPrdText(e.target.value)}
          placeholder="Describe your project requirements, features, user stories, technical specifications..."
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[180px] placeholder:text-[#334155] resize-none"
        />
      </div>

      {/* Additional Context */}
      <div>
        <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
          Additional Context (Optional)
        </label>
        <Textarea
          value={additionalContext}
          onChange={(e) => setAdditionalContext(e.target.value)}
          placeholder="Budget constraints, team size, timeline, preferred technologies, existing infrastructure..."
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[100px] placeholder:text-[#334155] resize-none"
        />
      </div>

      {/* Timeline */}
      <div>
        <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
          <Calendar className="w-4 h-4 inline mr-2" />
          Project Timeline (Optional)
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#737373] block mb-1.5">Start Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
            />
          </div>
          <div>
            <label className="text-xs text-[#737373] block mb-1.5">End Date</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
            />
          </div>
        </div>
        {startDate && endDate && (
          <p className="text-xs text-[#737373] mt-2">
            {Math.ceil(
              (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                (1000 * 60 * 60 * 24 * 7),
            )}{' '}
            weeks = ~
            {Math.max(
              1,
              Math.ceil(
                (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                  (1000 * 60 * 60 * 24 * 14),
              ),
            )}{' '}
            sprints (2-week each)
          </p>
        )}
      </div>
    </div>
  );
};

export default PrdUploadForm;
