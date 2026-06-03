import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FileText,
  Target,
  Wrench,
  CheckCircle2,
  Zap,
  DollarSign,
  AlertTriangle,
  Calendar,
  Download,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiError } from '@/lib/api';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';
import GenerateRoadmapModal from '../modals/GenerateRoadmapModal';

interface RoadmapTemplateMeta {
  id: number;
  project_id: number;
  start_date: string;
  end_date: string;
  sprint_weeks: number;
  milestone_count: number;
  epic_count: number;
  task_count: number;
  created_at: string;
  updated_at: string;
}

interface PRDAnalysis {
  id: number;
  summary: string;
  key_features: string[];
  technical_requirements: string[];
  cost_analysis?: {
    infrastructure?: {
      monthly: string;
      annual: string;
      breakdown: { item: string; cost: string }[];
    };
    development?: { total: string; breakdown: { item: string; cost: string }[] };
    total_estimated?: string;
  };
  recommended_tools?: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
    devops?: string[];
    [key: string]: string[] | undefined;
  };
  risks: { risk: string; impact: string; mitigation: string }[];
  timeline: { phase: string; duration: string; tasks: string[] }[];
}

interface PRDAnalysisSectionProps {
  prdAnalysis: PRDAnalysis;
  projectId: number;
  projectName: string;
}

async function downloadSavedRoadmap(projectId: number): Promise<void> {
  const token = localStorage.getItem('token');
  const res = await fetch(
    `${API_BASE_URL}/api/prd/projects/${projectId}/roadmap-template/download`,
    {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = await res.json();
      detail = json.detail ?? detail;
    } catch {
      // Non-JSON error body — fall back to statusText.
    }
    throw new ApiError(res.status, detail);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? 'roadmap_template.xlsx';
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const PRDAnalysisSection = ({ prdAnalysis, projectId, projectName }: PRDAnalysisSectionProps) => {
  const [roadmapModalOpen, setRoadmapModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Roadmap (re)generation is gated on `project.ai.write`. Reading the saved
  // analysis stays available to anyone with overview/PRD read access.
  const { can } = useAuth();
  const canWriteAI = can('project.ai.write');

  const templateQuery = useQuery<RoadmapTemplateMeta | null>({
    queryKey: ['roadmapTemplate', projectId],
    queryFn: async () => {
      try {
        return await apiFetch<RoadmapTemplateMeta>(
          `/api/prd/projects/${projectId}/roadmap-template`,
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });

  const template = templateQuery.data;
  const templateLoading = templateQuery.isLoading;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadSavedRoadmap(projectId);
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : 'Failed to download roadmap template';
      toast.error(detail);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-white">Project Overview</h3>
          <p className="text-xs text-[#737373]">Generated from PRD</p>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-3">
        <h4 className="text-sm font-medium text-[#a3a3a3] mb-1.5">Summary</h4>
        <p className="text-sm text-[#f5f5f5] leading-relaxed">{prdAnalysis.summary}</p>
      </div>

      {/* Key Features */}
      {prdAnalysis.key_features && prdAnalysis.key_features.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-[#a3a3a3] mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-[#E0B954]" />
            Key Features
          </h4>
          <div className="flex flex-wrap gap-2">
            {prdAnalysis.key_features.map((feature, idx) => (
              <Badge
                key={idx}
                className="bg-[#E0B954]/10 text-[#E0B954] border border-[#E0B954]/20 hover:bg-[#E0B954]/20"
              >
                {feature}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Technical Requirements */}
      {prdAnalysis.technical_requirements && prdAnalysis.technical_requirements.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-[#a3a3a3] mb-3 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-[#E0B954]" />
            Technical Requirements
          </h4>
          <ul className="space-y-2">
            {prdAnalysis.technical_requirements.map((req, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-[#f5f5f5]">
                <CheckCircle2 className="w-4 h-4 text-[#E0B954] mt-0.5 flex-shrink-0" />
                {req}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended Tools */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-[#a3a3a3] mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#F59E0B]" />
          Recommended Tools
        </h4>
        {prdAnalysis.recommended_tools && Object.keys(prdAnalysis.recommended_tools).length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(prdAnalysis.recommended_tools).map(
              ([category, tools]) =>
                tools &&
                Array.isArray(tools) &&
                tools.length > 0 && (
                  <div key={category} className="bg-[rgba(255,255,255,0.025)] rounded-xl p-3">
                    <p className="text-xs font-medium text-[#737373] capitalize mb-2">{category}</p>
                    <div className="flex flex-wrap gap-1">
                      {tools.slice(0, 3).map((tool, idx) => (
                        <span
                          key={idx}
                          className="text-xs bg-[rgba(224,185,84,0.1)] text-[#E0B954] px-2 py-0.5 rounded"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                ),
            )}
          </div>
        ) : (
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 text-center">
            <p className="text-sm text-[#737373]">
              No recommended tools data available. Re-analyze PRD to generate.
            </p>
          </div>
        )}
      </div>

      {/* Cost Analysis - Infrastructure Only */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-[#a3a3a3] mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[#E0B954]" />
          Infrastructure Cost Analysis
        </h4>
        {prdAnalysis.cost_analysis?.infrastructure ? (
          <div className="bg-[rgba(224,185,84,0.05)] border border-[rgba(224,185,84,0.2)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-[#737373]">Monthly Cost</p>
                <p className="text-2xl font-bold text-[#E0B954]">
                  {prdAnalysis.cost_analysis.infrastructure.monthly || 'N/A'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[#737373]">Annual Cost</p>
                <p className="text-lg font-bold text-[#E0B954]">
                  {prdAnalysis.cost_analysis.infrastructure.annual || 'N/A'}
                </p>
              </div>
            </div>
            {prdAnalysis.cost_analysis.infrastructure.breakdown &&
              prdAnalysis.cost_analysis.infrastructure.breakdown.length > 0 && (
                <div className="border-t border-[rgba(224,185,84,0.2)] pt-3">
                  <p className="text-xs font-medium text-[#737373] mb-2">Detailed Breakdown</p>
                  <div className="space-y-2">
                    {prdAnalysis.cost_analysis.infrastructure.breakdown.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between py-1.5 px-2 bg-[rgba(255,255,255,0.025)] rounded-lg"
                      >
                        <span className="text-sm text-[#f5f5f5]">{item.item}</span>
                        <span className="text-sm font-medium text-[#E0B954]">{item.cost}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        ) : (
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 text-center">
            <p className="text-sm text-[#737373]">
              No infrastructure cost data available. Re-analyze PRD to generate.
            </p>
          </div>
        )}
      </div>

      {/* Risks */}
      {prdAnalysis.risks && prdAnalysis.risks.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-[#a3a3a3] mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
            Initial Risk Assessment
          </h4>
          <div className="space-y-3">
            {prdAnalysis.risks.map((risk, idx) => (
              <div
                key={idx}
                className="bg-[rgba(245,158,11,0.05)] border border-[rgba(245,158,11,0.2)] rounded-xl p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-medium text-[#F59E0B]">{risk.risk}</p>
                  <Badge className="bg-[#F59E0B]/10 text-[#F59E0B] border-0 text-xs">
                    {risk.impact}
                  </Badge>
                </div>
                <p className="text-xs text-[#a3a3a3]">
                  <span className="text-[#737373]">Mitigation:</span> {risk.mitigation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div>
        <h4 className="text-sm font-medium text-[#a3a3a3] mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#E0B954]" />
          Project Timeline
        </h4>
        {prdAnalysis.timeline && prdAnalysis.timeline.length > 0 ? (
          <div className="space-y-3">
            {prdAnalysis.timeline.map((phase, idx) => (
              <div key={idx} className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[#E0B954]/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-[#E0B954]">{idx + 1}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-white">{phase.phase}</p>
                    <span className="text-xs text-[#E0B954]">{phase.duration}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {phase.tasks &&
                      phase.tasks.slice(0, 3).map((task, taskIdx) => (
                        <span
                          key={taskIdx}
                          className="text-xs bg-[rgba(255,255,255,0.025)] text-[#a3a3a3] px-2 py-0.5 rounded"
                        >
                          {task}
                        </span>
                      ))}
                    {phase.tasks && phase.tasks.length > 3 && (
                      <span className="text-xs text-[#737373]">+{phase.tasks.length - 3} more</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 text-center">
            <p className="text-sm text-[#737373]">
              No timeline data available. Provide a PRD with timeline details to generate phases.
            </p>
          </div>
        )}
      </div>

      {/* Roadmap template — saved card OR generate button. Suppressed
          entirely when there's no template AND the user lacks AI write,
          otherwise the wrapper would render as an orphan top border. */}
      {(templateLoading || template || canWriteAI) && (
        <div className="mt-5 pt-4 border-t border-[rgba(255,255,255,0.05)]">
          {templateLoading ? (
            <div className="flex items-center gap-2 text-xs text-[#737373]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading roadmap template…
            </div>
          ) : template ? (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white">Roadmap template</p>
                <p className="text-xs text-[#737373]">
                  {template.start_date} → {template.end_date} · {template.milestone_count} milestone
                  {template.milestone_count === 1 ? '' : 's'}, {template.epic_count} epic
                  {template.epic_count === 1 ? '' : 's'}, {template.task_count} task
                  {template.task_count === 1 ? '' : 's'}
                </p>
                <p className="text-[11px] text-[#525252] mt-0.5">
                  Last generated{' '}
                  {new Date(template.updated_at).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canWriteAI && (
                  <Button
                    onClick={() => setRoadmapModalOpen(true)}
                    className="bg-[#E0B954] hover:bg-[#C79E3B] text-black"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Regenerate
                  </Button>
                )}
                <Button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="bg-[#E0B954] hover:bg-[#C79E3B] text-black"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Downloading…
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            canWriteAI && (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Roadmap template</p>
                  <p className="text-xs text-[#737373]">
                    Download an editable Excel roadmap based on this PRD, then re-upload via the
                    roadmap importer.
                  </p>
                </div>
                <Button
                  onClick={() => setRoadmapModalOpen(true)}
                  className="bg-[#E0B954] hover:bg-[#C79E3B] text-black shrink-0"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Generate roadmap
                </Button>
              </div>
            )
          )}
        </div>
      )}

      <GenerateRoadmapModal
        open={roadmapModalOpen}
        onOpenChange={setRoadmapModalOpen}
        projectId={projectId}
        projectName={projectName}
        existingTemplate={
          template
            ? {
                start_date: template.start_date,
                end_date: template.end_date,
                sprint_weeks: template.sprint_weeks,
              }
            : null
        }
      />
    </div>
  );
};

export default PRDAnalysisSection;
