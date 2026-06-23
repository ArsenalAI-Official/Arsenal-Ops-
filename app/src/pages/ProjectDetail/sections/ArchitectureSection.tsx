import {
  Layers,
  Pencil,
  Sparkles,
  TrendingUp,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Eye,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import type { ProjectArchitectureResponse } from '@/client';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// MermaidRenderer is heavy; lazy-load only when this section renders.
// ArchitectureEditor (the modal) stays lazy at the parent, since edit state lives there.
const MermaidRenderer = lazy(() => import('@/components/MermaidRenderer'));

interface ArchitectureSectionProps {
  architecture: ProjectArchitectureResponse;
  onEdit: (arch: ProjectArchitectureResponse) => void;
  /** Optional — when undefined the "AI Generate" button (which navigates to
   *  the board) is hidden. Parent passes undefined when the user lacks the
   *  `project.board` cap. */
  onOpenBoard?: () => void;
  /** Gates the inline Edit button. Mirrors `isCurrentUserAdmin()` from
   *  ProjectDetail — true when the user is a tool admin, holds
   *  `project.overview_write`, or is a per-project admin on this project.
   *  Backend independently enforces the same predicate via
   *  `require_project_admin` on PUT /api/prd/architectures/{id}. */
  isCurrentUserAdmin: boolean;
}

const ArchitectureSection = ({
  architecture: arch,
  onEdit,
  onOpenBoard,
  isCurrentUserAdmin,
}: ArchitectureSectionProps) => {
  // Gate the diagram render — Mermaid is ~550KB gzipped and we only want to
  // load it when the user explicitly asks to see the diagram.
  const [showDiagram, setShowDiagram] = useState(false);
  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-[#E0B954]" />
          <div>
            <h3 className="font-semibold text-white">Selected Architecture</h3>
            <p className="text-xs text-[#737373]">{arch.name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isCurrentUserAdmin && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(arch)}
              className="text-[#737373] hover:text-white"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
          {onOpenBoard && (
            <Button
              size="sm"
              onClick={onOpenBoard}
              className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              AI Generate
            </Button>
          )}
        </div>
      </div>
      <div className="p-4 bg-[#080808] min-h-[400px]">
        {showDiagram ? (
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-8">
                <Spinner size="md" tone="gold" />
              </div>
            }
          >
            <MermaidRenderer code={arch.mermaid_code} className="w-full h-full min-h-[350px]" />
          </Suspense>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[350px] gap-3">
            <Layers className="w-10 h-10 text-[#737373]" />
            <p className="text-sm text-[#737373]">Architecture diagram is not loaded</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDiagram(true)}
              className="text-[#E0B954] hover:text-[#E0B954] hover:bg-[rgba(224,185,84,0.08)]"
            >
              <Eye className="w-4 h-4 mr-2" />
              Show diagram
            </Button>
          </div>
        )}
      </div>

      {/* Architecture Details */}
      <div className="p-4 border-t border-[rgba(255,255,255,0.05)] space-y-4">
        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[rgba(255,255,255,0.02)] rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-[#F59E0B]" />
              <span className="text-xs text-[#737373]">Complexity</span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-[#F59E0B] capitalize">{arch.complexity}</p>
              <div className="flex gap-0.5">
                {[1, 2, 3].map((level) => (
                  <div
                    key={level}
                    className={`w-2 h-2 rounded-full ${
                      arch.complexity === 'high'
                        ? 'bg-[#F59E0B]'
                        : arch.complexity === 'medium' && level <= 2
                          ? 'bg-[#F59E0B]'
                          : arch.complexity === 'low' && level === 1
                            ? 'bg-[#F59E0B]'
                            : 'bg-[#334155]'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="bg-[rgba(255,255,255,0.02)] rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-[#E0B954]" />
              <span className="text-xs text-[#737373]">Timeline</span>
            </div>
            <p className="text-lg font-bold text-[#E0B954]">{arch.time_to_implement}</p>
          </div>
          <div className="bg-[rgba(255,255,255,0.02)] rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-[#E0B954]" />
              <span className="text-xs text-[#737373]">Est. Cost</span>
            </div>
            <p className="text-lg font-bold text-[#E0B954]">{arch.estimated_cost}</p>
          </div>
        </div>

        {/* Architecture Cost Analysis */}
        {arch.cost_analysis && (
          <div className="bg-[rgba(224,185,84,0.05)] border border-[rgba(224,185,84,0.2)] rounded-xl p-4">
            <h4 className="text-sm font-medium text-[#E0B954] mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Architecture Cost Breakdown
            </h4>
            {arch.cost_analysis.infrastructure?.breakdown && (
              <div className="mb-3">
                <p className="text-xs text-[#737373] mb-2">Infrastructure Components</p>
                <div className="space-y-1.5">
                  {arch.cost_analysis.infrastructure.breakdown.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-1 px-2 bg-[rgba(255,255,255,0.025)] rounded"
                    >
                      <span className="text-xs text-[#f5f5f5]">{item.item}</span>
                      <span className="text-xs font-medium text-[#E0B954]">{item.cost}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {arch.tools_recommended && (
              <div>
                <p className="text-xs text-[#737373] mb-2">Tools & Services Required</p>
                <div className="space-y-1.5">
                  {Object.entries(arch.tools_recommended).map(
                    ([category, tools]) =>
                      tools &&
                      Array.isArray(tools) &&
                      tools.length > 0 && (
                        <div
                          key={category}
                          className="flex items-center justify-between py-1 px-2 bg-[rgba(255,255,255,0.025)] rounded"
                        >
                          <span className="text-xs text-[#f5f5f5] capitalize">{category}</span>
                          <span className="text-xs text-[#a3a3a3]">
                            {tools.slice(0, 3).join(', ')}
                            {tools.length > 3 ? '...' : ''}
                          </span>
                        </div>
                      ),
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pros & Cons */}
        <div className="grid grid-cols-2 gap-4">
          {arch.pros && arch.pros.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[#E0B954] mb-2 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Advantages
              </h4>
              <ul className="space-y-1">
                {arch.pros.map((pro, idx) => (
                  <li key={idx} className="text-xs text-[#a3a3a3] flex items-start gap-2">
                    <span className="text-[#E0B954] mt-1">•</span>
                    {pro}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {arch.cons && arch.cons.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[#EF4444] mb-2 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Considerations
              </h4>
              <ul className="space-y-1">
                {arch.cons.map((con, idx) => (
                  <li key={idx} className="text-xs text-[#a3a3a3] flex items-start gap-2">
                    <span className="text-[#EF4444] mt-1">•</span>
                    {con}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Tools Recommended */}
        {arch.tools_recommended && Object.keys(arch.tools_recommended).length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-[#a3a3a3] mb-2 flex items-center gap-1">
              <Wrench className="w-3.5 h-3.5 text-[#F59E0B]" />
              Recommended Tools
            </h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(arch.tools_recommended).map(
                ([category, tools]) =>
                  tools &&
                  Array.isArray(tools) &&
                  tools.map((tool, idx) => (
                    <span
                      key={`${category}-${idx}`}
                      className="text-xs bg-[rgba(224,185,84,0.1)] text-[#E0B954] px-2 py-1 rounded-lg"
                    >
                      {tool}
                    </span>
                  )),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArchitectureSection;
