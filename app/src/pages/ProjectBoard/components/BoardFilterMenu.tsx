import { X, Search, ListFilter, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { type Dispatch, type RefObject, type SetStateAction } from 'react';
import { avatarColor } from '@/lib/avatarColor';
import type { Project } from '../hooks/useBoardData';

interface TypeConfigEntry {
  icon: LucideIcon;
  color: string;
  label: string;
  bg: string;
}
interface PriorityColorEntry {
  border: string;
  text: string;
  bg: string;
  hex: string;
}

export interface BoardFilterMenuProps {
  /** Current project — supplies the assignee list. */
  project: Project | null;
  /** Work-item type display config (icon/color/label). */
  typeConfig: Record<string, TypeConfigEntry>;
  /** Priority display config (colors). */
  priorityColors: Record<string, PriorityColorEntry>;
  // ── Filter state + helpers (from useBoardFilters) ───────────────────────────
  filterTypes: string[];
  setFilterTypes: Dispatch<SetStateAction<string[]>>;
  filterPriorities: string[];
  setFilterPriorities: Dispatch<SetStateAction<string[]>>;
  filterAssignees: string[];
  setFilterAssignees: Dispatch<SetStateAction<string[]>>;
  filterTags: string[];
  setFilterTags: Dispatch<SetStateAction<string[]>>;
  assigneeSearchFilter: string;
  setAssigneeSearchFilter: Dispatch<SetStateAction<string>>;
  existingTags: string[];
  toggleArrayFilter: (setter: Dispatch<SetStateAction<string[]>>, value: string) => void;
  clearAllFilters: () => void;
  activeFilterCount: number;
  hasActiveFilters: boolean;
  // ── Menu open/ref state (from useBoardFilters; outside-click effect stays in the hook) ──
  showFilterMenu: boolean;
  setShowFilterMenu: Dispatch<SetStateAction<boolean>>;
  filterMenuRef: RefObject<HTMLDivElement | null>;
}

/**
 * Filter dropdown (type / priority / assignee / tags + clear) — extracted
 * verbatim from ProjectBoard's filter `<div ref={filterMenuRef}>` block. Pure
 * props-down: all filter state + the menu open flag/ref come from
 * `useBoardFilters` (the outside-click effect stays in the hook).
 */
const BoardFilterMenu = ({
  project,
  typeConfig,
  priorityColors,
  filterTypes,
  setFilterTypes,
  filterPriorities,
  setFilterPriorities,
  filterAssignees,
  setFilterAssignees,
  filterTags,
  setFilterTags,
  assigneeSearchFilter,
  setAssigneeSearchFilter,
  existingTags,
  toggleArrayFilter,
  clearAllFilters,
  activeFilterCount,
  hasActiveFilters,
  showFilterMenu,
  setShowFilterMenu,
  filterMenuRef,
}: BoardFilterMenuProps) => {
  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={filterMenuRef}>
        <button
          onClick={() => setShowFilterMenu(!showFilterMenu)}
          className={`flex items-center gap-1.5 px-2.5 h-8 text-xs border rounded-lg font-medium transition-colors ${
            showFilterMenu || hasActiveFilters
              ? 'border-brand/50 text-brand bg-brand/5'
              : 'border-[rgba(255,255,255,0.1)] text-[#737373] bg-transparent hover:border-[rgba(255,255,255,0.2)] hover:text-white'
          }`}
        >
          <ListFilter className="w-3.5 h-3.5" />
          Filter
          {hasActiveFilters && (
            <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded text-[10px] font-bold bg-brand text-[#080808] flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {showFilterMenu && (
          <div className="absolute top-full mt-2 left-0 bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-xl shadow-2xl shadow-black/50 z-50 w-60">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[rgba(255,255,255,0.05)]">
              <p className="text-xs font-semibold text-[#a3a3a3]">Filters</p>
              <button
                onClick={() => setShowFilterMenu(false)}
                className="p-1 rounded hover:bg-[rgba(255,255,255,0.05)] text-[#737373] hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="p-1.5">
              {/* Type */}
              <div className="px-1.5 pt-2 pb-1">
                <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider px-1 mb-1">
                  Type
                </p>
                {Object.entries(typeConfig).map(([key, config]) => {
                  const checked = filterTypes.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleArrayFilter(setFilterTypes, key)}
                      className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-brand border-brand' : 'border-[rgba(255,255,255,0.2)]'}`}
                      >
                        {checked && <Check className="w-2.5 h-2.5 text-[#080808]" />}
                      </div>
                      <config.icon
                        className="w-3.5 h-3.5 flex-shrink-0"
                        style={{ color: config.color }}
                      />
                      <span className="text-xs text-[#d4d4d4]">{config.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="h-px bg-[rgba(255,255,255,0.05)] mx-1.5 my-1" />

              {/* Priority */}
              <div className="px-1.5 pt-1 pb-1">
                <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider px-1 mb-1">
                  Priority
                </p>
                {Object.entries(priorityColors).map(([key, colors]) => {
                  const checked = filterPriorities.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleArrayFilter(setFilterPriorities, key)}
                      className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-brand border-brand' : 'border-[rgba(255,255,255,0.2)]'}`}
                      >
                        {checked && <Check className="w-2.5 h-2.5 text-[#080808]" />}
                      </div>
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.bg}`} />
                      <span className="text-xs text-[#d4d4d4]">
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Assignee */}
              {project?.developers && project.developers.length > 0 && (
                <>
                  <div className="h-px bg-[rgba(255,255,255,0.05)] mx-1.5 my-1" />
                  <div className="px-1.5 pt-1 pb-1">
                    <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider px-1 mb-1">
                      Assignee
                    </p>
                    <div className="relative mb-1.5">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#737373]" />
                      <input
                        type="text"
                        placeholder="Search..."
                        value={assigneeSearchFilter}
                        onChange={(e) => setAssigneeSearchFilter(e.target.value)}
                        className="w-full pl-7 pr-2.5 py-1.5 text-xs bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] text-[#F4F6FF] rounded-lg focus:border-brand/50 placeholder:text-[#555]"
                      />
                    </div>
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {(!assigneeSearchFilter ||
                        'unassigned'.includes(assigneeSearchFilter.toLowerCase())) &&
                        (() => {
                          const checked = filterAssignees.includes('unassigned');
                          return (
                            <button
                              onClick={() => toggleArrayFilter(setFilterAssignees, 'unassigned')}
                              className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-brand border-brand' : 'border-[rgba(255,255,255,0.2)]'}`}
                              >
                                {checked && <Check className="w-2.5 h-2.5 text-[#080808]" />}
                              </div>
                              <div className="w-5 h-5 rounded-full bg-[rgba(255,255,255,0.08)] flex-shrink-0" />
                              <span className="text-xs text-[#d4d4d4]">Unassigned</span>
                            </button>
                          );
                        })()}
                      {project.developers
                        .filter(
                          (dev) =>
                            dev.name.toLowerCase().includes(assigneeSearchFilter.toLowerCase()) ||
                            dev.email.toLowerCase().includes(assigneeSearchFilter.toLowerCase()),
                        )
                        .map((dev) => {
                          const checked = filterAssignees.includes(String(dev.id));
                          const c = avatarColor(dev.id);
                          return (
                            <button
                              key={dev.id}
                              onClick={() => toggleArrayFilter(setFilterAssignees, String(dev.id))}
                              className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-brand border-brand' : 'border-[rgba(255,255,255,0.2)]'}`}
                              >
                                {checked && <Check className="w-2.5 h-2.5 text-[#080808]" />}
                              </div>
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
                                style={{
                                  backgroundColor: c.bg,
                                  color: c.fg,
                                  border: `1px solid ${c.ring}`,
                                }}
                              >
                                {dev.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs text-[#d4d4d4] truncate">{dev.name}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </>
              )}

              {/* Tags */}
              {existingTags.length > 0 && (
                <>
                  <div className="h-px bg-[rgba(255,255,255,0.05)] mx-1.5 my-1" />
                  <div className="px-1.5 pt-1 pb-1">
                    <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wider px-1 mb-1">
                      Tags
                    </p>
                    <div className="space-y-0.5 max-h-40 overflow-y-auto">
                      {existingTags.map((tag) => {
                        const checked = filterTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() => toggleArrayFilter(setFilterTags, tag)}
                            className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                          >
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-brand border-brand' : 'border-[rgba(255,255,255,0.2)]'}`}
                            >
                              {checked && <Check className="w-2.5 h-2.5 text-[#080808]" />}
                            </div>
                            <span className="text-xs text-[#d4d4d4]">{tag}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {hasActiveFilters && (
        <button
          onClick={clearAllFilters}
          className="text-xs text-[#737373] hover:text-red-400 transition-colors whitespace-nowrap"
        >
          Clear filters
        </button>
      )}
    </div>
  );
};

export default BoardFilterMenu;
