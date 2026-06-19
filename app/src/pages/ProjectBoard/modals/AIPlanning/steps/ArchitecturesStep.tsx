import { Target } from 'lucide-react';
import type { ProjectArchitectureResponse, PrdAnalysisResponse } from '@/client';
import ArchitectureCard from '@/components/ArchitectureCard';
import RoadmapSummaryPanel from '../components/RoadmapSummaryPanel';
import type { RoadmapParsedData, RoadmapSummary } from '../useAIPlanning';

interface ArchitecturesStepProps {
  analysis: PrdAnalysisResponse | null;
  roadmapSummary: RoadmapSummary | null;
  roadmapParsedData: RoadmapParsedData | null;
  architectures: ProjectArchitectureResponse[];
  selectedArchitectureId: number | null;
  onSelectArchitecture: (archId: number) => void;
  onEditArchitecture: (arch: ProjectArchitectureResponse) => void;
}

const ArchitecturesStep = ({
  analysis,
  roadmapSummary,
  roadmapParsedData,
  architectures,
  selectedArchitectureId,
  onSelectArchitecture,
  onEditArchitecture,
}: ArchitecturesStepProps) => {
  return (
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
        <RoadmapSummaryPanel
          roadmapSummary={roadmapSummary}
          roadmapParsedData={roadmapParsedData}
        />
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
                onSelect={() => onSelectArchitecture(arch.id)}
                onViewFullScreen={() => onEditArchitecture(arch)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchitecturesStep;
