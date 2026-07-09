import { Plus, X, Search, FolderKanban, Star, ArrowUpDown, Check, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import { avatarColor } from '@/lib/avatarColor';
import type { Project } from './types';

// Real backend project statuses → display label + accent. Falls back to a
// title-cased label in neutral grey for any status not in the map.
const STATUS_META: Record<string, { label: string; color: string }> = {
  ideation: { label: 'Ideation', color: '#7C879C' },
  planning: { label: 'Planning', color: '#5896DE' },
  development: { label: 'Development', color: '#8A8A8A' },
  testing: { label: 'Testing', color: '#9C82E0' },
  launched: { label: 'Launched', color: '#40BE86' },
  archived: { label: 'Archived', color: '#7C879C' },
};
const statusMeta = (status: string) =>
  STATUS_META[status] ?? {
    label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown',
    color: '#7C879C',
  };

type ProjectFilter = 'all' | 'fav';
type ProjectSort = 'recent' | 'name' | 'progress';

const SORT_OPTIONS: { key: ProjectSort; label: string }[] = [
  { key: 'recent', label: 'Recent activity' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'progress', label: 'Progress' },
];

interface ProjectsBoxProps {
  projects: Project[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onCreateProjectClick: () => void;
  onProjectClick: (projectId: number) => void;
  onDeleteProject: (e: React.MouseEvent, projectId: number) => void;
  onToggleFavorite: (projectId: number, next: boolean) => void;
}

const ProjectsBox = ({
  projects,
  isLoading,
  searchQuery,
  setSearchQuery,
  onCreateProjectClick,
  onProjectClick,
  onDeleteProject,
  onToggleFavorite,
}: ProjectsBoxProps) => {
  const { can } = useAuth();
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [sort, setSort] = useState<ProjectSort>('recent');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // Filter + sort over every project runs on each keystroke and each favorite
  // toggle; memoize so an unrelated parent re-render doesn't re-sort the list.
  const filteredProjects = useMemo(
    () =>
      projects
        .filter((p) => {
          const matchesSearch =
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.description ?? '').toLowerCase().includes(searchQuery.toLowerCase());
          const matchesFilter = filter === 'fav' ? !!p.is_favorite : true;
          return matchesSearch && matchesFilter;
        })
        .sort((a, b) => {
          if (sort === 'name')
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          if (sort === 'progress')
            return b.work_item_stats.completion_pct - a.work_item_stats.completion_pct;
          // recent: newest created_at first (closest proxy to "recent activity")
          return (b.created_at ?? '').localeCompare(a.created_at ?? '');
        }),
    [projects, searchQuery, filter, sort],
  );

  const favCount = useMemo(() => projects.filter((p) => p.is_favorite).length, [projects]);
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? 'Sort';

  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-2xl flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white">Projects</h2>
            <span className="text-[11px] text-muted-foreground bg-[rgba(255,255,255,0.06)] px-2 py-0.5 rounded-full">
              {filteredProjects.length}
            </span>
          </div>
          {/* Create-project — gated on `project.create`; backend enforces the
              same gate so UI/backend can't drift. */}
          {can('project.create') && (
            <button
              onClick={onCreateProjectClick}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] transition-opacity"
              title="New Project"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="relative mb-2.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
          <Input
            placeholder="Search projects…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 w-full bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-lg h-8 text-xs focus:border-[rgba(255,255,255,0.12)]"
          />
        </div>

        <div className="flex items-center gap-1.5 pb-3 border-b border-[rgba(255,255,255,0.05)]">
          <button
            onClick={() => setFilter('all')}
            aria-pressed={filter === 'all'}
            className={`text-[11.5px] px-2.5 py-1 rounded-lg border transition-colors ${
              filter === 'all'
                ? 'font-bold text-white bg-[rgba(255,255,255,0.08)] border-[rgba(255,255,255,0.14)]'
                : 'font-medium text-muted-foreground border-[rgba(255,255,255,0.08)] hover:text-white'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('fav')}
            title="Favorites"
            aria-label="Favorites"
            aria-pressed={filter === 'fav'}
            className={`flex items-center gap-1 text-[11.5px] px-2.5 py-1 rounded-lg border transition-colors ${
              filter === 'fav'
                ? 'font-bold text-brand bg-[rgba(224,185,84,0.12)] border-[rgba(224,185,84,0.35)]'
                : 'font-medium text-muted-foreground border-[rgba(255,255,255,0.08)] hover:text-white'
            }`}
          >
            <Star
              className="w-3 h-3"
              fill={filter === 'fav' ? 'currentColor' : 'none'}
              strokeWidth={2}
            />
            {favCount > 0 && <span>{favCount}</span>}
          </button>

          <Popover open={sortMenuOpen} onOpenChange={setSortMenuOpen}>
            <PopoverTrigger asChild>
              <button
                className="ml-auto flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-lg border border-[rgba(255,255,255,0.08)] text-[#a3a3a3] hover:border-[rgba(255,255,255,0.18)] transition-colors"
                title={`Sort: ${sortLabel}`}
                aria-label={`Sort: ${sortLabel}`}
              >
                <ArrowUpDown className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={5}
              className="w-[150px] p-1 bg-[#121212] border border-[rgba(255,255,255,0.1)] rounded-[10px] shadow-2xl"
            >
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => {
                    setSort(o.key);
                    setSortMenuOpen(false);
                  }}
                  aria-pressed={sort === o.key}
                  className="flex items-center w-full px-2.5 py-1.5 rounded-md text-[12.5px] text-[#e4e4e4] hover:bg-[rgba(255,255,255,0.06)] text-left"
                >
                  {o.label}
                  {sort === o.key && (
                    <Check
                      className="w-3.5 h-3.5 ml-auto text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="sm" tone="gold" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FolderKanban className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-[#737373]">
              {filter === 'fav' ? 'No favorite projects yet' : 'No projects found'}
            </p>
          </div>
        ) : (
          filteredProjects.map((project) => {
            // Seed the accent from the project id so it's stable per project —
            // a positional index reassigned colors whenever the sort changed.
            const accent = avatarColor(project.id).fg;
            const meta = statusMeta(project.status);
            const isFav = !!project.is_favorite;
            return (
              <div
                key={project.id}
                onClick={() => onProjectClick(project.id)}
                className="group flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-[rgba(255,255,255,0.035)] cursor-pointer transition-colors"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(project.id, !isFav);
                  }}
                  title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                  aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                  aria-pressed={isFav}
                  className="p-0.5 flex-shrink-0 transition-colors"
                  style={{ color: isFav ? 'var(--brand)' : '#4a4a4a' }}
                >
                  <Star className="w-[15px] h-[15px]" fill={isFav ? 'currentColor' : 'none'} />
                </button>
                <div
                  className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[10.5px] font-bold text-[#080808] flex-shrink-0"
                  style={{ backgroundColor: accent }}
                >
                  {project.key_prefix.substring(0, 3)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span
                      title={project.name}
                      className="text-[13px] font-medium text-[#f0f0f0] truncate"
                    >
                      {project.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {project.work_item_stats.completion_pct}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[5px] bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${project.work_item_stats.completion_pct}%`,
                          backgroundColor: accent,
                        }}
                      />
                    </div>
                    <span
                      className="text-[10px] font-semibold flex-shrink-0"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </div>
                </div>
                {can('admin.projects') && (
                  <button
                    onClick={(e) => onDeleteProject(e, project.id)}
                    aria-label="Delete project"
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-[#737373] hover:text-red-400 transition-all flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ProjectsBox;
