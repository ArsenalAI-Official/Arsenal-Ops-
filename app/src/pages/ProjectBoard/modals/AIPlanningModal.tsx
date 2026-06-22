import { Dispatch, SetStateAction } from 'react';
import { Sparkles, CheckCircle2, X, ArrowRight, GitCommit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import GenerateRoadmapModal from '@/pages/ProjectDetail/modals/GenerateRoadmapModal';
import { useAIPlanning, type Project } from './AIPlanning/useAIPlanning';
import type { ProjectArchitectureResponse } from '@/client';
import UploadStep from './AIPlanning/steps/UploadStep';
import AnalyzingStep from './AIPlanning/steps/AnalyzingStep';
import ArchitecturesStep from './AIPlanning/steps/ArchitecturesStep';
import PreviewStep from './AIPlanning/steps/PreviewStep';
import CommittingStep from './AIPlanning/steps/CommittingStep';
import DoneStep from './AIPlanning/steps/DoneStep';

export interface AIPlanningModalProps {
  project: Project | null;
  architectures: ProjectArchitectureResponse[];
  setArchitectures: Dispatch<SetStateAction<ProjectArchitectureResponse[]>>;
  onEditArchitecture: (arch: ProjectArchitectureResponse) => void;
  startDate: string;
  setStartDate: Dispatch<SetStateAction<string>>;
  endDate: string;
  setEndDate: Dispatch<SetStateAction<string>>;
  onClose: () => void;
  onCommitted: () => void;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
}

const AIPlanningModal = ({
  project,
  architectures,
  setArchitectures,
  onEditArchitecture,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  onClose,
  onCommitted,
  setIsGenerating,
}: AIPlanningModalProps) => {
  const vm = useAIPlanning({
    project,
    setArchitectures,
    startDate,
    endDate,
    onClose,
    onCommitted,
    setIsGenerating,
  });
  const { aiStep, setAiStep, uploadMode } = vm;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Project Planning</h2>
              <p className="text-xs text-[#737373]">
                {aiStep === 'upload' && 'Upload PRD or enter project details'}
                {aiStep === 'analyzing' && 'Analyzing project requirements...'}
                {aiStep === 'architectures' && 'Select your preferred architecture'}
                {aiStep === 'preview' && 'Review generated tickets'}
                {aiStep === 'committing' && 'Creating tickets...'}
                {aiStep === 'done' && 'Tickets created successfully!'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {aiStep === 'upload' && (
            <UploadStep
              uploadMode={uploadMode}
              setUploadMode={vm.setUploadMode}
              prdFile={vm.prdFile}
              setPrdFile={vm.setPrdFile}
              prdText={vm.prdText}
              setPrdText={vm.setPrdText}
              additionalContext={vm.additionalContext}
              setAdditionalContext={vm.setAdditionalContext}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              fileInputRef={vm.fileInputRef}
              onFileUpload={vm.handleFileUpload}
              roadmapFile={vm.roadmapFile}
              setRoadmapFile={vm.setRoadmapFile}
              sprintWeeks={vm.sprintWeeks}
              setSprintWeeks={vm.setSprintWeeks}
              onRoadmapFileUpload={vm.handleRoadmapFileUpload}
              onOpenTemplate={() => vm.setGenerateTemplateOpen(true)}
            />
          )}

          {aiStep === 'analyzing' && <AnalyzingStep />}

          {aiStep === 'architectures' && (
            <ArchitecturesStep
              analysis={vm.analysis}
              roadmapSummary={vm.roadmapSummary}
              roadmapParsedData={vm.roadmapParsedData}
              architectures={architectures}
              selectedArchitectureId={vm.selectedArchitectureId}
              onSelectArchitecture={vm.handleSelectArchitecture}
              onEditArchitecture={onEditArchitecture}
            />
          )}

          {aiStep === 'preview' && (
            <PreviewStep
              uploadMode={uploadMode}
              generatedTickets={vm.generatedTickets}
              ticketsSummary={vm.ticketsSummary}
              roadmapSummary={vm.roadmapSummary}
              roadmapParsedData={vm.roadmapParsedData}
              sprintWeeks={vm.sprintWeeks}
            />
          )}

          {aiStep === 'committing' && <CommittingStep />}

          {aiStep === 'done' && (
            <DoneStep createdTicketCount={vm.createdTicketCount} onClose={onClose} />
          )}
        </div>

        {/* Modal Footer */}
        {(aiStep === 'upload' || aiStep === 'architectures' || aiStep === 'preview') && (
          <div className="flex items-center justify-between p-5 border-t border-[rgba(255,255,255,0.05)] flex-shrink-0">
            <Button
              variant="ghost"
              onClick={() => {
                if (aiStep === 'architectures') setAiStep('upload');
                else if (aiStep === 'preview') setAiStep('architectures');
                else onClose();
              }}
              className="text-[#737373] rounded-xl"
            >
              {aiStep === 'upload' ? 'Cancel' : 'Back'}
            </Button>

            {aiStep === 'upload' && (
              <>
                {uploadMode === 'prd' && (
                  /* The backend enforces one PRD per project (409 on second
                     upload). Disable the button up-front when an analysis
                     exists and explain why via tooltip. Wrap the button in a
                     <span> because pointer events don't fire on disabled
                     buttons — Radix Tooltip needs a hoverable target. */
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={vm.hasExistingPRDAnalysis ? 'cursor-not-allowed' : ''}>
                          <Button
                            onClick={vm.handleAnalyzePRD}
                            disabled={
                              vm.hasExistingPRDAnalysis || (!vm.prdFile && !vm.prdText.trim())
                            }
                            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                            // Pointer events off so the wrapping span's hover
                            // wins and the tooltip shows even when disabled.
                            style={
                              vm.hasExistingPRDAnalysis ? { pointerEvents: 'none' } : undefined
                            }
                          >
                            <Sparkles className="w-4 h-4 mr-2" />
                            Analyze PRD
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {vm.hasExistingPRDAnalysis && (
                        <TooltipContent>
                          A PRD analysis already exists for this project!
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
                {uploadMode === 'roadmap' && (
                  <Button
                    onClick={vm.handleParseRoadmap}
                    disabled={!vm.roadmapFile}
                    className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Parse Roadmap
                  </Button>
                )}
              </>
            )}

            {aiStep === 'architectures' && (
              <>
                {uploadMode === 'prd' ? (
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={vm.handleSaveAndClose}
                      className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Save &amp; close
                    </Button>
                    <Button
                      onClick={vm.handlePreviewTickets}
                      disabled={!vm.selectedArchitectureId}
                      className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                    >
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Preview Tickets
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setAiStep('preview')}
                    className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Create Tickets from Roadmap
                  </Button>
                )}
              </>
            )}

            {aiStep === 'preview' && (
              <Button
                onClick={
                  uploadMode === 'prd' ? vm.handleCommitArchitecture : vm.handleCommitRoadmap
                }
                className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#E0B954]/20"
              >
                <GitCommit className="w-4 h-4 mr-2" />
                {uploadMode === 'prd' ? 'Commit & Create Tickets' : 'Create Tickets from Roadmap'}
              </Button>
            )}
          </div>
        )}
      </div>

      {project && (
        <GenerateRoadmapModal
          open={vm.generateTemplateOpen}
          onOpenChange={vm.setGenerateTemplateOpen}
          projectId={project.id}
          projectName={project.name}
        />
      )}
    </div>
  );
};

export default AIPlanningModal;
