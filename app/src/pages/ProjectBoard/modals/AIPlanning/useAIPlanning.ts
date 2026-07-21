import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useCallback, Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { ProjectArchitectureResponse, PrdAnalysisResponse } from '@/client';
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

const MS_PER_DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Re-partition the project's fixed, ordered work-weeks into sprints of the
 * given per-sprint week counts, then re-assign each task to the sprint whose
 * weeks it has hours in. Client mirror of the backend `calculate_sprints`: when
 * a sprint's length changes the week boundaries move and the tasks + hours
 * follow — a week pushed into another sprint takes its tasks with it. A sprint
 * never spans a calendar gap (a >7-day jump between weeks forces a boundary).
 */
function rebalanceSprints(
  weeks: string[],
  durations: number[],
  tickets: RoadmapTicket[],
  defaultWeeks: number,
): RoadmapSprint[] {
  if (weeks.length === 0) return [];
  const chunks: string[][] = [];
  let i = 0;
  let d = 0;
  while (i < weeks.length) {
    const target = Math.max(1, durations[d] ?? defaultWeeks);
    const chunk = [weeks[i]!];
    i += 1;
    while (chunk.length < target && i < weeks.length) {
      // Contiguous only — a calendar gap closes the sprint early.
      if (Date.parse(weeks[i]!) - Date.parse(weeks[i - 1]!) !== 7 * MS_PER_DAY) break;
      chunk.push(weeks[i]!);
      i += 1;
    }
    chunks.push(chunk);
    d += 1;
  }
  // Assign each task to a SINGLE sprint — the LAST one its work spans — and
  // count its FULL estimate (effort_hrs) there. This mirrors commit, which
  // gives a work item one sprint_id + one estimated_hours (last-writer-wins for
  // a task spanning sprints), so the preview's per-sprint hours + task counts
  // match the PM tab after creation. A spanning task's hours belong entirely to
  // the sprint it's committed to — they are NOT split across the weeks it touches.
  const taskNamesPerSprint: string[][] = chunks.map(() => []);
  const hoursPerSprint: number[] = chunks.map(() => 0);
  for (const t of tickets) {
    let assigned = -1;
    for (let c = 0; c < chunks.length; c += 1) {
      const hoursInChunk = chunks[c]!.reduce((sum, w) => sum + (t.week_hours?.[w] ?? 0), 0);
      if (hoursInChunk > 0) assigned = c; // keep the last chunk with work
    }
    if (assigned >= 0) {
      taskNamesPerSprint[assigned]!.push(t.name);
      hoursPerSprint[assigned]! += Math.trunc(t.effort_hrs ?? 0);
    }
  }
  return chunks.map((wk, idx) => {
    const uniqueTasks = Array.from(new Set(taskNamesPerSprint[idx]!));
    return {
      number: idx + 1,
      start_week: wk[0]!,
      end_week: isoDay(Date.parse(wk[wk.length - 1]!) + 4 * MS_PER_DAY),
      duration_weeks: wk.length,
      week_dates: wk,
      tasks: uniqueTasks,
      task_count: uniqueTasks.length,
      total_hours: hoursPerSprint[idx]!,
    };
  });
}

/**
 * Normalize a freshly-parsed roadmap so its sprint hours/task counts use the
 * single-sprint-per-task rule above (matching commit + the PM tab). The parser
 * spreads a spanning task's hours across the weeks it touches, which over-counts
 * every sprint the task passes through; re-running the partition fixes that.
 */
function withRebalancedSprints(parsed: RoadmapParsedData, defaultWeeks: number): RoadmapParsedData {
  const sprints = parsed.sprints ?? [];
  if (sprints.length === 0) return parsed;
  const weeks = Array.from(new Set(sprints.flatMap((s) => s.week_dates ?? []))).sort();
  if (weeks.length === 0) return parsed;
  const durations = sprints.map((s) => s.duration_weeks);
  return {
    ...parsed,
    sprints: rebalanceSprints(weeks, durations, parsed.tickets ?? [], defaultWeeks),
  };
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

  // Change one sprint's length (in weeks) in the preview before commit, so a
  // project can have sprints of DIFFERENT lengths. This re-partitions the fixed
  // week sequence and RE-ASSIGNS tasks to the sprint their work-weeks now fall
  // in — a week pushed into another sprint takes its tasks (and hours) with it.
  // Commit sends `roadmapParsedData` verbatim, so the recomputed sprints persist.
  const setSprintDuration = useCallback(
    (sprintNumber: number, newWeeks: number) => {
      setRoadmapParsedData((prev) => {
        if (!prev?.sprints || prev.sprints.length === 0) return prev;
        // The fixed, ordered set of project work-weeks (Mondays) the parser used.
        const weeks = Array.from(new Set(prev.sprints.flatMap((s) => s.week_dates ?? []))).sort();
        if (weeks.length === 0) return prev; // no week data — can't re-partition
        const durations = prev.sprints.map((s) =>
          s.number === sprintNumber ? Math.max(1, newWeeks) : s.duration_weeks,
        );
        return {
          ...prev,
          sprints: rebalanceSprints(weeks, durations, prev.tickets ?? [], sprintWeeks),
        };
      });
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
      // Normalize sprint hours/task counts to the single-sprint-per-task rule so
      // the preview matches the PM tab after creation (the parser spreads a
      // spanning task's hours across sprints; commit assigns it to just one).
      setRoadmapParsedData(withRebalancedSprints(data.parsed_data, sprintWeeks));
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
