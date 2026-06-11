import { useState, useRef, Dispatch, SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { invalidateProjectScope } from '@/lib/invalidations';

export interface Architecture {
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

export interface PRDAnalysis {
  id: number;
  summary: string;
  key_features: string[];
  technical_requirements: string[];
  cost_analysis: any;
  recommended_tools: any;
  risks: any[];
  timeline: any[];
}

export interface GeneratedTicket {
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

export interface Project {
  id: number;
  name: string;
}

export type AIStep = 'upload' | 'analyzing' | 'architectures' | 'preview' | 'committing' | 'done';

export interface TicketsSummary {
  total_story_points: number;
  total_estimated_hours: number;
  sprint_recommendation: string;
}

interface UseAIPlanningArgs {
  project: Project | null;
  setArchitectures: Dispatch<SetStateAction<Architecture[]>>;
  startDate: string;
  endDate: string;
  onClose: () => void;
  onCommitted: () => void;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
}

/**
 * All wizard state + handlers + the existing-PRD probe query for the AI
 * Planning modal. Returns a viewmodel the shell threads down into the step
 * components. Behavior-neutral extraction of the previous inline modal logic.
 */
export function useAIPlanning({
  project,
  setArchitectures,
  startDate,
  endDate,
  onClose,
  onCommitted,
  setIsGenerating,
}: UseAIPlanningArgs) {
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
  const [ticketsSummary, setTicketsSummary] = useState<TicketsSummary | null>(null);
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

  return {
    // step + mode
    aiStep,
    setAiStep,
    uploadMode,
    setUploadMode,
    // probe
    hasExistingPRDAnalysis,
    // template modal
    generateTemplateOpen,
    setGenerateTemplateOpen,
    // PRD inputs
    prdFile,
    setPrdFile,
    prdText,
    setPrdText,
    additionalContext,
    setAdditionalContext,
    fileInputRef,
    // analysis + architecture
    analysis,
    selectedArchitectureId,
    // PRD preview
    generatedTickets,
    ticketsSummary,
    // roadmap inputs + parsed
    roadmapFile,
    setRoadmapFile,
    sprintWeeks,
    setSprintWeeks,
    roadmapSummary,
    roadmapParsedData,
    // done
    createdTicketCount,
    // handlers
    handleFileUpload,
    handleRoadmapFileUpload,
    handleAnalyzePRD,
    handleParseRoadmap,
    handleSelectArchitecture,
    handleSaveAndClose,
    handlePreviewTickets,
    handleCommitArchitecture,
    handleCommitRoadmap,
  };
}

export type AIPlanningViewModel = ReturnType<typeof useAIPlanning>;
