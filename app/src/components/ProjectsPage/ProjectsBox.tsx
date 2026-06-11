import { Plus, X, Search, FolderKanban, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import type { Project } from './types';

const ACCENT_COLORS = ['#E0B954', '#F59E0B', '#C79E3B', '#B8872A', '#EC4899', '#06B6D4'];

interface ProjectsBoxProps {
  projects: Project[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onCreateProjectClick: () => void;
  onProjectClick: (projectId: number) => void;
  onDeleteProject: (e: React.MouseEvent, projectId: number) => void;
}

const ProjectsBox = ({
  projects,
  isLoading,
  searchQuery,
  setSearchQuery,
  onCreateProjectClick,
  onProjectClick,
  onDeleteProject,
}: ProjectsBoxProps) => {
  const { can } = useAuth();
  // Filter by search, then sort A → Z by display name. `.filter` already
  // returns a fresh array so chaining `.sort` doesn't mutate the parent's
  // `projects` prop. localeCompare with `sensitivity: 'base'` makes the
  // order case- and accent-insensitive — same comparator used in the task
  // dialogs (AddPersonalTaskDialog / ConvertToTicketDialog) for consistency.
  const filteredProjects = projects
    .filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-2xl flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-white">Projects</h2>
          <span className="text-xs text-[#737373] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 rounded-full">
            {filteredProjects.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-32 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-lg h-7 text-xs focus:border-[#E0B954]/50"
            />
          </div>
          {/* Create-project — gated on `project.create`. Hidden entirely
              for roles without the cap; backend POST /api/projects/ enforces
              the same gate so the UI/backend can't drift. */}
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
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="sm" tone="gold" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FolderKanban className="w-8 h-8 text-[#E0B954]/20 mx-auto mb-2" />
            <p className="text-sm text-[#737373]">No projects found</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredProjects.map((project, idx) => {
              const accent = ACCENT_COLORS[idx % ACCENT_COLORS.length];
              return (
                <div
                  key={project.id}
                  onClick={() => onProjectClick(project.id)}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgba(255,255,255,0.04)] cursor-pointer transition-all duration-200"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-[#080808] flex-shrink-0"
                    style={{ backgroundColor: accent }}
                  >
                    {project.key_prefix.substring(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white truncate">
                        {project.name}
                      </span>
                      <span className="text-xs text-[#737373] flex-shrink-0 ml-2">
                        {project.work_item_stats.completion_pct}%
                      </span>
                    </div>
                    <div className="h-1 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${project.work_item_stats.completion_pct}%`,
                          backgroundColor: accent,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {can('admin.projects') && (
                      <button
                        onClick={(e) => onDeleteProject(e, project.id)}
                        className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-[#737373] hover:text-red-400 transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <ArrowRight className="w-3.5 h-3.5 text-[#555] group-hover:text-[#E0B954] transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectsBox;
