import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  PROJECT_TABS,
  PROJECT_TABS_BY_ID,
  canAccessProjectTab,
  type ProjectTabId,
} from '@/lib/projectTabs';
import { Button } from '@/components/ui/button';
import { resetPulseData } from '@/components/ProjectHub/pulseData';
import { useMergedPulse, usePulseManualData } from '@/components/ProjectHub/usePulseData';
import { toast, Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { TabType } from './types';
import type { ProjectArchitectureResponse } from '@/client';
import { useProjectDetailData } from './hooks/useProjectDetailData';
import ProjectDetailHeader from './sections/ProjectDetailHeader';
import ProjectDetailSkeleton from './components/ProjectDetailSkeleton';
// Overview is the default tab — eager (not lazy) so the landing view doesn't
// pay a chunk-load on first paint. The other tabs are lazy (behind a click).
import OverviewTab from './tabs/OverviewTab';
// ArchitectureEditor (modal) is lazy here at the parent since edit state lives at the parent.
// MermaidRenderer is lazy-loaded inside ArchitectureSection.
const ArchitectureEditor = lazy(() => import('@/components/ArchitectureEditor'));
const TrackerTab = lazy(() => import('./tabs/TrackerTab'));
const TimelineTab = lazy(() => import('./tabs/TimelineTab'));
const PulseTab = lazy(() => import('./tabs/PulseTab'));
const PulseSettingsTab = lazy(() => import('./tabs/PulseSettingsTab'));
const ActivityTab = lazy(() => import('./tabs/ActivityTab'));
const ProjectManagerTab = lazy(() => import('./tabs/ProjectManagerTab'));

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, can } = useAuth();
  // Themed confirm dialog (shared primitive). `confirm` is threaded into the
  // data hook for the remove-developer flow; `confirmDialog` renders below.
  const { confirm, confirmDialog } = useConfirm();

  // Initial tab respects ?tab= URL param so external links (e.g. admin "Pulse Settings"
  // button) can deep-link to a specific tab on this project.
  const initialTab = (searchParams.get('tab') as TabType) || 'overview';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  // Keep ?tab= in sync with the active tab so refresh / share works.
  useEffect(() => {
    const current = searchParams.get('tab');
    if (current !== activeTab) {
      const next = new URLSearchParams(searchParams);
      if (activeTab === 'overview') next.delete('tab');
      else next.set('tab', activeTab);
      setSearchParams(next, { replace: true });
    }
  }, [activeTab]);

  // Architecture editing state — modal lives at parent so it overlays any tab.
  const [editingArchitecture, setEditingArchitecture] =
    useState<ProjectArchitectureResponse | null>(null);

  const [sprintsExpanded, setSprintsExpanded] = useState(false);

  // Pulse view data — editorial overrides loaded from the server (with a
  // localStorage fallback for offline / first-load). `usePulseManualData`
  // hides the migration from the legacy `pulse-data:<id>` localStorage key
  // and exposes a `saveMutation` the Pulse Settings tab uses to persist
  // edits. The derived overlay below stays read-only.
  const {
    manual: pulseData,
    saveMutation: pulseSaveMutation,
    updatedAt: pulseUpdatedAt,
    updatedBy: pulseUpdatedBy,
  } = usePulseManualData(id);

  // DB-derived overlay on top of the manual override blob. While the derived
  // endpoint is loading or errors, `mergedPulseData === pulseData` so the
  // Pulse view stays fully functional in the pure-manual path. The Pulse
  // Settings tab still edits the raw manual data — derivation is read-only.
  const { data: mergedPulseData, degradedSections: pulseDegradedSections } = useMergedPulse(
    id,
    pulseData,
  );

  // All project-detail data concerns (queries, mutations, handlers, the
  // overview cache-seeding effect) live in this hook. `onArchitectureSaved`
  // closes the parent-owned editor modal once the save succeeds.
  const {
    project,
    isLoading,
    accessDenied,
    allDevelopers,
    sprints,
    hubWorkItems,
    goals,
    milestones,
    activities,
    analytics,
    prdAnalysis,
    links,
    linksLoading,
    hubLoading,
    handleAddLink,
    handleDeleteLink,
    handleTaskUpdate,
    handleSaveEdit,
    handleAddDeveloper,
    handleRemoveDeveloper,
    handlePromoteToAdmin,
    handleDemoteFromAdmin,
    handleSaveArchitecture,
    isCurrentUserAdmin,
  } = useProjectDetailData(id, {
    confirm,
    onArchitectureSaved: () => setEditingArchitecture(null),
  });

  // If the active tab isn't accessible (URL deep-link to a gated tab, role
  // change mid-session, or the default `overview` is blocked), redirect to
  // the first tab the user CAN see. Runs once `project` resolves because
  // the per-project admin membership check needs `project.developers`.
  //
  // Logic is inlined rather than calling `canAccessTab` (defined later in
  // the body) because this effect must live above the loading-state early
  // return below to satisfy Rules of Hooks.
  //
  // The existing state → URL sync effect picks up the setActiveTab call
  // and updates `?tab=…` automatically (replace mode), so refresh + share
  // both reflect the corrected tab.
  useEffect(() => {
    if (!project) return;
    const isAdminOfThisProject = !!(
      user && (project.developers ?? []).some((dev) => dev.email === user.email && dev.is_admin)
    );
    // `TabType` is wider than `ProjectTabId` (it includes legacy ids like
    // 'goals' and 'hub' that aren't in the picker registry). For those,
    // `PROJECT_TABS_BY_ID` lookup is undefined and we fail-closed to false,
    // which is correct — the redirect logic then picks the first allowed
    // registry tab below.
    const checkTabAccess = (tabId: TabType): boolean => {
      const spec = PROJECT_TABS_BY_ID[tabId as ProjectTabId];
      return spec ? canAccessProjectTab(spec, can, isAdminOfThisProject) : false;
    };
    if (checkTabAccess(activeTab)) return;
    const firstAccessible = PROJECT_TABS.find((spec) => checkTabAccess(spec.id));
    if (firstAccessible && firstAccessible.id !== activeTab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate access-correction redirect; cap state is external to React tree
      setActiveTab(firstAccessible.id);
    }
  }, [project, activeTab, user, can]);

  // Show toast when 403 is encountered
  useEffect(() => {
    if (accessDenied) {
      toast.error('You do not have access to this project');
    }
  }, [accessDenied]);

  if (isLoading) {
    return <ProjectDetailSkeleton />;
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center text-center p-4">
        <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
          <ShieldAlert className="w-10 h-10 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-[#737373] max-w-md mb-6">
          You do not have permission to view this project. Only assigned developers and admins can
          access project details.
        </p>
        <Button
          onClick={() => navigate('/')}
          className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Projects
        </Button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold text-white mb-2">Project not found</h2>
        <Button onClick={() => navigate('/')} variant="ghost" className="text-[#E0B954]">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Projects
        </Button>
      </div>
    );
  }

  // Project-admin membership flag — needed for tabs that have
  // `allowProjectAdmin: true` in the registry (currently just PM). Computed
  // once here instead of inside each tab's gate so the per-tab check stays
  // simple. False when user/project aren't loaded yet.
  const isProjectAdmin = !!(
    user &&
    project &&
    (project.developers ?? []).some((dev) => dev.email === user.email && dev.is_admin)
  );

  /** Single per-tab access check used by both the tab strip and the URL-
   *  direct-access content guard. Looks up the spec from the registry —
   *  if the tab id is unknown (shouldn't happen, just defensive), denies. */
  const canAccessTab = (tabId: ProjectTabId): boolean => {
    const spec = PROJECT_TABS_BY_ID[tabId];
    return spec ? canAccessProjectTab(spec, can, isProjectAdmin) : false;
  };

  // Tab strip — filter the registry by access. Order and labels come from
  // the registry, so adding a new tab there automatically surfaces here.
  const tabs = PROJECT_TABS.filter((spec) => canAccessTab(spec.id));

  // Filter out developers already in project
  const availableDevelopers = allDevelopers.filter(
    (d) => !(project.developers ?? []).some((pd) => pd.id === d.id),
  );

  return (
    <div className="min-h-screen bg-[#080808] text-[#F4F6FF]">
      <Toaster position="top-right" theme="dark" richColors />
      {confirmDialog}

      <ProjectDetailHeader
        project={project}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        can={can}
        navigate={navigate}
      />

      {/* Content */}
      <main className="px-6 py-4 max-w-7xl mx-auto">
        {/* Overview Tab — gated on any project.overview.* capability */}
        {activeTab === 'overview' &&
          (canAccessTab('overview') ? (
            <OverviewTab
              hubLoading={hubLoading}
              project={project}
              prdAnalysis={prdAnalysis}
              isCurrentUserAdmin={isCurrentUserAdmin()}
              availableDevelopers={availableDevelopers}
              links={links}
              linksLoading={linksLoading}
              onSaveEdit={handleSaveEdit}
              onEditArchitecture={setEditingArchitecture}
              onOpenBoard={
                can('project.board') ? () => navigate(`/project/${project.id}/board`) : undefined
              }
              onAddDeveloper={handleAddDeveloper}
              onRemoveDeveloper={handleRemoveDeveloper}
              onPromoteToAdmin={handlePromoteToAdmin}
              onDemoteFromAdmin={handleDemoteFromAdmin}
              onAddLink={handleAddLink}
              onDeleteLink={handleDeleteLink}
            />
          ) : (
            <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
          ))}

        <Suspense fallback={<div className="text-sm text-muted-foreground p-6">Loading...</div>}>
          {/* Project Tracker Tab — gated on any project.tracker.* capability */}
          {activeTab === 'tracker' &&
            (canAccessTab('tracker') ? (
              <TrackerTab
                hubLoading={hubLoading}
                sprints={sprints}
                analytics={analytics}
                sprintsExpanded={sprintsExpanded}
                setSprintsExpanded={setSprintsExpanded}
              />
            ) : (
              <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
            ))}

          {/* Timeline Tab — gated on `project.calendar` */}
          {activeTab === 'calendar' &&
            (canAccessTab('calendar') ? (
              <TimelineTab
                hubLoading={hubLoading}
                hubWorkItems={hubWorkItems}
                milestones={milestones}
                goals={goals}
                projectStartDate={project.created_at}
                projectId={parseInt(id!)}
                onTaskUpdate={handleTaskUpdate}
              />
            ) : (
              <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
            ))}

          {/* Pulse Tab (was Business Review) — gated on `project.pulse` */}
          {activeTab === 'pulse' &&
            (canAccessTab('pulse') ? (
              <PulseTab
                hubLoading={hubLoading}
                pulseData={mergedPulseData}
                degradedSections={pulseDegradedSections}
              />
            ) : (
              <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
            ))}

          {/* Pulse Settings Tab — gated on `project.pulse.settings` capability */}
          {activeTab === 'pulse_settings' &&
            (canAccessTab('pulse_settings') && id && pulseData ? (
              <PulseSettingsTab
                projectId={id}
                pulseData={pulseData}
                derivedMilestones={mergedPulseData?.milestones ?? pulseData.milestones}
                updatedAt={pulseUpdatedAt}
                updatedBy={pulseUpdatedBy}
                onSave={async (data) => {
                  await pulseSaveMutation.mutateAsync({ data });
                }}
                onReset={async (fixture) => {
                  // Why server-first: if the PUT fails (e.g. 403 for a
                  // non-admin), clearing localStorage first would leave the
                  // user with no recoverable local copy of their data. Only
                  // wipe the cache after the server confirms the reset.
                  await pulseSaveMutation.mutateAsync({ data: fixture });
                  resetPulseData(id);
                }}
              />
            ) : (
              <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
            ))}

          {/* Activity Tab — gated on `project.activity` */}
          {activeTab === 'activity' &&
            (canAccessTab('activity') ? (
              <ActivityTab hubLoading={hubLoading} activities={activities} />
            ) : (
              <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
            ))}

          {/* Project Manager Tab — capability-gated; only renders when canAccessTab('project_manager') is true */}
          {activeTab === 'project_manager' && canAccessTab('project_manager') && (
            <ProjectManagerTab hubLoading={hubLoading} projectId={id!} sprints={sprints} />
          )}
        </Suspense>
      </main>

      {/* Architecture Editor Modal */}
      {editingArchitecture && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-8">
              <Spinner size="md" tone="gold" />
            </div>
          }
        >
          <ArchitectureEditor
            architecture={editingArchitecture}
            onSave={handleSaveArchitecture}
            onClose={() => setEditingArchitecture(null)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ProjectDetail;
