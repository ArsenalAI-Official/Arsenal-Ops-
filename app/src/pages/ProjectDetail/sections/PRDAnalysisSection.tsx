import {
  FileText,
  Target,
  Wrench,
  CheckCircle2,
  Zap,
  DollarSign,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
}

const PRDAnalysisSection = ({ prdAnalysis }: PRDAnalysisSectionProps) => {
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
    </div>
  );
};

export default PRDAnalysisSection;
