import React from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  total_items: number;
  done_items: number;
  completion_pct: number;
  developer_count: number;
  github_repo_url: string | null;
  github_repo_urls?: string[];
  github_repo_name: string | null;
  has_github_token: boolean;
}

interface ProjectsTabProps {
  projects: Project[];
  invitingProjectId: number | null;
  onEditGitHubSettings: (project: Project, e: React.MouseEvent) => void;
  onSendGitHubInvites: (project: Project, e: React.MouseEvent) => void;
  onOpenProjectMembers: (project: Project, e: React.MouseEvent) => void;
}

const ProjectsTab = ({
  projects,
  invitingProjectId,
  onEditGitHubSettings,
  onSendGitHubInvites,
  onOpenProjectMembers,
}: ProjectsTabProps) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">All Projects</h2>
      <div className="grid grid-cols-3 gap-4">
        {projects.map((project) => (
          <div
            key={project.id}
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 hover:border-[rgba(224,185,84,0.3)] transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div
                className="cursor-pointer flex-1"
                onClick={() => navigate(`/project/${project.id}`)}
              >
                <h3 className="text-sm font-semibold text-white">{project.name}</h3>
                <div className="text-xs text-[#737373] mt-0.5">{project.status}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => onEditGitHubSettings(project, e)}
                className="text-[#737373] hover:text-white h-7 w-7 p-0"
              >
                <Settings className="w-3.5 h-3.5" />
              </Button>
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
                    className="text-xs text-[#E0B954] hover:underline flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {project.github_repo_name || project.github_repo_url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {project.has_github_token && (
                    <span className="ml-auto text-[10px] text-[#E0B954] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Token
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={(e) => onSendGitHubInvites(project, e)}
                  disabled={invitingProjectId === project.id}
                  className="w-full h-7 text-[10px] bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-sm disabled:opacity-50"
                >
                  {invitingProjectId === project.id ? (
                    <>
                      <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin mr-1" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-3 h-3 mr-1" />
                      Send GitHub Invites
                    </>
                  )}
                </Button>
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
                className="flex items-center gap-1 hover:text-[#E0B954] transition-colors cursor-pointer rounded px-1 -mx-1 hover:bg-[rgba(224,185,84,0.08)]"
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
                  className="h-full bg-gradient-to-r from-[#E0B954] to-[#B8872A] rounded-full"
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
              className="w-full mt-3 h-8 text-[11px] bg-[rgba(224,185,84,0.1)] hover:bg-[rgba(224,185,84,0.18)] border border-[rgba(224,185,84,0.3)] text-[#E0B954] rounded-lg font-semibold"
            >
              <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
              Edit Pulse values
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectsTab;
export type { Project };
