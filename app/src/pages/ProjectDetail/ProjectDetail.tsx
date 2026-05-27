import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import {
  invalidateProjectScope,
  invalidateWorkItemScope,
  invalidateAdminMembershipImpact,
} from '@/lib/invalidations';
import {
  ArrowLeft,
  Info,
  LayoutGrid,
  ShieldAlert,
  Clock,
  DollarSign,
  TrendingUp,
  Calendar,
  BarChart3,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resetPulseData } from '@/components/ProjectHub/pulseData';
import { useMergedPulse, usePulseManualData } from '@/components/ProjectHub/usePulseData';
import { toast, Toaster } from 'sonner';
// ArchitectureEditor (modal) is lazy here at the parent since edit state lives at the parent.
// MermaidRenderer is lazy-loaded inside ArchitectureSection.
const ArchitectureEditor = lazy(() => import('@/components/ArchitectureEditor'));
import { useAuth } from '@/contexts/AuthContext';
import ProjectInfoSection from './sections/ProjectInfoSection';
import PRDAnalysisSection from './sections/PRDAnalysisSection';
import ArchitectureSection from './sections/ArchitectureSection';
import TeamSection from './sections/TeamSection';
import LinksSection from './sections/LinksSection';
const TrackerTab = lazy(() => import('./tabs/TrackerTab'));
const TimelineTab = lazy(() => import('./tabs/TimelineTab'));
const PulseTab = lazy(() => import('./tabs/PulseTab'));
const PulseSettingsTab = lazy(() => import('./tabs/PulseSettingsTab'));
const ActivityTab = lazy(() => import('./tabs/ActivityTab'));
const ProjectManagerTab = lazy(() => import('./tabs/ProjectManagerTab'));

interface Developer {
  id: number;
  name: string;
  email: string;
  github_username: string;
  avatar_url?: string;
}

interface ProjectDeveloper {
  id: number;
  name: string;
  email: string;
  github_username: string;
  role: string;
  responsibilities: string;
  is_admin: boolean;
}

interface Architecture {
  id: number;
  name: string;
  description: string;
  architecture_type: string;
  mermaid_code: string;
  pros: string[];
  cons: string[];
  estimated_cost: string;
  complexity: string;
  time_to_implement: string;
  is_selected: boolean;
  created_at: string;
  updated_at: string;
  cost_analysis?: {
    infrastructure?: {
      monthly: string;
      annual: string;
      breakdown: { item: string; cost: string }[];
    };
    development?: { total: string; breakdown: { item: string; cost: string }[] };
    total_estimated?: string;
  };
  tools_recommended?: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
    devops?: string[];
    [key: string]: string[] | undefined;
  };
}

interface PRDAnalysis {
  id: number;
  summary: string;
  key_features: string[];
  technical_requirements: string[];
  cost_analysis?: {
    infrastructure?: {
      monthly: string;
      annual: string;
      breakdown: { item: string; cost: string }[];
    };
    development?: { total: string; breakdown: { item: string; cost: string }[] };
    total_estimated?: string;
  };
  recommended_tools?: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
    devops?: string[];
    [key: string]: string[] | undefined;
  };
  risks: { risk: string; impact: string; mitigation: string }[];
  timeline: { phase: string; duration: string; tasks: string[] }[];
}

interface Sprint {
  id: number;
  name: string;
  goal: string;
  status: 'planned' | 'active' | 'completed';
  start_date?: string;
  end_date?: string;
  capacity_hours: number;
  velocity: number;
  total_items: number;
  todo_count: number;
  in_progress_count: number;
  done_count: number;
  total_points: number;
  completed_points: number;
  completion_pct: number;
}

interface ProjectAnalytics {
  total_items: number;
  total_story_points: number;
  completed_points: number;
  status_distribution: Record<string, number>;
  type_distribution: Record<string, number>;
  priority_distribution: Record<string, number>;
  velocity_data: {
    sprint_name: string;
    committed: number;
    completed: number;
    start_date: string;
  }[];
  burndown_data: { date: string; remaining: number; completed: number }[];
  team_performance: {
    name: string;
    total_items: number;
    completed_items: number;
    total_points: number;
    completed_points: number;
  }[];
}

interface Project {
  id: number;
  name: string;
  description: string;
  key_prefix: string;
  status: string;
  github_repo_url: string;
  github_repo_urls?: string[];
  github_repo_name?: string;
  created_at: string;
  end_date?: string;
  developers?: ProjectDeveloper[];
  selected_architecture?: Architecture;
  architectures: Architecture[];
}

type TabType =
  | 'overview'
  | 'hub'
  | 'tracker'
  | 'calendar'
  | 'pulse'
  | 'pulse_settings'
  | 'goals'
  | 'activity'
  | 'project_manager';

interface HubWorkItem {
  id: string;
  key: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  priority: string;
  assignee?: string;
  assignee_id?: number;
  due_date?: string;
  start_date?: string;
  estimated_hours?: number;
  logged_hours?: number;
  remaining_hours?: number;
  sprint?: string;
  story_points?: number;
}

interface Goal {
  id: number;
  title: string;
  description?: string;
  status: string;
  progress: number;
  due_date?: string;
  completed_at?: string;
}

interface Milestone {
  id: number;
  title: string;
  description?: string;
  due_date?: string;
  completed_at?: string;
  is_completed: boolean;
}

interface ActivityItem {
  id: number;
  action: string;
  entity_type: string;
  entity_id?: number;
  title: string;
  details?: Record<string, any>;
  created_at: string;
  user_name: string;
  user_email?: string;
}

interface ProjectLink {
  id: number;
  name: string;
  url: string;
  created_at?: string;
}

// Shape returned by GET /api/projects/{id}/overview — bundles 8 previously
// separate hub queries into one round trip. Individual useQuery hooks are
// kept as fallback (for cache priming + invalidation routing), but the
// overview query primes their caches so they short-circuit on first paint.
interface ProjectOverview {
  project: Project;
  sprints: Sprint[];
  goals: Goal[];
  milestones: Milestone[];
  activities: ActivityItem[];
  analytics: ProjectAnalytics;
  prdAnalysis: PRDAnalysis;
  links: ProjectLink[];
}

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, can } = useAuth();
  const queryClient = useQueryClient();

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
  const [editingArchitecture, setEditingArchitecture] = useState<Architecture | null>(null);

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

  // ── react-query: project ────────────────────────────────────────────────
  const projectQuery = useQuery<Project>({
    queryKey: ['project', id],
    queryFn: () => apiFetch<Project>(`/api/projects/${id}`),
    enabled: !!id,
  });
  const project = projectQuery.data ?? null;
  const isLoading = projectQuery.isLoading;
  const accessDenied = projectQuery.error instanceof ApiError && projectQuery.error.status === 403;

  // Show toast when 403 is encountered
  useEffect(() => {
    if (accessDenied) {
      toast.error('You do not have access to this project');
    }
  }, [accessDenied]);

  // ── react-query: developers ─────────────────────────────────────────────
  const developersQuery = useQuery<Developer[]>({
    queryKey: ['developers'],
    queryFn: () => apiFetch<Developer[]>('/api/developers/'),
  });
  const allDevelopers = developersQuery.data ?? [];

  // ── react-query: sprints ────────────────────────────────────────────────
  const sprintsQuery = useQuery<Sprint[]>({
    queryKey: ['sprints', id],
    queryFn: () => apiFetch<Sprint[]>(`/api/workitems/projects/${id}/sprints`),
    enabled: !!id,
  });
  const sprints = sprintsQuery.data ?? [];

  // ── react-query: hub work items ─────────────────────────────────────────
  const hubWorkItemsQuery = useQuery<HubWorkItem[]>({
    queryKey: ['workItems', { project_id: id }],
    queryFn: async () => {
      const data = await apiFetch<any[]>(`/api/workitems/?project_id=${id}`);
      return data.map((item: any) => ({
        id: item.id,
        key: item.key,
        title: item.title,
        description: item.description,
        type: item.type,
        status: item.status,
        priority: item.priority,
        assignee: item.assignee,
        assignee_id: item.assignee_id,
        due_date: item.due_date,
        start_date: item.start_date || item.started_at,
        estimated_hours: item.estimated_hours,
        logged_hours: item.logged_hours,
        remaining_hours: item.remaining_hours,
        sprint: item.sprint,
        story_points: item.story_points,
      }));
    },
    enabled: !!id,
  });
  const hubWorkItems = hubWorkItemsQuery.data ?? [];

  // ── react-query: goals ──────────────────────────────────────────────────
  const goalsQuery = useQuery<Goal[]>({
    queryKey: ['hubData', id, 'goals'],
    queryFn: () => apiFetch<Goal[]>(`/api/projects/${id}/goals`),
    enabled: !!id,
  });
  const goals = goalsQuery.data ?? [];

  // ── react-query: milestones ─────────────────────────────────────────────
  const milestonesQuery = useQuery<Milestone[]>({
    queryKey: ['hubData', id, 'milestones'],
    queryFn: () => apiFetch<Milestone[]>(`/api/projects/${id}/milestones`),
    enabled: !!id,
  });
  const milestones = milestonesQuery.data ?? [];

  // ── react-query: activities ─────────────────────────────────────────────
  const activitiesQuery = useQuery<ActivityItem[]>({
    queryKey: ['hubData', id, 'activities'],
    queryFn: () => apiFetch<ActivityItem[]>(`/api/projects/${id}/activity`),
    enabled: !!id,
  });
  const activities = activitiesQuery.data ?? [];

  // ── react-query: analytics ──────────────────────────────────────────────
  const analyticsQuery = useQuery<ProjectAnalytics>({
    queryKey: ['hubData', id, 'analytics'],
    queryFn: () => apiFetch<ProjectAnalytics>(`/api/workitems/projects/${id}/analytics`),
    enabled: !!id,
  });
  const analytics = analyticsQuery.data ?? null;

  // ── react-query: PRD analysis ───────────────────────────────────────────
  const prdAnalysisQuery = useQuery<PRDAnalysis>({
    queryKey: ['hubData', id, 'prd'],
    queryFn: () => apiFetch<PRDAnalysis>(`/api/prd/projects/${id}/analysis`),
    enabled: !!id,
  });
  const prdAnalysis = prdAnalysisQuery.data ?? null;

  // ── react-query: links ──────────────────────────────────────────────────
  const linksQuery = useQuery<ProjectLink[]>({
    queryKey: ['project', id, 'links'],
    queryFn: () => apiFetch<ProjectLink[]>(`/api/projects/${id}/links`),
    enabled: !!id,
  });
  const links = linksQuery.data ?? [];
  const linksLoading = linksQuery.isLoading;

  // hubLoading: true until all hub sub-resources are done loading
  const hubLoading =
    hubWorkItemsQuery.isLoading ||
    goalsQuery.isLoading ||
    milestonesQuery.isLoading ||
    activitiesQuery.isLoading ||
    analyticsQuery.isLoading ||
    prdAnalysisQuery.isLoading;

  // ── mutations: links ────────────────────────────────────────────────────
  const addLinkMutation = useMutation({
    mutationFn: (link: { name: string; url: string }) =>
      apiFetch<ProjectLink>(`/api/projects/${id}/links`, {
        method: 'POST',
        body: JSON.stringify(link),
      }),
    onSuccess: () => {
      toast.success('Link added!');
    },
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
    },
    onError: () => toast.error('Failed to add link'),
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
    mutationFn: ({ itemId, updates }: { itemId: string; updates: any }) =>
      apiFetch<any>(`/api/workitems/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    onError: () => toast.error('Failed to update task'),
    onSettled: () => {
      invalidateWorkItemScope(queryClient, id);
      invalidateProjectScope(queryClient, id);
    },
  });

  const taskCreateMutation = useMutation({
    mutationFn: (taskData: any) =>
      apiFetch<any>('/api/workitems/', {
        method: 'POST',
        body: JSON.stringify({ ...taskData, project_id: id }),
      }),
    onSuccess: () => {
      toast.success('Task created!');
    },
    onError: () => toast.error('Failed to create task'),
    onSettled: () => {
      invalidateWorkItemScope(queryClient, id);
      invalidateProjectScope(queryClient, id);
    },
  });

  // Task update/create handlers for TimelineView
  const handleTaskUpdate = (itemId: string, updates: any) => {
    taskUpdateMutation.mutate({ itemId, updates });
  };

  const handleTaskCreate = (taskData: any) => {
    taskCreateMutation.mutate(taskData);
  };

  // ── mutation: save project edits ────────────────────────────────────────
  const saveEditMutation = useMutation({
    mutationFn: (editForm: Partial<Project>) => {
      if (!project) throw new Error('No project');
      const updateData: any = {
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
      console.log('Sending update data:', updateData);
      return apiFetch<Project>(`/api/projects/${project.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });
    },
    onSuccess: (responseData) => {
      console.log('Update response:', responseData);
      toast.success('Project updated!');
    },
    onError: (err: any) => {
      console.error('Error updating project:', err);
      toast.error(err?.message || 'Failed to update project');
    },
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });

  // Save project edits
  const handleSaveEdit = (editForm: Partial<Project>) => {
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
    onError: () => toast.error('Failed to add developer'),
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
    onError: () => toast.error('Failed to remove developer'),
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
      // Cascade-affects work-item assignments on the backend — capacity needs invalidation.
      invalidateAdminMembershipImpact(queryClient);
    },
  });

  // Remove developer from project
  const handleRemoveDeveloper = (developerId: number) => {
    if (!project) return;
    if (!confirm('Remove this developer from the project?')) return;
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
    onError: (err: any) => toast.error(err?.message || 'Failed to promote developer'),
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
    onError: (err: any) => toast.error(err?.message || 'Failed to demote developer'),
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

  // Check if current user is a system admin or project admin
  const isCurrentUserAdmin = () => {
    if (!user || !project) return false;
    const isSystemAdmin = user.role.includes('admin');
    const isProjectAdmin = (project.developers ?? []).some(
      (dev) => dev.email === user.email && dev.is_admin,
    );
    return isSystemAdmin || isProjectAdmin;
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
      setEditingArchitecture(null);
    },
    onError: () => toast.error('Failed to update architecture'),
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080808] text-[#F4F6FF]">
        {/* Skeleton Header */}
        <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/95 sticky top-0 z-40">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-8 w-24 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse" />
              <div className="w-px h-6 bg-[rgba(255,255,255,0.07)]" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.06)] animate-pulse" />
                <div className="space-y-1.5">
                  <div className="h-4 w-36 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
                  <div className="h-3 w-16 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
                </div>
              </div>
            </div>
            <div className="h-9 w-28 bg-[rgba(255,255,255,0.06)] rounded-xl animate-pulse" />
          </div>
          {/* Skeleton Tabs */}
          <div className="px-6 flex gap-1 border-t border-[rgba(255,255,255,0.03)]">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="h-10 w-24 bg-[rgba(255,255,255,0.04)] rounded-t-lg animate-pulse mx-1"
              />
            ))}
          </div>
        </header>
        {/* Skeleton Content */}
        <main className="px-6 py-4 max-w-7xl mx-auto space-y-4">
          {/* Stat cards row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5"
              >
                <div className="h-3 w-16 bg-[rgba(255,255,255,0.06)] rounded animate-pulse mb-3" />
                <div className="h-8 w-12 bg-[rgba(255,255,255,0.07)] rounded animate-pulse mb-1" />
                <div className="h-1.5 w-full bg-[rgba(255,255,255,0.04)] rounded-full animate-pulse" />
              </div>
            ))}
          </div>
          {/* Content block */}
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 space-y-4">
            <div className="h-5 w-40 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-3 rounded animate-pulse"
                  style={{ width: `${90 - i * 8}%`, backgroundColor: 'rgba(255,255,255,0.04)' }}
                />
              ))}
            </div>
          </div>
          {/* Second content block */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 space-y-3"
              >
                <div className="h-4 w-32 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.06)] animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 w-3/4 bg-[rgba(255,255,255,0.05)] rounded animate-pulse" />
                      <div className="h-2.5 w-1/2 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </main>
      </div>
    );
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

  // PM tab access: capability-gated for system roles (admin / PM grant
  // `project.pm`), with a project-membership fallback so a developer marked
  // `is_admin` on this specific project also sees the tab. The
  // project-admin case isn't expressible as a global capability, so it
  // stays as an inline check on top of the role-based grant.
  const canAccessPMTab = () => {
    if (can('project.pm')) return true;
    if (!user || !project) return false;
    return (project.developers ?? []).some((dev) => dev.email === user.email && dev.is_admin);
  };
  const canAccessPulseSettings = can('project.pulse.settings');

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: Info },
    { id: 'tracker' as TabType, label: 'Project Tracker', icon: BarChart3 },
    { id: 'calendar' as TabType, label: 'Timeline', icon: Calendar },
    { id: 'pulse' as TabType, label: 'Pulse', icon: TrendingUp },
    { id: 'activity' as TabType, label: 'Activity', icon: Activity },
    ...(canAccessPMTab()
      ? [{ id: 'project_manager' as TabType, label: 'Project Manager', icon: Clock }]
      : []),
    ...(canAccessPulseSettings
      ? [{ id: 'pulse_settings' as TabType, label: 'Pulse Settings', icon: DollarSign }]
      : []),
  ];

  // Filter out developers already in project
  const availableDevelopers = allDevelopers.filter(
    (d) => !(project.developers ?? []).some((pd) => pd.id === d.id),
  );

  return (
    <div className="min-h-screen bg-[#080808] text-[#F4F6FF]">
      <Toaster position="top-right" theme="dark" richColors />

      {/* Header */}
      <header className="border-b border-[rgba(224,185,84,0.15)] bg-[#080808]/95 backdrop-blur-xl sticky top-0 z-40 shadow-[0_1px_0_0_rgba(224,185,84,0.08)]">
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
            <Button
              onClick={() => navigate(`/project/${project.id}/board`)}
              className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] rounded-xl font-semibold shadow-lg shadow-[#E0B954]/20 h-9 px-4"
            >
              <LayoutGrid className="w-4 h-4 mr-2" />
              Open Board
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 flex gap-1 border-t border-[rgba(255,255,255,0.03)]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'text-white border-[#E0B954] drop-shadow-[0_0_8px_rgba(224,185,84,0.6)]'
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

      {/* Content */}
      <main className="px-6 py-4 max-w-7xl mx-auto">
        {/* Overview Tab */}
        {activeTab === 'overview' &&
          (hubLoading ? (
            // Full overview skeleton — shown until ALL data (analytics, PRD) is ready
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
          ) : (
            <div className="space-y-4">
              <ProjectInfoSection project={project} onSave={handleSaveEdit} />

              {/* PRD Analysis Section */}
              {prdAnalysis && <PRDAnalysisSection prdAnalysis={prdAnalysis} />}

              {/* Architecture Section */}
              {project.selected_architecture && (
                <ArchitectureSection
                  architecture={project.selected_architecture}
                  onEdit={setEditingArchitecture}
                  onOpenBoard={() => navigate(`/project/${project.id}/board`)}
                />
              )}

              {/* Team Section */}
              <TeamSection
                developers={project.developers ?? []}
                availableDevelopers={availableDevelopers}
                isCurrentUserAdmin={isCurrentUserAdmin()}
                onAddDeveloper={handleAddDeveloper}
                onRemoveDeveloper={handleRemoveDeveloper}
                onPromoteToAdmin={handlePromoteToAdmin}
                onDemoteFromAdmin={handleDemoteFromAdmin}
              />
            </div>
          ))}
        {/* Files/Links Section */}
        {activeTab === 'overview' && !hubLoading && (
          <LinksSection
            links={links}
            isLoading={linksLoading}
            onAddLink={handleAddLink}
            onDeleteLink={handleDeleteLink}
          />
        )}

        <Suspense fallback={<div className="text-sm text-muted-foreground p-6">Loading...</div>}>
          {/* Project Tracker Tab */}
          {activeTab === 'tracker' && (
            <TrackerTab
              hubLoading={hubLoading}
              sprints={sprints}
              analytics={analytics}
              sprintsExpanded={sprintsExpanded}
              setSprintsExpanded={setSprintsExpanded}
            />
          )}

          {/* Timeline Tab (Calendar + Timeline) */}
          {activeTab === 'calendar' && (
            <TimelineTab
              hubLoading={hubLoading}
              hubWorkItems={hubWorkItems}
              milestones={milestones}
              goals={goals}
              projectStartDate={project.created_at}
              projectId={parseInt(id!)}
              developers={(project.developers ?? []).map((d) => ({
                id: d.id,
                name: d.name,
                email: d.email,
              }))}
              onTaskUpdate={handleTaskUpdate}
              onTaskCreate={handleTaskCreate}
            />
          )}

          {/* Pulse Tab (was Business Review) */}
          {activeTab === 'pulse' && (
            <PulseTab
              hubLoading={hubLoading}
              pulseData={mergedPulseData}
              degradedSections={pulseDegradedSections}
            />
          )}

          {/* Pulse Settings Tab — gated on `project.pulse.settings` capability */}
          {activeTab === 'pulse_settings' &&
            (canAccessPulseSettings && id && pulseData ? (
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

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <ActivityTab hubLoading={hubLoading} activities={activities} />
          )}

          {/* Project Manager Tab — capability-gated; only renders when canAccessPMTab() is true */}
          {activeTab === 'project_manager' && canAccessPMTab() && (
            <ProjectManagerTab hubLoading={hubLoading} projectId={id!} sprints={sprints} />
          )}
        </Suspense>
      </main>

      {/* Architecture Editor Modal */}
      {editingArchitecture && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-[#E0B954]/30 border-t-[#E0B954] rounded-full animate-spin" />
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
