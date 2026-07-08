import { ArrowLeft, LayoutGrid } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import type { ProjectDetailResponse } from '@/client';
import { Button } from '@/components/ui/button';
import type { ProjectTabSpec, ProjectTabId } from '@/lib/projectTabs';
import type { TabType } from '../types';

interface ProjectDetailHeaderProps {
  project: ProjectDetailResponse;
  /** Already filtered to the tabs this user can access (parent applies the
   *  capability/project-admin gate before passing). Order + labels + icons
   *  come straight from the registry. */
  tabs: readonly ProjectTabSpec[];
  activeTab: TabType;
  onTabChange: (tab: ProjectTabId) => void;
  can: (cap: string) => boolean;
  navigate: NavigateFunction;
}

const ProjectDetailHeader = ({
  project,
  tabs,
  activeTab,
  onTabChange,
  can,
  navigate,
}: ProjectDetailHeaderProps) => {
  return (
    <header className="border-b border-[rgba(255,255,255,0.08)] bg-[#080808]/95 backdrop-blur-xl sticky top-0 z-40 shadow-[0_1px_0_0_rgba(255,255,255,0.04)]">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="text-[#737373] hover:text-white hover:bg-[rgba(244,246,255,0.05)] rounded-lg gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Projects
            </Button>
            <div className="w-px h-6 bg-[rgba(255,255,255,0.07)]" />
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
          {/* Hidden when the user lacks `project.board` so they don't see
              an entry point that would 403 on click. Backend GET /board
              enforces the same cap, so this gate is UX-only, not security. */}
          {can('project.board') && (
            <Button
              onClick={() => navigate(`/project/${project.id}/board`)}
              className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] rounded-xl font-semibold shadow-lg shadow-[#E0B954]/20 h-9 px-4"
            >
              <LayoutGrid className="w-4 h-4 mr-2" />
              Open Board
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 flex gap-1 border-t border-[rgba(255,255,255,0.03)]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'text-white border-brand drop-shadow-[0_0_8px_rgba(224,185,84,0.6)]'
                  : 'text-[#737373] border-transparent hover:text-[#a3a3a3] hover:border-[rgba(255,255,255,0.08)]'
              }`}
            >
              <Icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-[#C79E3B]' : ''}`} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};

export default ProjectDetailHeader;
