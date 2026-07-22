import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useCallback, Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import type {
  ProjectArchitectureResponse,
  PrdAnalysisResponse,
  RebalanceSprintsResponse,
} from '@/client';
import { apiFetch } from '@/lib/api';
import { invalidateProjectScope } from '@/lib/invalidations';
import { toastErrorHandler } from '@/lib/mutationToast';

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

// ── Roadmap parser shapes ───────────────────────────────────────────────────
// The /api/roadmap/* and /api/prd/* endpoints return plain dicts (no
// response_model, so nothing is generated into @/client). These are minimal
// local interfaces covering the fields the wizard actually reads; backend
// field names are inferred from usage, not a typed contract.
export interface RoadmapTimeline {
  start: string;
  end: string;
  duration_weeks: number;
}

export interface RoadmapWarning {
  issue: string;
  task: string;
  detail: string;
}

export interface RoadmapConflict {
  assignee: string;
  week: number | string;
  total_hrs: number;
  tasks: string[];
}

export interface RoadmapSprint {
  number: number;
  start_week: string;
  end_week: string;
  duration_weeks: number;
  /** The ordered Monday week-dates this sprint covers (from the parser). Used
   *  to re-partition when sprint lengths change. */
  week_dates?: string[];
  task_count?: number;
  tasks?: string[];
  total_hours?: number;
}

export interface RoadmapTicket {
  name: string;
  description?: string;
  priority?: string;
  effort_hrs?: number;
  assignee?: string;
  milestone?: string;
  epic?: string;
  /** Per-week hours ({ 'YYYY-MM-DD': hours }) — drives sprint assignment. */
  week_hours?: Record<string, number>;
  /** Weeks the task has any work in. */
  active_weeks?: string[];
}

export interface RoadmapSummary {
  total_epics: number;
  total_tasks: number;
  total_assignees: number;
  total_sprints?: number;
  timeline: RoadmapTimeline;
  assignees?: string[];
  warnings?: RoadmapWarning[];
  conflicts?: RoadmapConflict[];
}

export interface RoadmapParsedData {
  tickets?: RoadmapTicket[];
  sprints?: RoadmapSprint[];
  meta?: { missing_weeks?: unknown[] };
}

interface RoadmapParseResponse {
  summary: RoadmapSummary;
  parsed_data: RoadmapParsedData;
}

interface PrdAnalyzeResponse {
  analysis: PrdAnalysisResponse;
  architectures: ProjectArchitectureResponse[];
}

interface GenerateTicketsPreviewResponse {
  tickets: GeneratedTicket[];
  total_story_points: number;
  total_estimated_hours: number;
  sprint_recommendation: string;
}

interface CommitArchitectureResponse {
  success: boolean;
  tickets_created: number;
  error?: string;
  sprints?: unknown[];
}

interface RoadmapCommitResponse {
  tickets_created: number;
  epics_created: number;
  sprints_created: number;
  assignees_not_found: number;
}

interface UseAIPlanningArgs {
  project: Project | null;
  setArchitectures: Dispatch<SetStateAction<ProjectArchitectureResponse[]>>;
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
  const [analysis, setAnalysis] = useState<PrdAnalysisResponse | null>(null);
  const [selectedArchitectureId, setSelectedArchitectureId] = useState<number | null>(null);
  const [generatedTickets, setGeneratedTickets] = useState<GeneratedTicket[]>([]);
  const [ticketsSummary, setTicketsSummary] = useState<TicketsSummary | null>(null);
  const [roadmapFile, setRoadmapFile] = useState<File | null>(null);
  const [sprintWeeks, setSprintWeeks] = useState<number>(2);
  const [roadmapSummary, setRoadmapSummary] = useState<RoadmapSummary | null>(null);
  const [roadmapParsedData, setRoadmapParsedData] = useState<RoadmapParsedData | null>(null);
  // Fresh read of the parsed data for the async rebalance handler (avoids a
  // stale closure without adding it to the callback's deps).
  const roadmapParsedDataRef = useRef(roadmapParsedData);
  roadmapParsedDataRef.current = roadmapParsedData;
  // Latest-wins guard so a slow rebalance response can't clobber a newer edit.
  const rebalanceReqId = useRef(0);

  // Change one sprint's length (in weeks) in the preview before commit, so a
  // project can have sprints of DIFFERENT lengths. The backend re-partitions the
  // fixed week sequence and RE-ASSIGNS each task to a single sprint (full effort)
  // via POST /roadmap/rebalance-sprints — the SAME parser.rebalance_sprints that
  // /commit relies on, so preview and commit can't drift. Commit sends
  // `roadmapParsedData` verbatim, so the recomputed sprints persist.
  const setSprintDuration = useCallback(
    async (sprintNumber: number, newWeeks: number) => {
      const prev = roadmapParsedDataRef.current;
      if (!prev?.sprints || prev.sprints.length === 0) return;
      // The fixed, ordered set of project work-weeks (Mondays) the parser used.
      const weeks = Array.from(new Set(prev.sprints.flatMap((s) => s.week_dates ?? []))).sort();
      if (weeks.length === 0) return; // no week data — can't re-partition
      const clamped = Math.max(1, newWeeks);
      const durations = prev.sprints.map((s) =>
        s.number === sprintNumber ? clamped : s.duration_weeks,
      );
      // Optimistically reflect the new length so rapid consecutive edits compose
      // off each other; the server response replaces this with the authoritative
      // re-partition below.
      setRoadmapParsedData((cur) =>
        cur?.sprints
          ? {
              ...cur,
              sprints: cur.sprints.map((s) =>
                s.number === sprintNumber ? { ...s, duration_weeks: clamped } : s,
              ),
            }
          : cur,
      );
      const reqId = (rebalanceReqId.current += 1);
      try {
        const res = await apiFetch<RebalanceSprintsResponse>('/api/roadmap/rebalance-sprints', {
          method: 'POST',
          body: JSON.stringify({
            weeks,
            durations,
            tickets: prev.tickets ?? [],
            default_weeks: sprintWeeks,
          }),
        });
        if (reqId !== rebalanceReqId.current) return; // a newer edit superseded this
        setRoadmapParsedData((cur) =>
          cur ? { ...cur, sprints: res.sprints as RoadmapSprint[] } : cur,
        );
      } catch (err) {
        toastErrorHandler('update sprint length')(err);
      }
    },
    [sprintWeeks],
  );
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
      let data: PrdAnalyzeResponse;
      if (prdFile) {
        // File upload — apiFetch skips Content-Type for FormData
        const formData = new FormData();
        formData.append('file', prdFile);
        formData.append('project_id', String(project.id));
        formData.append('additional_context', additionalContext);
        data = await apiFetch<PrdAnalyzeResponse>('/api/prd/analyze-file', {
          method: 'POST',
          body: formData,
        });
      } else {
        data = await apiFetch<PrdAnalyzeResponse>('/api/prd/analyze-text', {
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
    } catch (err) {
      toastErrorHandler('analyze PRD')(err);
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

      const data = await apiFetch<RoadmapParseResponse>('/api/roadmap/parse-file', {
        method: 'POST',
        body: formData,
      });
      setRoadmapSummary(data.summary);
      // The parser now assigns each spanning task to a single sprint with its
      // full effort (parser.calculate_sprints), so the preview already matches
      // the PM tab after commit — no client-side rebalance needed.
      setRoadmapParsedData(data.parsed_data);
      setAiStep('architectures'); // Reuse architectures step for summary display
      toast.success('Roadmap parsed successfully!');
    } catch (err) {
      toastErrorHandler('parse roadmap')(err);
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
      const data = await apiFetch<GenerateTicketsPreviewResponse>(
        `/api/prd/projects/${project.id}/generate-tickets-preview`,
        {
          method: 'POST',
          body: JSON.stringify({ architecture_id: selectedArchitectureId }),
        },
      );
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
      const data = await apiFetch<CommitArchitectureResponse>(
        `/api/prd/projects/${project.id}/commit-architecture`,
        {
          method: 'POST',
          body: JSON.stringify({
            architecture_id: selectedArchitectureId,
            start_date: startDate || null,
            end_date: endDate || null,
          }),
        },
      );

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
    } catch (err) {
      toastErrorHandler('commit architecture')(err);
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
      const data = await apiFetch<RoadmapCommitResponse>('/api/roadmap/commit', {
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
    } catch (err) {
      toastErrorHandler('commit roadmap')(err);
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
    setSprintDuration,
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
