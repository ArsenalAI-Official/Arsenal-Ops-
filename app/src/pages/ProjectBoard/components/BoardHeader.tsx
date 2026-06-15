import { ArrowLeft, Sparkles, LayoutGrid, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Project } from '../hooks/useBoardData';

export interface BoardHeaderProps {
  /** Current project — supplies the key-prefix badge + name. */
  project: Project;
  /** Whether the user holds `project.tracker_write` (gates the Reviewer entry). */
  canWriteTracker: boolean;
  /** Derived `showReviewer && canWriteTracker` — drives the Reviewer button active style. */
  effectiveShowReviewer: boolean;
  /** Whether the user holds `project.ai.write` (gates the AI Generate button). */
  canWriteAI: boolean;
  /** Reflects the in-flight AI generation state (spinner + disabled). */
  isGenerating: boolean;
  /** Toggle the slide-in Reviewer panel. */
  onToggleReviewer: () => void;
  /** Open the AI Planning modal. */
  onOpenAI: () => void;
  /** Navigate to the dashboard (back button). */
  onBackToDashboard: () => void;
  /** Navigate to the project overview. */
  onBackToOverview: () => void;
}

/**
 * Top header bar — extracted verbatim from ProjectBoard's `<header>` top row
 * (back button, project name/badge, Reviewer / AI Generate / Project Overview
 * actions). Pure props-down: gating flags + handlers are injected by the
 * orchestrator.
 */
const BoardHeader = ({
  project,
  canWriteTracker,
  effectiveShowReviewer,
  canWriteAI,
  isGenerating,
  onToggleReviewer,
  onOpenAI,
  onBackToDashboard,
  onBackToOverview,
}: BoardHeaderProps) => {
  return (
    <div className="px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBackToDashboard}
          className="text-[#737373] hover:text-white hover:bg-[rgba(244,246,255,0.05)] rounded-lg gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Button>
        <div className="w-px h-6 bg-[rgba(255,255,255,0.18)]" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#C79E3B] flex items-center justify-center text-sm font-bold text-[#080808] shadow-lg shadow-[#E0B954]/25">
            {project.key_prefix.substring(0, 2)}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">{project.name}</h1>
            <p className="text-xs text-[#737373] font-mono">{project.key_prefix}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Reviewer entry — gated on `project.tracker_write`. The
            review queue's purpose is approving / closing in-review
            tickets, which requires the same write cap as edit/delete.
            Hidden entirely (not disabled) to avoid showing an entry
            that would lead to a dead-end queue. */}
        {canWriteTracker && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleReviewer}
            className={`text-[#737373] hover:text-white hover:bg-[rgba(244,246,255,0.05)] rounded-lg gap-2 h-9 px-3 ${effectiveShowReviewer ? 'bg-[rgba(224,185,84,0.1)] text-[#E0B954]' : ''}`}
            title="Review Mode"
          >
            <Eye className="w-3.5 h-3.5" />
            Reviewer
          </Button>
        )}
        {/* AI Generate — gated on `project.ai.write`. Hidden entirely
            when missing so the modal (which would 403 on submit) can't
            be opened. */}
        {canWriteAI && (
          <Button
            onClick={onOpenAI}
            disabled={isGenerating}
            size="sm"
            className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] rounded-lg font-medium h-9 transition-opacity"
          >
            {isGenerating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-[#080808]/30 border-t-[#080808] rounded-full animate-spin mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-2" />
                AI Generate
              </>
            )}
          </Button>
        )}
        <Button
          onClick={onBackToOverview}
          size="sm"
          className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] rounded-lg font-medium h-9 px-4 transition-opacity"
        >
          <LayoutGrid className="w-4 h-4 mr-2" />
          Project Overview
        </Button>
      </div>
    </div>
  );
};

export default BoardHeader;
