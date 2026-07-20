import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type {
  SprintResponse,
  ProjectDetailResponse,
  PrdAnalysisResponse,
  DeveloperResponse,
  ProjectAnalyticsResponse,
  GoalResponse,
  MilestoneResponse,
  ActivityResponse,
  ProjectLinkResponse,
  WorkItemListResponse,
  WorkItemUpdate,
  WorkItemDetailResponse,
} from '@/client';
import type { ConfirmFn } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useAllDevelopers } from '@/hooks/useAllDevelopers';
import { apiFetch, ApiError } from '@/lib/api';
import {
  invalidateProjectScope,
  invalidateWorkItemScope,
  invalidateAdminMembershipImpact,
} from '@/lib/invalidations';
import { toastErrorHandler } from '@/lib/mutationToast';
import type { HubWorkItem, ProjectOverview } from '../types';

/**
 * All data concerns for ProjectDetail — the 11 queries, 9 mutations, their
 * wrapped handlers, and the overview cache-seeding effect. Takes only the
 * route `id`; everything else (queryClient, user, can) is sourced from its
 * own hook calls so the contract stays a single argument.
 *
 * Queries and mutations live here (not in the orchestrator) following the
 * realized AdminDashboard pattern. Sub-components receive `data`/handlers as
 * props. Effects that drive the orchestrator's render/routing (the ?tab= sync,
 * the access-correction redirect, the accessDenied toast) stay at the parent —
 * only the pure cache-seeding effect moves here, since it touches just the
 * query cache and this hook's own `overviewQuery.data`.
 *
 * `options.onArchitectureSaved` lets the parent close its Architecture editor
 * modal on a successful save — that modal's open state (`editingArchitecture`)
 * lives at the parent so it can overlay any tab, so the close must be driven
 * from there. react-query reads the latest mutation options each render, so a
 * fresh inline callback is safe.
 */
export interface UseProjectDetailDataOptions {
  onArchitectureSaved?: () => void;
  /** Themed confirm dialog from the parent's `useConfirm()`. Used to gate the
   *  destructive remove-developer action. When omitted, removal proceeds
   *  without a prompt (defensive default; the orchestrator always passes it). */
  confirm?: ConfirmFn;
}
export interface UseProjectDetailDataResult {
  project: ProjectDetailResponse | null;
  isLoading: boolean;
  accessDenied: boolean;
  allDevelopers: DeveloperResponse[];
  sprints: SprintResponse[];
  hubWorkItems: HubWorkItem[];
  goals: GoalResponse[];
  milestones: MilestoneResponse[];
  activities: ActivityResponse[];
  analytics: ProjectAnalyticsResponse | null;
  prdAnalysis: PrdAnalysisResponse | null;
  links: ProjectLinkResponse[];
  linksLoading: boolean;
  hubLoading: boolean;
  handleAddLink: (link: { name: string; url: string }) => void;
  handleDeleteLink: (linkId: number) => void;
  handleTaskUpdate: (itemId: string, updates: WorkItemUpdate) => void;
  handleSaveEdit: (editForm: Partial<ProjectDetailResponse>) => void;
  handleAddDeveloper: (form: {
    developer_id: string;
    role: string;
    responsibilities: string;
  }) => void;
  handleRemoveDeveloper: (developerId: number) => void;
  handlePromoteToAdmin: (developerId: number) => void;
  handleDemoteFromAdmin: (developerId: number) => void;
  handleSaveArchitecture: (
    archId: number,
    updates: { mermaid_code?: string; name?: string; description?: string },
  ) => void;
  isCurrentUserAdmin: () => boolean;
}

export const useProjectDetailData = (
  id: string | undefined,
  options?: UseProjectDetailDataOptions,
): UseProjectDetailDataResult => {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();

  // ── react-query: project overview (B1) ──────────────────────────────────
  // One round-trip that returns project + sprints + goals + milestones +
  // activities + analytics + prdAnalysis + links. We keep the individual
  // useQuery hooks below as fallback (low-risk migration) and seed their
  // caches via setQueryData in an effect — they return immediately from
  // cache on first paint instead of issuing 7 extra HTTP calls.
  const overviewQuery = useQuery<ProjectOverview>({
    queryKey: ['projectOverview', id],
    queryFn: () => apiFetch<ProjectOverview>(`/api/projects/${id}/overview`),
    enabled: !!id,
  });

  useEffect(() => {
    const d = overviewQuery.data;
    if (!d || !id) return;
    queryClient.setQueryData(['project', id], d.project);
    queryClient.setQueryData(['sprints', id], d.sprints);
    queryClient.setQueryData(['hubData', id, 'goals'], d.goals);
    queryClient.setQueryData(['hubData', id, 'milestones'], d.milestones);
    queryClient.setQueryData(['hubData', id, 'activities'], d.activities);
    queryClient.setQueryData(['hubData', id, 'analytics'], d.analytics);
    queryClient.setQueryData(['hubData', id, 'prd'], d.prdAnalysis);
    queryClient.setQueryData(['project', id, 'links'], d.links);
  }, [overviewQuery.data, id, queryClient]);

  // True once the overview has seeded caches, or while it's still in flight.
  // The 8 seeded queries below only fire as a fallback if the overview
  // definitively failed (data undefined, isLoading false) — so on cold load we
  // issue one `/overview` request instead of racing it with ~8 per-resource ones.
  const overviewCovers = !!overviewQuery.data || overviewQuery.isLoading;

  // ── react-query: project ────────────────────────────────────────────────
  const projectQuery = useQuery<ProjectDetailResponse>({
    queryKey: ['project', id],
    queryFn: () => apiFetch<ProjectDetailResponse>(`/api/projects/${id}`),
    enabled: !!id && !overviewCovers,
  });
  const project = projectQuery.data ?? null;
  // projectQuery is disabled while the overview covers it. A disabled query
  // reports `isLoading: false` (v5: `isLoading = isPending && isFetching`, and a
  // disabled query is not fetching) — so reading projectQuery.isLoading here
  // would report "done" while `['project', id]` is still unseeded (project null),
  // flashing an empty render. Anchor the first-paint spinner on the overview so
  // it clears only once the overview resolves and seeds the cache; fall through
  // to projectQuery.isLoading on the overview-failed path where it actually fetches.
  const isLoading = overviewCovers ? overviewQuery.isLoading : projectQuery.isLoading;
  const accessDenied =
    (projectQuery.error instanceof ApiError && projectQuery.error.status === 403) ||
    (overviewQuery.error instanceof ApiError && overviewQuery.error.status === 403);

  // ── react-query: developers (shared global query) ───────────────────────
  const developersQuery = useAllDevelopers<DeveloperResponse>();
  const allDevelopers = developersQuery.data ?? [];

  // ── react-query: sprints ────────────────────────────────────────────────
  const sprintsQuery = useQuery<SprintResponse[]>({
    queryKey: ['sprints', id],
    queryFn: () => apiFetch<SprintResponse[]>(`/api/workitems/projects/${id}/sprints`),
    enabled: !!id && !overviewCovers,
  });
  const sprints = sprintsQuery.data ?? [];

  // ── react-query: hub work items ─────────────────────────────────────────
  const hubWorkItemsQuery = useQuery<HubWorkItem[]>({
    queryKey: ['workItems', { project_id: id }],
    queryFn: async () => {
      const data = await apiFetch<WorkItemListResponse[]>(`/api/workitems/?project_id=${id}`);
      return data.map((item) => ({
        id: item.id,
        key: item.key,
        title: item.title,
        description: item.description,
        type: item.type,
        status: item.status,
        priority: item.priority,
        assignee: item.assignee,
        // HubWorkItem uses `T | undefined`; the wire type is `T | null`.
        assignee_id: item.assignee_id ?? undefined,
        due_date: item.due_date ?? undefined,
        // The list endpoint exposes `start_date` (Gantt planned start); it does
        // not carry the runtime `started_at` column.
        start_date: item.start_date ?? undefined,
        estimated_hours: item.estimated_hours,
        logged_hours: item.logged_hours,
        remaining_hours: item.remaining_hours,
        sprint: item.sprint,
        story_points: item.story_points,
      }));
    },
    enabled: !!id,
  });
  // Stable empty-array default so TimelineView/CalendarView row memos (which
  // depend on these arrays) don't bust on a fresh [] every render. Identity
  // still changes when query data changes, so live updates keep flowing.
  const hubWorkItems = useMemo(() => hubWorkItemsQuery.data ?? [], [hubWorkItemsQuery.data]);

  // ── react-query: goals ──────────────────────────────────────────────────
  const goalsQuery = useQuery<GoalResponse[]>({
    queryKey: ['hubData', id, 'goals'],
    queryFn: () => apiFetch<GoalResponse[]>(`/api/projects/${id}/goals`),
    enabled: !!id && !overviewCovers,
  });
  const goals = useMemo(() => goalsQuery.data ?? [], [goalsQuery.data]);

  // ── react-query: milestones ─────────────────────────────────────────────
  const milestonesQuery = useQuery<MilestoneResponse[]>({
    queryKey: ['hubData', id, 'milestones'],
    queryFn: () => apiFetch<MilestoneResponse[]>(`/api/projects/${id}/milestones`),
    enabled: !!id && !overviewCovers,
  });
  const milestones = useMemo(() => milestonesQuery.data ?? [], [milestonesQuery.data]);

  // ── react-query: activities ─────────────────────────────────────────────
  const activitiesQuery = useQuery<ActivityResponse[]>({
    queryKey: ['hubData', id, 'activities'],
    queryFn: () => apiFetch<ActivityResponse[]>(`/api/projects/${id}/activity`),
    enabled: !!id && !overviewCovers,
  });
  const activities = activitiesQuery.data ?? [];

  // ── react-query: analytics ──────────────────────────────────────────────
  const analyticsQuery = useQuery<ProjectAnalyticsResponse>({
    queryKey: ['hubData', id, 'analytics'],
    queryFn: () => apiFetch<ProjectAnalyticsResponse>(`/api/workitems/projects/${id}/analytics`),
    enabled: !!id && !overviewCovers,
  });
  const analytics = analyticsQuery.data ?? null;

  // ── react-query: PRD analysis ───────────────────────────────────────────
  const prdAnalysisQuery = useQuery<PrdAnalysisResponse>({
    queryKey: ['hubData', id, 'prd'],
    queryFn: () => apiFetch<PrdAnalysisResponse>(`/api/prd/projects/${id}/analysis`),
    enabled: !!id && !overviewCovers,
  });
  const prdAnalysis = prdAnalysisQuery.data ?? null;

  // ── react-query: links ──────────────────────────────────────────────────
  const linksQuery = useQuery<ProjectLinkResponse[]>({
    queryKey: ['project', id, 'links'],
    queryFn: () => apiFetch<ProjectLinkResponse[]>(`/api/projects/${id}/links`),
    enabled: !!id && !overviewCovers,
  });
  const links = linksQuery.data ?? [];
  const linksLoading = overviewCovers ? overviewQuery.isLoading : linksQuery.isLoading;

  // hubLoading: true until all hub sub-resources are done loading. goals /
  // milestones / activities / analytics / prd are gated behind the overview.
  // A disabled query reports `isLoading: false` (v5: isLoading = isPending &&
  // isFetching), so consulting a gated query's isLoading while the overview
  // covers it would report a misleading "done"; anchor their contribution on the
  // overview in that case, and consult the individual queries only on the
  // overview-failed fallback path where they actually fetch. hubWorkItems is
  // never seeded by the overview, so it always contributes its own loading state.
  const seededHubLoading = overviewCovers
    ? overviewQuery.isLoading
    : goalsQuery.isLoading ||
      milestonesQuery.isLoading ||
      activitiesQuery.isLoading ||
      analyticsQuery.isLoading ||
      prdAnalysisQuery.isLoading;
  const hubLoading = hubWorkItemsQuery.isLoading || seededHubLoading;

  // ── mutations: links ────────────────────────────────────────────────────
  const addLinkMutation = useMutation({
    mutationFn: (link: { name: string; url: string }) =>
      apiFetch<ProjectLinkResponse>(`/api/projects/${id}/links`, {
        method: 'POST',
        body: JSON.stringify(link),
      }),
    onSuccess: () => {
      toast.success('Link added!');
    },
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
    },
    onError: toastErrorHandler('add link'),
  });

  const deleteLinkMutation = useMutation({
    mutationFn: (linkId: number) =>
      apiFetch<void>(`/api/projects/${id}/links/${linkId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Link deleted!');
    },
    onError: () => toast.error('Error deleting link'),
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
    },
  });

  const handleAddLink = (link: { name: string; url: string }) => {
    if (!id) return;
    addLinkMutation.mutate(link);
  };

  const handleDeleteLink = (linkId: number) => {
    deleteLinkMutation.mutate(linkId);
  };

  // ── mutations: hub work items ───────────────────────────────────────────
  const taskUpdateMutation = useMutation({
    mutationFn: ({ itemId, updates }: { itemId: string; updates: WorkItemUpdate }) =>
      apiFetch<WorkItemDetailResponse>(`/api/workitems/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    onError: toastErrorHandler('update task'),
    onSettled: () => {
      // A work-item edit doesn't change goals/milestones/prd/links, so only the
      // work-item-derived caches need invalidating — not the full project scope.
      invalidateWorkItemScope(queryClient, id);
    },
  });

  // Task update handler for TimelineView
  const handleTaskUpdate = (itemId: string, updates: WorkItemUpdate) => {
    taskUpdateMutation.mutate({ itemId, updates });
  };

  // ── mutation: save project edits ────────────────────────────────────────
  const saveEditMutation = useMutation({
    mutationFn: (editForm: Partial<ProjectDetailResponse>) => {
      if (!project) throw new Error('No project');
      const updateData: Record<string, string | undefined> = {
        name: editForm.name || undefined,
        description: editForm.description || undefined,
        status: editForm.status || undefined,
        github_repo_url: editForm.github_repo_url || undefined,
        created_at: editForm.created_at || undefined,
        end_date: editForm.end_date || undefined,
      };
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined) delete updateData[key];
      });
      return apiFetch<ProjectDetailResponse>(`/api/projects/${project.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });
    },
    onSuccess: () => {
      toast.success('Project updated!');
    },
    onError: toastErrorHandler('update project'),
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });

  // Save project edits
  const handleSaveEdit = (editForm: Partial<ProjectDetailResponse>) => {
    saveEditMutation.mutate(editForm);
  };

  // ── mutation: add developer ─────────────────────────────────────────────
  const addDeveloperMutation = useMutation({
    mutationFn: (form: { developer_id: string; role: string; responsibilities: string }) => {
      if (!project) throw new Error('No project');
      return apiFetch<void>(`/api/projects/${project.id}/developers`, {
        method: 'POST',
        body: JSON.stringify({
          developer_id: parseInt(form.developer_id),
          role: form.role,
          responsibilities: form.responsibilities,
        }),
      });
    },
    onSuccess: () => {
      toast.success('Developer added!');
    },
    onError: toastErrorHandler('add developer'),
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
      // Cascade-affects work-item assignments on the backend — capacity needs invalidation.
      invalidateAdminMembershipImpact(queryClient);
    },
  });

  // Add developer to project
  const handleAddDeveloper = (form: {
    developer_id: string;
    role: string;
    responsibilities: string;
  }) => {
    if (!project || !form.developer_id) return;
    addDeveloperMutation.mutate(form);
  };

  // ── mutation: remove developer ──────────────────────────────────────────
  const removeDeveloperMutation = useMutation({
    mutationFn: (developerId: number) => {
      if (!project) throw new Error('No project');
      return apiFetch<void>(`/api/projects/${project.id}/developers/${developerId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast.success('Developer removed!');
    },
    onError: toastErrorHandler('remove developer'),
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
      // Cascade-affects work-item assignments on the backend — capacity needs invalidation.
      invalidateAdminMembershipImpact(queryClient);
    },
  });

  // Remove developer from project — gated by the themed confirm dialog
  // (threaded from the orchestrator's useConfirm) instead of native confirm().
  const handleRemoveDeveloper = async (developerId: number) => {
    if (!project) return;
    // Fail safe: a destructive delete must never fire without an explicit
    // confirmation. If no confirm dialog was provided, do nothing rather than
    // silently proceeding.
    if (!options?.confirm) return;
    const confirmed = await options.confirm({
      title: 'Remove developer?',
      description: 'Remove this developer from the project?',
      destructive: true,
      confirmText: 'Remove',
    });
    if (!confirmed) return;
    removeDeveloperMutation.mutate(developerId);
  };

  // ── mutation: promote/demote developer admin ────────────────────────────
  const promoteToAdminMutation = useMutation({
    mutationFn: (developerId: number) => {
      if (!project) throw new Error('No project');
      return apiFetch<void>(`/api/projects/${project.id}/developers/${developerId}/admin`, {
        method: 'PUT',
      });
    },
    onSuccess: () => {
      toast.success('Developer promoted to project admin!');
    },
    onError: toastErrorHandler('promote developer'),
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
    },
  });

  const demoteFromAdminMutation = useMutation({
    mutationFn: (developerId: number) => {
      if (!project) throw new Error('No project');
      return apiFetch<void>(`/api/projects/${project.id}/developers/${developerId}/member`, {
        method: 'PUT',
      });
    },
    onSuccess: () => {
      toast.success('Developer demoted from project admin!');
    },
    onError: toastErrorHandler('demote developer'),
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
    },
  });

  // Promote developer to project admin
  const handlePromoteToAdmin = (developerId: number) => {
    if (!project) return;
    promoteToAdminMutation.mutate(developerId);
  };

  // Demote developer from project admin
  const handleDemoteFromAdmin = (developerId: number) => {
    if (!project) return;
    demoteFromAdminMutation.mutate(developerId);
  };

  // Check if current user can manage project membership (add/remove devs,
  // promote/demote project admins). Three paths grant this:
  //   1. Capability-based (tool admin): `admin.projects` — system admins
  //      managing projects from the admin shell.
  //   2. Capability-based (overview write): `project.overview_write` —
  //      tool-wide grant to edit Overview content (project info + team)
  //      on any project the user can see. Wider than per-project admin
  //      because it spans every project; narrower than `admin.projects`
  //      because it doesn't grant admin-shell access.
  //   3. Project membership: marked is_admin on this specific project's
  //      developers list. Per-project, can't be expressed as a global cap.
  //
  // Mirrors `is_project_admin` in backend/routers/projects.py — if you add
  // a path here, add it there too or the UI will offer actions the backend
  // rejects (and vice versa).
  //
  // Replaces the legacy `user.role.includes('admin')` string match — that
  // check ignored custom roles that had `admin.projects` granted via the
  // role registry but didn't have 'admin' in their role-string column.
  const isCurrentUserAdmin = () => {
    if (!user || !project) return false;
    if (can('admin.projects')) return true;
    if (can('project.overview_write')) return true;
    return (project.developers ?? []).some((dev) => dev.email === user.email && dev.is_admin);
  };

  // ── mutation: save architecture ─────────────────────────────────────────
  const saveArchitectureMutation = useMutation({
    mutationFn: ({
      archId,
      updates,
    }: {
      archId: number;
      updates: { mermaid_code?: string; name?: string; description?: string };
    }) =>
      apiFetch<void>(`/api/prd/architectures/${archId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      toast.success('Architecture updated!');
      options?.onArchitectureSaved?.();
    },
    onError: toastErrorHandler('update architecture'),
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
    },
  });

  // Save architecture changes
  const handleSaveArchitecture = (
    archId: number,
    updates: { mermaid_code?: string; name?: string; description?: string },
  ) => {
    saveArchitectureMutation.mutate({ archId, updates });
  };

  return {
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
  };
};
