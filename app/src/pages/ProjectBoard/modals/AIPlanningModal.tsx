import { useState, useRef, Dispatch, SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Target,
  CheckCircle2,
  X,
  Upload,
  FileText,
  ArrowRight,
  Users,
  GitCommit,
  Calendar,
  BarChart3,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import ArchitectureCard from '@/components/ArchitectureCard';
import { apiFetch } from '@/lib/api';
import { invalidateProjectScope } from '@/lib/invalidations';
import GenerateRoadmapModal from '@/pages/ProjectDetail/modals/GenerateRoadmapModal';
import { Download } from 'lucide-react';
import { TYPE_CONFIG, PRIORITY_COLOR } from '@/lib/workItemConfig';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyDescription } from '@/components/ui/empty';

interface Architecture {
  id: number;
  name: string;
  description: string;
  architecture_type: string;
  mermaid_code: string;
  pros: string[];
  cons: string[];
  estimated_cost: string;
  complexity: string;
  time_to_implement: string;
  is_selected: boolean;
}

interface PRDAnalysis {
  id: number;
  summary: string;
  key_features: string[];
  technical_requirements: string[];
  cost_analysis: any;
  recommended_tools: any;
  risks: any[];
  timeline: any[];
}

interface GeneratedTicket {
  title: string;
  description: string;
  type: string;
  priority: string;
  story_points: number;
  estimated_hours: number;
  assignee_name: string;
  assignee_id: number | null;
  assignee_reasoning: string;
  tags: string[];
  sprint_number?: number;
  sprint_name?: string;
}

interface Project {
  id: number;
  name: string;
}

type AIStep = 'upload' | 'analyzing' | 'architectures' | 'preview' | 'committing' | 'done';

/**
 * Format two ISO date strings (sprint start Monday → sprint end Friday) into
 * a compact readable range, e.g.
 *   "Jan 5 – 16, 2026"             (same month)
 *   "Jan 26 – Feb 6, 2026"          (cross month, same year)
 *   "Dec 28, 2025 – Jan 9, 2026"    (cross year)
 *
 * Uses UTC methods because backend emits dates as midnight UTC and we want the
 * calendar dates the user sees in the spreadsheet — same pattern as
 * `formatWeekRange` in AdminDashboard/tabs/ProjectsTab.
 */
function formatSprintRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startISO} → ${endISO}`;
  }
  const monthOpts: Intl.DateTimeFormatOptions = { month: 'short', timeZone: 'UTC' };
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startMonth = start.toLocaleDateString('en-US', monthOpts);
  const endMonth = end.toLocaleDateString('en-US', monthOpts);
  if (sameMonth) {
    return `${startMonth} ${start.getUTCDate()} – ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${startMonth} ${start.getUTCDate()} – ${endMonth} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  return `${startMonth} ${start.getUTCDate()}, ${start.getUTCFullYear()} – ${endMonth} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

export interface AIPlanningModalProps {
  project: Project | null;
  architectures: Architecture[];
  setArchitectures: Dispatch<SetStateAction<Architecture[]>>;
  onEditArchitecture: (arch: Architecture) => void;
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
  const queryClient = useQueryClient();

  // Backend rule: one PRD per project. The /analyze-* endpoints 409 if an
  // analysis already exists. Check up-front so we can disable the Analyze
  // button + show a tooltip explanation instead of letting the user spend a
  // file pick + click only to see an error toast.
  //
  // The endpoint returns `null` when no analysis exists (not 404), so we
  // probe with a useQuery and treat truthy data as "already analyzed". The
  // query auto-disables when project is null, and stays cheap since the
  // payload is small.
  const existingPRDQuery = useQuery<unknown>({
    queryKey: ['prdAnalysisExists', project?.id],
    queryFn: () => apiFetch(`/api/prd/projects/${project?.id}/analysis`),
    enabled: !!project?.id,
  });
  const hasExistingPRDAnalysis = existingPRDQuery.data != null;

  const [aiStep, setAiStep] = useState<AIStep>('upload');
  const [generateTemplateOpen, setGenerateTemplateOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<'prd' | 'roadmap'>('prd');
  const [prdFile, setPrdFile] = useState<File | null>(null);
  const [prdText, setPrdText] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [analysis, setAnalysis] = useState<PRDAnalysis | null>(null);
  const [selectedArchitectureId, setSelectedArchitectureId] = useState<number | null>(null);
  const [generatedTickets, setGeneratedTickets] = useState<GeneratedTicket[]>([]);
  const [ticketsSummary, setTicketsSummary] = useState<{
    total_story_points: number;
    total_estimated_hours: number;
    sprint_recommendation: string;
  } | null>(null);
  const [roadmapFile, setRoadmapFile] = useState<File | null>(null);
  const [sprintWeeks, setSprintWeeks] = useState<number>(2);
  const [roadmapSummary, setRoadmapSummary] = useState<any>(null);
  const [roadmapParsedData, setRoadmapParsedData] = useState<any>(null);
  const [createdTicketCount, setCreatedTicketCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
      ];
      if (!validTypes.includes(file.type)) {
        toast.error('Please upload a PDF, Word, or text file');
        return;
      }
      setPrdFile(file);
    }
  };

  // Handle roadmap file upload
  const handleRoadmapFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isExcel =
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel' ||
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls');
      if (!isExcel) {
        toast.error('Please upload an Excel file (.xlsx or .xls)');
        return;
      }
      setRoadmapFile(file);
    }
  };

  // Analyze PRD
  const handleAnalyzePRD = async () => {
    if (!project || (!prdFile && !prdText.trim())) {
      toast.error('Please upload a file or enter PRD content');
      return;
    }

    setAiStep('analyzing');
    setIsGenerating(true);

    try {
      let data: any;
      if (prdFile) {
        // File upload — apiFetch skips Content-Type for FormData
        const formData = new FormData();
        formData.append('file', prdFile);
        formData.append('project_id', String(project.id));
        formData.append('additional_context', additionalContext);
        data = await apiFetch('/api/prd/analyze-file', { method: 'POST', body: formData });
      } else {
        data = await apiFetch('/api/prd/analyze-text', {
          method: 'POST',
          body: JSON.stringify({
            project_id: project.id,
            prd_content: prdText,
            additional_context: additionalContext,
          }),
        });
      }
      setAnalysis(data.analysis);
      setArchitectures(data.architectures);
      setAiStep('architectures');
      // Backend has persisted PRDAnalysis + architectures. Invalidate the
      // ProjectDetail caches so the analysis surfaces there even if the user
      // closes this modal without going through preview/commit.
      invalidateProjectScope(queryClient, project.id);
      toast.success('PRD analyzed successfully!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to analyze PRD');
      setAiStep('upload');
    } finally {
      setIsGenerating(false);
    }
  };

  // Parse Roadmap
  const handleParseRoadmap = async () => {
    if (!project || !roadmapFile) {
      toast.error('Please select a roadmap file');
      return;
    }

    setAiStep('analyzing');
    setIsGenerating(true);

    try {
      const formData = new FormData();
      formData.append('file', roadmapFile);
      formData.append('project_id', String(project.id));
      formData.append('sprint_weeks', String(sprintWeeks));

      const data = await apiFetch<any>('/api/roadmap/parse-file', {
        method: 'POST',
        body: formData,
      });
      setRoadmapSummary(data.summary);
      setRoadmapParsedData(data.parsed_data);
      setAiStep('architectures'); // Reuse architectures step for summary display
      toast.success('Roadmap parsed successfully!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to parse roadmap');
      setAiStep('upload');
    } finally {
      setIsGenerating(false);
    }
  };

  // Select architecture
  const handleSelectArchitecture = async (archId: number) => {
    setSelectedArchitectureId(archId);
    if (!project) return;
    try {
      await apiFetch(`/api/prd/architectures/${archId}/select`, { method: 'POST' });
      // Reflect the selection on ProjectDetail (project.selected_architecture).
      invalidateProjectScope(queryClient, project.id);
    } catch (err) {
      console.error('Failed to select architecture:', err);
    }
  };

  // User wants to exit at the architectures step without going through the
  // preview/commit flow. The PRDAnalysis and selected architecture are already
  // persisted server-side; we just invalidate caches and close.
  const handleSaveAndClose = () => {
    if (!project) {
      onClose();
      return;
    }
    invalidateProjectScope(queryClient, project.id);
    toast.success('PRD analysis saved. You can resume any time.');
    onClose();
  };

  // Preview generated tickets
  const handlePreviewTickets = async () => {
    if (!project || !selectedArchitectureId) return;

    setAiStep('preview');
    setIsGenerating(true);

    try {
      const data = await apiFetch<any>(`/api/prd/projects/${project.id}/generate-tickets-preview`, {
        method: 'POST',
        body: JSON.stringify({ architecture_id: selectedArchitectureId }),
      });
      setGeneratedTickets(data.tickets);
      setTicketsSummary({
        total_story_points: data.total_story_points,
        total_estimated_hours: data.total_estimated_hours,
        sprint_recommendation: data.sprint_recommendation,
      });
    } catch {
      toast.error('Failed to generate tickets');
      setAiStep('architectures');
    } finally {
      setIsGenerating(false);
    }
  };

  // Commit architecture and create tickets (PRD mode)
  const handleCommitArchitecture = async () => {
    if (!project || !selectedArchitectureId) return;

    setAiStep('committing');
    setIsGenerating(true);

    try {
      const data = await apiFetch<any>(`/api/prd/projects/${project.id}/commit-architecture`, {
        method: 'POST',
        body: JSON.stringify({
          architecture_id: selectedArchitectureId,
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      });

      // Check if AI actually created tickets
      if (!data.success || data.tickets_created === 0) {
        toast.error(data.error || 'AI failed to generate tickets. Existing tickets preserved.');
        setAiStep('preview');
        return;
      }

      setAiStep('done');
      toast.success(
        `Created ${data.tickets_created} tickets${data.sprints?.length ? ` in ${data.sprints.length} sprints` : ''}!`,
      );
      setCreatedTicketCount(data.tickets_created);

      // Invalidate react-query caches so board refreshes automatically
      onCommitted();

      // Close modal after delay
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to commit architecture');
      setAiStep('preview');
    } finally {
      setIsGenerating(false);
    }
  };

  // Commit roadmap and create tickets (Roadmap mode)
  const handleCommitRoadmap = async () => {
    if (!project || !roadmapParsedData) return;

    setAiStep('committing');
    setIsGenerating(true);

    try {
      const data = await apiFetch<any>('/api/roadmap/commit', {
        method: 'POST',
        body: JSON.stringify({ project_id: project.id, parsed_data: roadmapParsedData }),
      });

      setAiStep('done');
      const sprintMsg = data.sprints_created > 0 ? ` and ${data.sprints_created} sprints` : '';
      toast.success(
        `Created ${data.tickets_created} tasks in ${data.epics_created} epics${sprintMsg}!${data.assignees_not_found > 0 ? ` (${data.assignees_not_found} auto-assigned)` : ''}`,
      );
      setCreatedTicketCount(data.tickets_created);

      // Invalidate react-query caches so board refreshes automatically
      onCommitted();

      // Close modal after delay
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to commit roadmap');
      setAiStep('preview');
    } finally {
      setIsGenerating(false);
    }
  };

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
          {/* Step: Upload */}
          {aiStep === 'upload' && (
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

              {/* PRD Mode */}
              {uploadMode === 'prd' && (
                <div className="space-y-6">
                  <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
                    Upload PRD Document
                  </label>
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
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {prdFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-[#E0B954]/20 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-[#E0B954]" />
                        </div>
                        <div className="text-left">
                          <p className="text-white font-medium">{prdFile.name}</p>
                          <p className="text-xs text-[#737373]">
                            {(prdFile.size / 1024).toFixed(1)} KB
                          </p>
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
              )}
              {uploadMode === 'roadmap' && (
                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
                      Weeks per Sprint
                    </label>
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
                        <span className="text-sm font-semibold text-[#E0B954]">
                          {sprintWeeks} weeks
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-[#737373] mt-2">
                      This will help determine how sprints are created from your roadmap
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
                      Upload Roadmap File
                    </label>
                    <div
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.xlsx,.xls';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) handleRoadmapFileUpload({ target: { files: [file] } } as any);
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
                            <p className="text-xs text-[#737373]">
                              {(roadmapFile.size / 1024).toFixed(1)} KB
                            </p>
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
                        Download a starter template — pre-filled from your PRD if one's been
                        analyzed, otherwise a blank scaffold with the right columns.
                      </p>
                    </div>
                    <Button
                      onClick={() => setGenerateTemplateOpen(true)}
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
                        Roadmap file should contain tables with columns: Type, Name, Description,
                        Milestone, Epic, Priority, Effort, Assignee, and Weekly hours.
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Analyzing */}
          {aiStep === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center mb-6 animate-pulse">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <Spinner size="xl" className="mb-6" />
              <h3 className="text-xl font-semibold text-white mb-2">
                AI is analyzing your project
              </h3>
              <p className="text-[#737373] text-center max-w-md">
                Performing cost analysis, recommending tools, and generating architecture options...
              </p>
            </div>
          )}

          {/* Step: Architecture Selection / Roadmap Summary */}
          {aiStep === 'architectures' && (
            <div className="space-y-6">
              {/* PRD Analysis Summary */}
              {analysis && (
                <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#E0B954]" />
                    PRD Analysis Summary
                  </h3>
                  <p className="text-sm text-[#a3a3a3] mb-4">{analysis.summary}</p>

                  {analysis.key_features && analysis.key_features.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-[#737373] font-medium mb-2">Key Features</p>
                      <div className="flex flex-wrap gap-2">
                        {analysis.key_features.slice(0, 6).map((feature, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 rounded-lg bg-[#E0B954]/10 text-[#E0B954] text-xs"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.recommended_tools && (
                    <div>
                      <p className="text-xs text-[#737373] font-medium mb-2">Recommended Tools</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(analysis.recommended_tools)
                          .slice(0, 6)
                          .map(([category, tool]) => (
                            <span
                              key={category}
                              className="px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-[#a3a3a3] text-xs"
                            >
                              {category}: {String(tool)}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Roadmap Summary */}
              {roadmapSummary && (
                <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#E0B954]" />
                    Roadmap Summary
                  </h3>

                  {/* Key Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="bg-[rgba(102,184,255,0.1)] rounded-lg p-3">
                      <p className="text-xs text-[#737373] mb-1">Epics</p>
                      <p className="text-lg font-bold text-[#66b8ff]">
                        {roadmapSummary.total_epics}
                      </p>
                    </div>
                    <div className="bg-[rgba(224,185,84,0.1)] rounded-lg p-3">
                      <p className="text-xs text-[#737373] mb-1">Tasks</p>
                      <p className="text-lg font-bold text-[#E0B954]">
                        {roadmapSummary.total_tasks}
                      </p>
                    </div>
                    <div className="bg-[rgba(16,185,129,0.1)] rounded-lg p-3">
                      <p className="text-xs text-[#737373] mb-1">Team Size</p>
                      <p className="text-lg font-bold text-[#10b981]">
                        {roadmapSummary.total_assignees}
                      </p>
                    </div>
                    <div className="bg-[rgba(245,158,11,0.1)] rounded-lg p-3">
                      <p className="text-xs text-[#737373] mb-1">Duration</p>
                      <p className="text-lg font-bold text-[#F59E0B]">
                        {roadmapSummary.timeline.duration_weeks}w
                      </p>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="mb-4 pb-4 border-b border-[rgba(255,255,255,0.07)]">
                    <p className="text-xs font-medium text-[#737373] mb-2">Timeline</p>
                    <p className="text-sm text-[#a3a3a3]">
                      {roadmapSummary.timeline.start} → {roadmapSummary.timeline.end}
                    </p>
                  </div>

                  {/* Sprints — per-sprint date list that will be committed.
                      Reads from `roadmapParsedData.sprints` (passed verbatim
                      from the parser; no extra API surface). When milestone
                      date ranges have calendar gaps, the parser splits sprints
                      at the gap so each sprint stays calendar-continuous —
                      the gap weeks surface as a callout below the list. */}
                  {roadmapParsedData?.sprints && roadmapParsedData.sprints.length > 0 && (
                    <div className="mb-4 pb-4 border-b border-[rgba(255,255,255,0.07)]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-[#737373]">
                          Sprints ({roadmapParsedData.sprints.length})
                        </p>
                        <span className="text-[10px] text-[#525252]">Created on confirm</span>
                      </div>
                      <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                        {roadmapParsedData.sprints.map((sprint: any) => (
                          <div
                            key={sprint.number}
                            className="flex items-center justify-between gap-3 text-xs bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] rounded-lg px-3 py-2"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-semibold text-[#E0B954] tabular-nums shrink-0">
                                Sprint {sprint.number}
                              </span>
                              <span className="text-[#a3a3a3] truncate">
                                {formatSprintRange(sprint.start_week, sprint.end_week)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-[#737373] shrink-0 tabular-nums">
                              <span>{sprint.duration_weeks}w</span>
                              <span>
                                {sprint.task_count ?? sprint.tasks?.length ?? 0} task
                                {(sprint.task_count ?? sprint.tasks?.length ?? 0) === 1 ? '' : 's'}
                              </span>
                              {typeof sprint.total_hours === 'number' && sprint.total_hours > 0 && (
                                <span>{Math.round(sprint.total_hours)}h</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Calendar-gap callout — sprints intentionally don't bridge
                          uncovered weeks (would produce calendar-discontinuous
                          ranges in burndowns). The detailed `uncovered_week`
                          entries are also surfaced in the Warnings list below;
                          this is a one-liner pointer up here so the user spots
                          gaps without scrolling. */}
                      {roadmapParsedData?.meta?.missing_weeks &&
                        roadmapParsedData.meta.missing_weeks.length > 0 && (
                          <p className="mt-2 text-[10px] text-[#f59e0b]">
                            {roadmapParsedData.meta.missing_weeks.length} calendar week
                            {roadmapParsedData.meta.missing_weeks.length === 1 ? '' : 's'} not
                            covered by any milestone — no sprint for{' '}
                            {roadmapParsedData.meta.missing_weeks.length === 1
                              ? 'that week'
                              : 'those weeks'}
                            . See warnings below.
                          </p>
                        )}
                    </div>
                  )}

                  {/* Team Members */}
                  {roadmapSummary.assignees && roadmapSummary.assignees.length > 0 && (
                    <div className="mb-4 pb-4 border-b border-[rgba(255,255,255,0.07)]">
                      <p className="text-xs font-medium text-[#737373] mb-2">Team Members</p>
                      <div className="flex flex-wrap gap-2">
                        {roadmapSummary.assignees.map((assignee: string, i: number) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-[#a3a3a3] text-xs"
                          >
                            {assignee}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {roadmapSummary.warnings && roadmapSummary.warnings.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-[#f59e0b] mb-2">
                        ⚠️ Warnings ({roadmapSummary.warnings.length})
                      </p>
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-2">
                        {roadmapSummary.warnings.map((warning: any, i: number) => (
                          <div
                            key={i}
                            className="text-xs text-[#737373] bg-[rgba(245,158,11,0.08)] p-2 rounded"
                          >
                            <p className="font-medium text-[#f59e0b]">{warning.issue}</p>
                            <p className="text-xs">
                              {warning.task}: {warning.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Conflicts */}
                  {roadmapSummary.conflicts && roadmapSummary.conflicts.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-[#ef4444] mb-2">
                        🔴 Conflicts ({roadmapSummary.conflicts.length})
                      </p>
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-2">
                        {roadmapSummary.conflicts.map((conflict: any, i: number) => (
                          <div
                            key={i}
                            className="text-xs text-[#737373] bg-[rgba(239,68,68,0.08)] p-2 rounded"
                          >
                            <p className="font-medium text-[#ef4444]">
                              {conflict.assignee} - Week {conflict.week}
                            </p>
                            <p>
                              {conflict.total_hrs}h scheduled (tasks: {conflict.tasks.join(', ')})
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Architecture Cards (PRD Mode) */}
              {!roadmapSummary && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-4">Select Architecture</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {architectures.map((arch) => (
                      <ArchitectureCard
                        key={arch.id}
                        architecture={arch}
                        isSelected={selectedArchitectureId === arch.id}
                        onSelect={() => handleSelectArchitecture(arch.id)}
                        onViewFullScreen={() => onEditArchitecture(arch)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Preview Tickets */}
          {aiStep === 'preview' && (
            <div className="space-y-6">
              {/* PRD Mode - Summary Stats */}
              {uploadMode === 'prd' && ticketsSummary && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-[#E0B954]">{generatedTickets.length}</p>
                    <p className="text-xs text-[#737373]">Tickets</p>
                  </div>
                  <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-[#F59E0B]">
                      {ticketsSummary.total_story_points}
                    </p>
                    <p className="text-xs text-[#737373]">Total Points</p>
                  </div>
                  <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-[#E0B954]">
                      {ticketsSummary.total_estimated_hours}h
                    </p>
                    <p className="text-xs text-[#737373]">Estimated Hours</p>
                  </div>
                </div>
              )}

              {/* Roadmap Mode - Summary Stats */}
              {uploadMode === 'roadmap' && roadmapSummary && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[rgba(102,184,255,0.1)] rounded-lg p-3">
                      <p className="text-xs text-[#737373] mb-1">Epics</p>
                      <p className="text-lg font-bold text-[#66b8ff]">
                        {roadmapSummary.total_epics}
                      </p>
                    </div>
                    <div className="bg-[rgba(224,185,84,0.1)] rounded-lg p-3">
                      <p className="text-xs text-[#737373] mb-1">Tasks</p>
                      <p className="text-lg font-bold text-[#E0B954]">
                        {roadmapSummary.total_tasks}
                      </p>
                    </div>
                    <div className="bg-[rgba(16,185,129,0.1)] rounded-lg p-3">
                      <p className="text-xs text-[#737373] mb-1">Team Size</p>
                      <p className="text-lg font-bold text-[#10b981]">
                        {roadmapSummary.total_assignees}
                      </p>
                    </div>
                    <div className="bg-[rgba(245,158,11,0.1)] rounded-lg p-3">
                      <p className="text-xs text-[#737373] mb-1">Duration</p>
                      <p className="text-lg font-bold text-[#F59E0B]">
                        {roadmapSummary.timeline?.duration_weeks || '?'}w
                      </p>
                    </div>
                  </div>

                  {/* Sprint Info */}
                  {roadmapSummary.total_sprints !== undefined && (
                    <div className="bg-[rgba(224,185,84,0.1)] border border-[#E0B954]/20 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-[#E0B954]/20 flex items-center justify-center">
                          <BarChart3 className="w-5 h-5 text-[#E0B954]" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Sprint Plan</p>
                          <p className="text-xs text-[#737373]">{sprintWeeks} weeks per sprint</p>
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-[#E0B954] mb-1">
                        {roadmapSummary.total_sprints} Sprints
                      </p>
                      <p className="text-xs text-[#a3a3a3]">
                        Will be created with {sprintWeeks}-week cycles
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Sprint Recommendation (PRD only) */}
              {uploadMode === 'prd' && ticketsSummary?.sprint_recommendation && (
                <div className="bg-[#E0B954]/10 border border-[#E0B954]/20 rounded-xl p-4">
                  <p className="text-sm text-[#E0B954] font-medium">Sprint Recommendation</p>
                  <p className="text-xs text-[#a3a3a3] mt-1">
                    {ticketsSummary.sprint_recommendation}
                  </p>
                </div>
              )}

              {/* Tickets List - PRD Mode */}
              {uploadMode === 'prd' && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-[#E0B954]" />
                    Generated Tickets ({generatedTickets.length})
                  </h3>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {generatedTickets.length === 0 ? (
                      <Empty className="py-8">
                        <EmptyDescription className="text-[#737373]">
                          No tickets generated. Please try again.
                        </EmptyDescription>
                      </Empty>
                    ) : (
                      generatedTickets.map((ticket, index) => {
                        const typeInfo =
                          TYPE_CONFIG[ticket.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.task;
                        const TypeIcon = typeInfo.icon;
                        return (
                          <div
                            key={index}
                            className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <div
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                                    style={{
                                      backgroundColor: typeInfo.bg,
                                      color: typeInfo.color,
                                    }}
                                  >
                                    <TypeIcon className="w-3 h-3" />
                                    {typeInfo.label}
                                  </div>
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                    style={{
                                      backgroundColor:
                                        (PRIORITY_COLOR[ticket.priority] ?? PRIORITY_COLOR.low) +
                                        '33',
                                      color: PRIORITY_COLOR[ticket.priority] ?? PRIORITY_COLOR.low,
                                    }}
                                  >
                                    {ticket.priority.charAt(0).toUpperCase() +
                                      ticket.priority.slice(1)}
                                  </span>
                                </div>
                                <h4 className="text-sm font-medium text-white mb-1">
                                  {ticket.title}
                                </h4>
                                <p className="text-xs text-[#737373] line-clamp-2">
                                  {ticket.description}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-[#737373]">
                                    {ticket.story_points} pts
                                  </span>
                                  <span className="text-xs text-[#737373]">
                                    {ticket.estimated_hours}h
                                  </span>
                                </div>
                                {ticket.assignee_name && (
                                  <div className="flex items-center gap-2 bg-[rgba(244,246,255,0.05)] rounded-lg px-2 py-1">
                                    <Users className="w-3 h-3 text-[#E0B954]" />
                                    <span className="text-xs text-[#a3a3a3]">
                                      {ticket.assignee_name}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                            {ticket.assignee_reasoning && (
                              <p className="text-[10px] text-[#737373] mt-2 italic">
                                Assignment: {ticket.assignee_reasoning}
                              </p>
                            )}
                            {ticket.tags && ticket.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {ticket.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-[rgba(255,255,255,0.05)] text-[#737373]"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Tickets List - Roadmap Mode */}
              {uploadMode === 'roadmap' && roadmapParsedData && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-[#E0B954]" />
                    Roadmap Tickets ({roadmapParsedData.tickets?.length || 0})
                  </h3>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {!roadmapParsedData.tickets || roadmapParsedData.tickets.length === 0 ? (
                      <Empty className="py-8">
                        <EmptyDescription className="text-[#737373]">
                          No tickets found in roadmap.
                        </EmptyDescription>
                      </Empty>
                    ) : (
                      roadmapParsedData.tickets.map((ticket: any, index: number) => (
                        <div
                          key={index}
                          className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className="text-[10px] bg-[#E0B954]/20 text-[#E0B954] border-0">
                                  {ticket.priority || 'medium'}
                                </Badge>
                              </div>
                              <h4 className="text-sm font-medium text-white mb-1">{ticket.name}</h4>
                              <p className="text-xs text-[#737373] line-clamp-2">
                                {ticket.description || 'No description'}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                              <span className="text-xs text-[#737373]">
                                {ticket.effort_hrs || 0}h
                              </span>
                              {ticket.assignee && (
                                <div className="flex items-center gap-2 bg-[rgba(244,246,255,0.05)] rounded-lg px-2 py-1">
                                  <Users className="w-3 h-3 text-[#E0B954]" />
                                  <span className="text-xs text-[#a3a3a3]">{ticket.assignee}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {ticket.milestone && (
                            <p className="text-[10px] text-[#737373] mt-2">
                              Milestone: {ticket.milestone}
                            </p>
                          )}
                          {ticket.epic && (
                            <p className="text-[10px] text-[#737373]">Epic: {ticket.epic}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Committing */}
          {aiStep === 'committing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center mb-6">
                <GitCommit className="w-8 h-8 text-white" />
              </div>
              <Spinner size="xl" className="mb-6" />
              <h3 className="text-xl font-semibold text-white mb-2">Creating Tickets</h3>
              <p className="text-[#737373] text-center max-w-md">
                Adding tickets to your board and assigning to team members...
              </p>
            </div>
          )}

          {/* Step: Done */}
          {aiStep === 'done' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 rounded-full bg-[#E0B954]/20 flex items-center justify-center mb-6">
                <CheckCircle2 className="w-10 h-10 text-[#E0B954]" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">All Done!</h3>
              <p className="text-[#a3a3a3] mb-6">
                <span className="text-2xl font-bold text-[#E0B954]">{createdTicketCount}</span>{' '}
                tickets created successfully
              </p>
              <Button
                onClick={onClose}
                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-8"
              >
                View Board
              </Button>
            </div>
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
                        <span className={hasExistingPRDAnalysis ? 'cursor-not-allowed' : ''}>
                          <Button
                            onClick={handleAnalyzePRD}
                            disabled={hasExistingPRDAnalysis || (!prdFile && !prdText.trim())}
                            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                            // Pointer events off so the wrapping span's hover
                            // wins and the tooltip shows even when disabled.
                            style={hasExistingPRDAnalysis ? { pointerEvents: 'none' } : undefined}
                          >
                            <Sparkles className="w-4 h-4 mr-2" />
                            Analyze PRD
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {hasExistingPRDAnalysis && (
                        <TooltipContent>
                          A PRD analysis already exists for this project!
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
                {uploadMode === 'roadmap' && (
                  <Button
                    onClick={handleParseRoadmap}
                    disabled={!roadmapFile}
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
                      onClick={handleSaveAndClose}
                      className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Save &amp; close
                    </Button>
                    <Button
                      onClick={handlePreviewTickets}
                      disabled={!selectedArchitectureId}
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
                onClick={uploadMode === 'prd' ? handleCommitArchitecture : handleCommitRoadmap}
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
          open={generateTemplateOpen}
          onOpenChange={setGenerateTemplateOpen}
          projectId={project.id}
          projectName={project.name}
        />
      )}
    </div>
  );
};

export default AIPlanningModal;
