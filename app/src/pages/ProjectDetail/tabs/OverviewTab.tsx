import ProjectInfoSection from '../sections/ProjectInfoSection';
import PRDAnalysisSection from '../sections/PRDAnalysisSection';
import ArchitectureSection from '../sections/ArchitectureSection';
import TeamSection from '../sections/TeamSection';
import LinksSection from '../sections/LinksSection';
import type {
  DeveloperResponse,
  ProjectLinkResponse,
  ProjectArchitectureResponse,
  PrdAnalysisResponse,
  ProjectDetailResponse,
} from '@/client';

interface OverviewTabProps {
  /** While true, the full overview skeleton is shown until ALL hub data
   *  (analytics, PRD, …) is ready. */
  hubLoading: boolean;
  project: ProjectDetailResponse;
  prdAnalysis: PrdAnalysisResponse | null;
  isCurrentUserAdmin: boolean;
  availableDevelopers: DeveloperResponse[];
  links: ProjectLinkResponse[];
  linksLoading: boolean;
  onSaveEdit: (editForm: Partial<ProjectDetailResponse>) => void;
  onEditArchitecture: (arch: ProjectArchitectureResponse) => void;
  /** Undefined when the user lacks `project.board` — hides the "AI Generate"
   *  / Open Board entry point inside ArchitectureSection. */
  onOpenBoard?: () => void;
  onAddDeveloper: (form: { developer_id: string; role: string; responsibilities: string }) => void;
  onRemoveDeveloper: (developerId: number) => void;
  onPromoteToAdmin: (developerId: number) => void;
  onDemoteFromAdmin: (developerId: number) => void;
  onAddLink: (link: { name: string; url: string }) => void;
  onDeleteLink: (linkId: number) => void;
}

const OverviewTab = ({
  hubLoading,
  project,
  prdAnalysis,
  isCurrentUserAdmin,
  availableDevelopers,
  links,
  linksLoading,
  onSaveEdit,
  onEditArchitecture,
  onOpenBoard,
  onAddDeveloper,
  onRemoveDeveloper,
  onPromoteToAdmin,
  onDemoteFromAdmin,
  onAddLink,
  onDeleteLink,
}: OverviewTabProps) => {
  if (hubLoading) {
    // Full overview skeleton — shown until ALL data (analytics, PRD) is ready
    return (
      <div className="space-y-4 animate-pulse">
        {/* Project Information skeleton */}
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="h-5 w-44 bg-[rgba(255,255,255,0.07)] rounded" />
            <div className="h-7 w-14 bg-[rgba(255,255,255,0.04)] rounded-lg" />
          </div>
          <div className="space-y-3">
            <div className="h-3 w-24 bg-[rgba(255,255,255,0.05)] rounded" />
            <div className="h-4 w-3/4 bg-[rgba(255,255,255,0.06)] rounded" />
            <div className="h-3 w-32 bg-[rgba(255,255,255,0.05)] rounded mt-2" />
            <div className="h-4 w-1/2 bg-[rgba(255,255,255,0.05)] rounded" />
          </div>
          <div className="flex gap-6 pt-4 mt-3 border-t border-[rgba(255,255,255,0.04)]">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <div className="h-2.5 w-14 bg-[rgba(255,255,255,0.04)] rounded mb-1" />
                <div className="h-4 w-16 bg-[rgba(255,255,255,0.06)] rounded" />
              </div>
            ))}
          </div>
        </div>
        {/* 4 Stat cards skeleton */}
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[rgba(255,255,255,0.05)]" />
                <div>
                  <div className="h-7 w-12 bg-[rgba(255,255,255,0.07)] rounded mb-1" />
                  <div className="h-3 w-20 bg-[rgba(255,255,255,0.04)] rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* PRD/Project Overview skeleton */}
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.06)]" />
            <div>
              <div className="h-4 w-36 bg-[rgba(255,255,255,0.07)] rounded mb-1" />
              <div className="h-3 w-28 bg-[rgba(255,255,255,0.04)] rounded" />
            </div>
          </div>
          <div className="space-y-2 mb-4">
            <div className="h-3 w-full bg-[rgba(255,255,255,0.05)] rounded" />
            <div className="h-3 w-5/6 bg-[rgba(255,255,255,0.05)] rounded" />
            <div className="h-3 w-4/6 bg-[rgba(255,255,255,0.04)] rounded" />
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-6 w-24 bg-[rgba(255,255,255,0.04)] rounded-full" />
            ))}
          </div>
          <div className="h-32 bg-[rgba(255,255,255,0.025)] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <ProjectInfoSection
          project={project}
          isCurrentUserAdmin={isCurrentUserAdmin}
          onSave={onSaveEdit}
        />

        {/* PRD Analysis Section */}
        {prdAnalysis && (
          <PRDAnalysisSection
            prdAnalysis={prdAnalysis}
            projectId={project.id}
            projectName={project.name}
          />
        )}

        {/* Architecture Section */}
        {project.selected_architecture && (
          <ArchitectureSection
            architecture={project.selected_architecture}
            onEdit={onEditArchitecture}
            isCurrentUserAdmin={isCurrentUserAdmin}
            onOpenBoard={onOpenBoard}
          />
        )}

        {/* Team Section */}
        <TeamSection
          developers={project.developers ?? []}
          availableDevelopers={availableDevelopers}
          isCurrentUserAdmin={isCurrentUserAdmin}
          onAddDeveloper={onAddDeveloper}
          onRemoveDeveloper={onRemoveDeveloper}
          onPromoteToAdmin={onPromoteToAdmin}
          onDemoteFromAdmin={onDemoteFromAdmin}
        />
      </div>

      {/* Files/Links Section */}
      <LinksSection
        links={links}
        isLoading={linksLoading}
        onAddLink={onAddLink}
        onDeleteLink={onDeleteLink}
        isCurrentUserAdmin={isCurrentUserAdmin}
      />
    </>
  );
};

export default OverviewTab;
