import { Dispatch, SetStateAction, RefObject } from 'react';
import PrdUploadForm from './PrdUploadForm';
import RoadmapUploadForm from './RoadmapUploadForm';

interface UploadStepProps {
  uploadMode: 'prd' | 'roadmap';
  setUploadMode: Dispatch<SetStateAction<'prd' | 'roadmap'>>;
  // PRD form
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
  // Roadmap form
  roadmapFile: File | null;
  setRoadmapFile: Dispatch<SetStateAction<File | null>>;
  sprintWeeks: number;
  setSprintWeeks: Dispatch<SetStateAction<number>>;
  onRoadmapFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenTemplate: () => void;
}

const UploadStep = ({
  uploadMode,
  setUploadMode,
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
  roadmapFile,
  setRoadmapFile,
  sprintWeeks,
  setSprintWeeks,
  onRoadmapFileUpload,
  onOpenTemplate,
}: UploadStepProps) => {
  return (
    <div className="space-y-6">
      {/* Upload Mode Toggle */}
      <div className="flex gap-3">
        <button
          onClick={() => setUploadMode('prd')}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
            uploadMode === 'prd'
              ? 'bg-[#E0B954] text-black'
              : 'bg-[rgba(255,255,255,0.08)] text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.12)]'
          }`}
        >
          PRD Document
        </button>
        <button
          onClick={() => setUploadMode('roadmap')}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
            uploadMode === 'roadmap'
              ? 'bg-[#E0B954] text-black'
              : 'bg-[rgba(255,255,255,0.08)] text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.12)]'
          }`}
        >
          Roadmap File
        </button>
      </div>

      {uploadMode === 'prd' && (
        <PrdUploadForm
          prdFile={prdFile}
          setPrdFile={setPrdFile}
          prdText={prdText}
          setPrdText={setPrdText}
          additionalContext={additionalContext}
          setAdditionalContext={setAdditionalContext}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          fileInputRef={fileInputRef}
          onFileUpload={onFileUpload}
        />
      )}
      {uploadMode === 'roadmap' && (
        <RoadmapUploadForm
          roadmapFile={roadmapFile}
          setRoadmapFile={setRoadmapFile}
          sprintWeeks={sprintWeeks}
          setSprintWeeks={setSprintWeeks}
          onRoadmapFileUpload={onRoadmapFileUpload}
          onOpenTemplate={onOpenTemplate}
        />
      )}
    </div>
  );
};

export default UploadStep;
