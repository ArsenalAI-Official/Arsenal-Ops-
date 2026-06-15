import { type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Plus,
  CheckCircle2,
  Search,
  Layers,
  BarChart3,
  Clock,
  Target,
  Repeat2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Sprint } from '@/types/workItems';

type ViewMode = 'board' | 'list' | 'epic';
type SelectedSprintId = number | 'all' | 'unassigned';

interface ViewTab {
  mode: ViewMode;
  icon: LucideIcon;
  label: string;
  tabId: string;
}

export interface BoardToolbarProps {
  // ── Stats ──────────────────────────────────────────────────────────────────
  itemCount: number;
  totalPoints: number;
  completedCount: number;
  remainingHours: number;
  // ── Sprint selector ─────────────────────────────────────────────────────────
  sprints: Sprint[];
  selectedSprintId: SelectedSprintId;
  setSelectedSprintId: Dispatch<SetStateAction<SelectedSprintId>>;
  showSprintMenu: boolean;
  setShowSprintMenu: Dispatch<SetStateAction<boolean>>;
  sprintMenuRef: RefObject<HTMLDivElement | null>;
  // ── Filter menu (rendered between sprint selector and search) ────────────────
  filterMenu: ReactNode;
  // ── Search (from useBoardFilters) ────────────────────────────────────────────
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  // ── View tabs ────────────────────────────────────────────────────────────────
  viewTabs: ViewTab[];
  viewMode: ViewMode;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  onViewTabKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  // ── Add menu ─────────────────────────────────────────────────────────────────
  canWriteTracker: boolean;
  showAddMenu: boolean;
  setShowAddMenu: Dispatch<SetStateAction<boolean>>;
  onAddItem: (type: string) => void;
  onAddSprint: () => void;
}

/**
 * The stats + sprint-selector + filter + search + view-tab + add-menu bar —
 * extracted verbatim from ProjectBoard's stats/filters `<div>`. Pure props-down:
 * the filter dropdown is injected as the `filterMenu` slot (its state stays in
 * useBoardFilters). The search input + view tabs are covered by the
 * characterization tests — placeholder/role semantics are kept identical.
 */
const BoardToolbar = ({
  itemCount,
  totalPoints,
  completedCount,
  remainingHours,
  sprints,
  selectedSprintId,
  setSelectedSprintId,
  showSprintMenu,
  setShowSprintMenu,
  sprintMenuRef,
  filterMenu,
  searchQuery,
  setSearchQuery,
  viewTabs,
  viewMode,
  setViewMode,
  onViewTabKeyDown,
  canWriteTracker,
  showAddMenu,
  setShowAddMenu,
  onAddItem,
  onAddSprint,
}: BoardToolbarProps) => {
  return (
    <div className="px-6 py-2.5 flex items-center justify-between gap-4 border-t border-[rgba(255,255,255,0.03)]">
      {/* Left: Stats + Sprint + Filter */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {[
          { label: 'Items', value: itemCount, icon: Layers },
          { label: 'Points', value: totalPoints, icon: BarChart3 },
          { label: 'Done', value: completedCount, icon: CheckCircle2 },
          { label: 'Hours Left', value: `${remainingHours}h`, icon: Clock },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <s.icon className="w-3.5 h-3.5 text-[#737373]" />
            <span className="text-[#737373]">{s.label}</span>
            <span className="text-white font-semibold">{s.value}</span>
          </div>
        ))}

        <div className="w-px h-4 bg-[rgba(255,255,255,0.07)]" />

        {/* Sprint Selector */}
        <div className="flex items-center gap-1.5 relative" ref={sprintMenuRef}>
          <span className="text-xs text-[#737373]">Sprint</span>
          <button
            onClick={() => setShowSprintMenu((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 h-8 text-xs border rounded-lg font-medium transition-colors ${
              selectedSprintId !== 'all'
                ? 'border-[#E0B954]/50 text-[#E0B954] bg-[#E0B954]/5'
                : 'border-[rgba(255,255,255,0.1)] text-[#737373] bg-transparent hover:border-[rgba(255,255,255,0.2)] hover:text-white'
            }`}
          >
            {selectedSprintId === 'all'
              ? 'All Sprints'
              : selectedSprintId === 'unassigned'
                ? 'Backlog'
                : (sprints.find((s) => s.id === selectedSprintId)?.name ?? 'Sprint')}
            <svg
              className="w-3 h-3 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showSprintMenu && (
            <div className="absolute top-full mt-2 left-9 bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-xl shadow-2xl shadow-black/50 z-50 min-w-[160px]">
              <div className="p-1.5">
                {(
                  [
                    { id: 'all', label: 'All Sprints' },
                    { id: 'unassigned', label: 'Backlog' },
                    ...sprints.map((s) => ({ id: s.id, label: s.name })),
                  ] as { id: string | number; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setSelectedSprintId(opt.id as SelectedSprintId);
                      setShowSprintMenu(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                      selectedSprintId === opt.id
                        ? 'bg-[#E0B954]/10 text-[#E0B954]'
                        : 'text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.05)]'
                    }`}
                  >
                    {selectedSprintId === opt.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-[#E0B954]" />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Filter */}
        {filterMenu}
      </div>

      {/* Right: Search + view toggle + new sprint */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
          <Input
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 w-48 text-xs bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.05)] text-[#F4F6FF] rounded-lg focus:border-[#E0B954]/50 placeholder:text-[#334155]"
          />
        </div>

        {/* View Tab Bar */}
        <div
          role="tablist"
          aria-label="Project view"
          className="flex items-center gap-0"
          onKeyDown={onViewTabKeyDown}
        >
          {viewTabs.map(({ mode, icon: Icon, label, tabId }) => (
            <button
              key={mode}
              role="tab"
              id={tabId}
              aria-selected={viewMode === mode}
              aria-controls={`tabpanel-${mode}`}
              tabIndex={viewMode === mode ? 0 : -1}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                viewMode === mode
                  ? 'border-[#E0B954] text-[#E0B954]'
                  : 'border-transparent text-[#737373] hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {/* "+" menu — gated on `project.tracker_write`. */}
        {canWriteTracker && (
          <div className="relative">
            <Button
              onClick={() => setShowAddMenu((prev) => !prev)}
              size="sm"
              className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] rounded-lg font-medium h-8 px-3 text-xs transition-opacity flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" />
              Add
            </Button>
            {showAddMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowAddMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] rounded-lg shadow-xl overflow-hidden min-w-[140px]">
                  <button
                    onClick={() => onAddItem('user_story')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#E0B954]" />
                    New Item
                  </button>
                  <button
                    onClick={() => onAddItem('epic')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                  >
                    <Target className="w-3.5 h-3.5 text-[#A78BFA]" />
                    New Epic
                  </button>
                  <button
                    onClick={onAddSprint}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                  >
                    <Repeat2 className="w-3.5 h-3.5 text-[#E0B954]" />
                    New Sprint
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BoardToolbar;
