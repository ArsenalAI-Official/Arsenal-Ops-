import {
  Users,
  Ticket,
  Github,
  Settings,
  ExternalLink,
  Mail,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Tag,
} from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectResponse } from '@/client';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { UNCATEGORIZED_OPTION } from './types';
import type { ProjectCategory } from '../../modals/CategoryManagerModal';

interface ProjectCardsViewProps {
  /** Already category- + search-filtered list. */
  searchedProjects: ProjectResponse[];
  projectSearch: string;
  categoryFilter: string;
  categories: ProjectCategory[];
  invitingProjectId: number | null;
  onSetProjectCategory: (projectId: number, categoryId: number | null) => void;
  onEditGitHubSettings: (project: ProjectResponse, e: React.MouseEvent) => void;
  onSendGitHubInvites: (project: ProjectResponse, e: React.MouseEvent) => void;
  onOpenProjectMembers: (project: ProjectResponse, e: React.MouseEvent) => void;
  canWriteProjects: boolean;
}

/** The original project-card grid. Hidden when Reports is active so the page
 *  doesn't double-scroll. */
const ProjectCardsView: React.FC<ProjectCardsViewProps> = ({
  searchedProjects,
  projectSearch,
  categoryFilter,
  categories,
  invitingProjectId,
  onSetProjectCategory,
  onEditGitHubSettings,
  onSendGitHubInvites,
  onOpenProjectMembers,
  canWriteProjects,
}) => {
  const navigate = useNavigate();

  if (searchedProjects.length === 0) {
    return (
      <Empty>
        <EmptyDescription>
          {projectSearch.trim()
            ? 'No projects match your search.'
            : categoryFilter === 'all'
              ? 'No projects yet.'
              : 'No projects match this category filter.'}
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {[...searchedProjects]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        .map((project) => (
          <div
            key={project.id}
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 hover:border-[rgba(255,255,255,0.12)] transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div
                className="cursor-pointer flex-1 min-w-0"
                onClick={() => navigate(`/project/${project.id}`)}
              >
                <h3 className="text-sm font-semibold text-white truncate">{project.name}</h3>
                <div className="text-xs text-[#737373] mt-0.5">{project.status}</div>
              </div>
              {canWriteProjects && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => onEditGitHubSettings(project, e)}
                  className="text-[#737373] hover:text-white h-7 w-7 p-0 shrink-0"
                >
                  <Settings className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            {/* Category chip. When the admin has projects-write, the
            chip IS the edit affordance (a Select); without it, the
            chip renders as a read-only badge with the same shape so
            the layout stays stable across permission levels. */}
            <div className="mb-3">
              {canWriteProjects ? (
                <Select
                  value={
                    project.category_id === null
                      ? UNCATEGORIZED_OPTION
                      : String(project.category_id)
                  }
                  onValueChange={(value) => {
                    const nextId = value === UNCATEGORIZED_OPTION ? null : Number(value);
                    // No-op guard — Radix Select sometimes fires onValueChange
                    // with the current value during open/close. Skip the round
                    // trip when nothing actually changed.
                    if (nextId === project.category_id) return;
                    onSetProjectCategory(project.id, nextId);
                  }}
                >
                  <SelectTrigger
                    onClick={(e) => e.stopPropagation()}
                    className={
                      'h-7 px-2.5 text-[11px] gap-1.5 rounded-full border w-auto inline-flex ' +
                      (project.category_name
                        ? 'bg-[rgba(255,255,255,0.06)] text-muted-foreground border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.1)]'
                        : 'bg-[rgba(255,255,255,0.03)] text-[#737373] border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white')
                    }
                  >
                    <Tag className="w-3 h-3" />
                    <SelectValue>{project.category_name ?? 'Uncategorized'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                    <SelectItem value={UNCATEGORIZED_OPTION} className="text-white">
                      Uncategorized
                    </SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)} className="text-white">
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span
                  className={
                    'h-7 px-2.5 text-[11px] gap-1.5 rounded-full border inline-flex items-center ' +
                    (project.category_name
                      ? 'bg-[rgba(255,255,255,0.06)] text-muted-foreground border-[rgba(255,255,255,0.12)]'
                      : 'bg-[rgba(255,255,255,0.03)] text-[#737373] border-[rgba(255,255,255,0.05)]')
                  }
                  title="Read-only — requires projects write to change"
                >
                  <Tag className="w-3 h-3" />
                  {project.category_name ?? 'Uncategorized'}
                </span>
              )}
            </div>

            {/* GitHub Info + Invite */}
            {project.github_repo_url && (
              <div className="mb-3 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)]">
                <div className="flex items-center gap-2 mb-2">
                  <Github className="w-3.5 h-3.5 text-[#737373]" />
                  <a
                    href={project.github_repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {project.github_repo_name || project.github_repo_url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {project.has_github_token && (
                    <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Token
                    </span>
                  )}
                </div>
                {canWriteProjects && (
                  <Button
                    size="sm"
                    onClick={(e) => onSendGitHubInvites(project, e)}
                    disabled={invitingProjectId === project.id}
                    className="w-full h-7 text-[10px] bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-sm disabled:opacity-50"
                  >
                    {invitingProjectId === project.id ? (
                      <>
                        <Spinner size="xs" tone="white" className="mr-1" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="w-3 h-3 mr-1" />
                        Send GitHub Invites
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
            {!project.github_repo_url && (
              <div className="mb-3 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-[#737373]" />
                <span className="text-[10px] text-[#737373]">No GitHub repo configured</span>
              </div>
            )}
            <div className="flex items-center gap-4 mt-4 text-xs text-[#737373]">
              <button
                onClick={(e) => onOpenProjectMembers(project, e)}
                className="flex items-center gap-1 hover:text-muted-foreground transition-colors cursor-pointer rounded px-1 -mx-1 hover:bg-[rgba(255,255,255,0.06)]"
                title="View and manage project members"
              >
                <Users className="w-3.5 h-3.5" />
                <span className="underline-offset-2 hover:underline">
                  {project.developer_count}
                </span>
              </button>
              <div className="flex items-center gap-1">
                <Ticket className="w-3.5 h-3.5" />
                {project.total_items}
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#737373]">Progress</span>
                <span className="text-[#a3a3a3]">{project.completion_pct}%</span>
              </div>
              <div className="h-1.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-progress rounded-full"
                  style={{ width: `${project.completion_pct}%` }}
                />
              </div>
            </div>
            {/* Pulse Settings — opens this project's Pulse Settings tab in ProjectDetail */}
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/project/${project.id}?tab=pulse_settings`);
              }}
              className="w-full mt-3 h-8 text-[11px] bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.12)] text-muted-foreground rounded-lg font-semibold"
            >
              <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
              Edit Pulse values
            </Button>
          </div>
        ))}
    </div>
  );
};

export default ProjectCardsView;
