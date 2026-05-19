import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import {
  ArrowLeft,
  Users,
  Github,
  Info,
  Pencil,
  Save,
  X,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  Layers,
  Sparkles,
  ShieldAlert,
  Zap,
  Clock,
  DollarSign,
  Target,
  TrendingUp,
  AlertTriangle,
  Wrench,
  Calendar,
  FileText,
  BarChart3,
  Activity,
  ChevronDown,
  ChevronUp,
  Link2,
  Crown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import PMView from '@/components/PMView';
import {
  TimelineView,
  CalendarView,
  ActivityFeed,
  ProjectPulseView,
  PulseSettingsView,
} from '@/components/ProjectHub';
import { PulseData, loadPulseData } from '@/components/ProjectHub/pulseData';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { toast, Toaster } from 'sonner';
const MermaidRenderer = lazy(() => import('@/components/MermaidRenderer'));
const ArchitectureEditor = lazy(() => import('@/components/ArchitectureEditor'));
import { useAuth } from '@/contexts/AuthContext';
import { parseLocalDateOptional as parseLocalDate } from '@/lib/dates';

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
  developers: ProjectDeveloper[];
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
  // searchParams + setSearchParams included in deps to satisfy
  // exhaustive-deps; the current !== activeTab guard prevents loops.
  // The setSearchParams call inside the effect is the intended URL→state
  // mirror, hence the per-statement disable.
  useEffect(() => {
    const current = searchParams.get('tab');
    if (current !== activeTab) {
      const next = new URLSearchParams(searchParams);
      if (activeTab === 'overview') next.delete('tab');
      else next.set('tab', activeTab);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirroring activeTab into the URL is the whole point of this effect
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Project>>({});
  const [showAddDeveloper, setShowAddDeveloper] = useState(false);
  const [newDeveloper, setNewDeveloper] = useState({
    developer_id: '',
    role: '',
    responsibilities: '',
  });

  // Architecture editing state
  const [editingArchitecture, setEditingArchitecture] = useState<Architecture | null>(null);

  const [sprintsExpanded, setSprintsExpanded] = useState(false);

  // Pulse view data — admin-edited variables, hydrated from localStorage with dummy defaults.
  // Effect form is intentional: id can change via in-place navigation, so we
  // re-hydrate from storage when it does. Same pattern as on main.
  const [pulseData, setPulseData] = useState<PulseData | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) setPulseData(loadPulseData(id));
  }, [id]);

  // Calendar pickers for start & end dates
  const [showCalendarStartDate, setShowCalendarStartDate] = useState(false);
  const [showCalendarEndDate, setShowCalendarEndDate] = useState(false);

  // Files/Links state
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLink, setNewLink] = useState({ name: '', url: '' });
  const addLinkFormRef = useRef<HTMLDivElement>(null);

  // Scroll to add link form when it opens
  useEffect(() => {
    if (showAddLink && addLinkFormRef.current) {
      addLinkFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showAddLink]);

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
    mutationFn: () =>
      apiFetch<ProjectLink>(`/api/projects/${id}/links`, {
        method: 'POST',
        body: JSON.stringify(newLink),
      }),
    onSuccess: () => {
      toast.success('Link added!');
      setNewLink({ name: '', url: '' });
      setShowAddLink(false);
      queryClient.invalidateQueries({ queryKey: ['project', id, 'links'] });
    },
    onError: () => toast.error('Failed to add link'),
  });

  const deleteLinkMutation = useMutation({
    mutationFn: (linkId: number) =>
      apiFetch<void>(`/api/projects/${id}/links/${linkId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Link deleted!');
      queryClient.invalidateQueries({ queryKey: ['project', id, 'links'] });
    },
    onError: () => toast.error('Error deleting link'),
  });

  const handleAddLink = () => {
    if (!id || !newLink.name || !newLink.url) return;
    addLinkMutation.mutate();
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    },
    onError: () => toast.error('Failed to update task'),
  });

  const taskCreateMutation = useMutation({
    mutationFn: (taskData: any) =>
      apiFetch<any>('/api/workitems/', {
        method: 'POST',
        body: JSON.stringify({ ...taskData, project_id: id }),
      }),
    onSuccess: () => {
      toast.success('Task created!');
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    },
    onError: () => toast.error('Failed to create task'),
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
    mutationFn: () => {
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
      return apiFetch<Project>(`/api/projects/${project.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });
    },
    onSuccess: () => {
      toast.success('Project updated!');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err: any) => {
      console.error('Error updating project:', err);
      toast.error(err?.message || 'Failed to update project');
    },
  });

  // Save project edits
  const handleSaveEdit = () => {
    saveEditMutation.mutate();
  };

  // ── mutation: add developer ─────────────────────────────────────────────
  const addDeveloperMutation = useMutation({
    mutationFn: () => {
      if (!project) throw new Error('No project');
      return apiFetch<void>(`/api/projects/${project.id}/developers`, {
        method: 'POST',
        body: JSON.stringify({
          developer_id: parseInt(newDeveloper.developer_id),
          role: newDeveloper.role,
          responsibilities: newDeveloper.responsibilities,
        }),
      });
    },
    onSuccess: () => {
      toast.success('Developer added!');
      setShowAddDeveloper(false);
      setNewDeveloper({ developer_id: '', role: '', responsibilities: '' });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
    onError: () => toast.error('Failed to add developer'),
  });

  // Add developer to project
  const handleAddDeveloper = () => {
    if (!project || !newDeveloper.developer_id) return;
    addDeveloperMutation.mutate();
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
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
    onError: () => toast.error('Failed to remove developer'),
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
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to promote developer'),
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
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to demote developer'),
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
    const isProjectAdmin = project.developers.some(
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
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
    onError: () => toast.error('Failed to update architecture'),
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
    return project.developers.some((dev) => dev.email === user.email && dev.is_admin);
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
    (d) => !project.developers.some((pd) => pd.id === d.id),
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
              <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-white">Project Information</h2>
                  {!isEditing ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditForm(project);
                        setIsEditing(true);
                      }}
                      className="text-[#737373] hover:text-white"
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsEditing(false);
                          setEditForm(project);
                        }}
                        className="text-[#737373] hover:text-white"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        className="bg-[#E0B954] hover:bg-[#C79E3B] text-white"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1.5">
                        Project Name
                      </label>
                      <Input
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1.5">
                        Description
                      </label>
                      <Textarea
                        value={editForm.description || ''}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, description: e.target.value }))
                        }
                        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[120px]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1.5">
                        GitHub Repository URL
                      </label>
                      <Input
                        value={editForm.github_repo_url || ''}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, github_repo_url: e.target.value }))
                        }
                        placeholder="https://github.com/username/repo"
                        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-[#737373] block mb-1.5">
                          Start Date
                        </label>
                        <Popover
                          open={showCalendarStartDate}
                          onOpenChange={setShowCalendarStartDate}
                        >
                          <PopoverTrigger asChild>
                            <Button className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10">
                              <Calendar className="w-4 h-4 mr-2" />
                              {editForm.created_at
                                ? parseLocalDate(editForm.created_at)?.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })
                                : 'Pick a date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-auto p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]"
                            align="start"
                          >
                            <CalendarIcon
                              mode="single"
                              selected={parseLocalDate(
                                editForm.created_at === null ? undefined : editForm.created_at,
                              )}
                              onSelect={(date) => {
                                if (date) {
                                  const year = date.getFullYear();
                                  const month = String(date.getMonth() + 1).padStart(2, '0');
                                  const day = String(date.getDate()).padStart(2, '0');
                                  setEditForm((f) => ({
                                    ...f,
                                    created_at: `${year}-${month}-${day}`,
                                  }));
                                  setShowCalendarStartDate(false);
                                }
                              }}
                              classNames={{
                                months: 'flex flex-col',
                                month: 'space-y-4',
                                caption:
                                  'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                                caption_label: 'text-sm font-medium text-white',
                                nav: 'space-x-1 flex items-center',
                                nav_button:
                                  'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
                                nav_button_previous: 'absolute left-0',
                                nav_button_next: 'absolute right-0',
                                table: 'w-full border-collapse space-y-1',
                                head_row: 'flex gap-1 mb-1',
                                head_cell: 'w-8 h-8 rounded text-[#737373] font-normal text-sm',
                                row: 'flex gap-1 mb-1',
                                cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
                                day: 'p-0 h-8 w-8 rounded bg-transparent text-white text-sm cursor-pointer hover:bg-[rgba(224,185,84,0.1)]',
                                day_selected:
                                  'bg-[#E0B954] text-[#0d0d0d] font-medium hover:bg-[#E0B954]',
                                day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954]',
                                day_outside: 'text-[#555]',
                                day_disabled: 'text-[#333] cursor-not-allowed',
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-[#737373] block mb-1.5">
                          End Date
                        </label>
                        <Popover open={showCalendarEndDate} onOpenChange={setShowCalendarEndDate}>
                          <PopoverTrigger asChild>
                            <Button className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10">
                              <Calendar className="w-4 h-4 mr-2" />
                              {editForm.end_date
                                ? parseLocalDate(editForm.end_date)?.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })
                                : 'Pick a date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-auto p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]"
                            align="start"
                          >
                            <CalendarIcon
                              mode="single"
                              selected={parseLocalDate(
                                editForm.end_date === null ? undefined : editForm.end_date,
                              )}
                              onSelect={(date) => {
                                if (date) {
                                  const year = date.getFullYear();
                                  const month = String(date.getMonth() + 1).padStart(2, '0');
                                  const day = String(date.getDate()).padStart(2, '0');
                                  setEditForm((f) => ({
                                    ...f,
                                    end_date: `${year}-${month}-${day}`,
                                  }));
                                  setShowCalendarEndDate(false);
                                }
                              }}
                              classNames={{
                                months: 'flex flex-col',
                                month: 'space-y-4',
                                caption:
                                  'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                                caption_label: 'text-sm font-medium text-white',
                                nav: 'space-x-1 flex items-center',
                                nav_button:
                                  'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
                                nav_button_previous: 'absolute left-0',
                                nav_button_next: 'absolute right-0',
                                table: 'w-full border-collapse space-y-1',
                                head_row: 'flex gap-1 mb-1',
                                head_cell: 'w-8 h-8 rounded text-[#737373] font-normal text-sm',
                                row: 'flex gap-1 mb-1',
                                cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
                                day: 'p-0 h-8 w-8 rounded bg-transparent text-white text-sm cursor-pointer hover:bg-[rgba(224,185,84,0.1)]',
                                day_selected:
                                  'bg-[#E0B954] text-[#0d0d0d] font-medium hover:bg-[#E0B954]',
                                day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954]',
                                day_outside: 'text-[#555]',
                                day_disabled: 'text-[#333] cursor-not-allowed',
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1">
                        Description
                      </label>
                      <p className="text-sm text-[#f5f5f5] leading-relaxed">
                        {project.description || 'No description provided.'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#737373] block mb-1">
                        GitHub Repository
                      </label>
                      {project.github_repo_url ? (
                        <a
                          href={project.github_repo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-[#E0B954] hover:underline"
                        >
                          <Github className="w-4 h-4" />
                          {project.github_repo_url}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <p className="text-sm text-[#737373]">No repository configured</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 pt-3 border-t border-[rgba(255,255,255,0.05)] flex-wrap">
                      <div>
                        <span className="text-xs text-[#737373]">Start Date</span>
                        <p className="text-sm text-[#f5f5f5]">
                          {new Date(project.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-[#737373]">End Date</span>
                        <p className="text-sm text-[#f5f5f5]">
                          {parseLocalDate(project.end_date)?.toLocaleDateString() ?? 'Not set'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#E0B954]/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-[#E0B954]" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{project.developers.length}</p>
                      <p className="text-xs text-[#737373]">Developers</p>
                    </div>
                  </div>
                </div>
                <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#E0B954]/10 flex items-center justify-center">
                      <Github className="w-5 h-5 text-[#E0B954]" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">
                        {(Array.isArray(project.github_repo_urls) &&
                          project.github_repo_urls.length > 0) ||
                        project.github_repo_url
                          ? 'Yes'
                          : 'No'}
                      </p>
                      <p className="text-xs text-[#737373]">GitHub Repos</p>
                    </div>
                  </div>
                </div>
                <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center">
                      <Info className="w-5 h-5 text-[#F59E0B]" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{project.key_prefix}</p>
                      <p className="text-xs text-[#737373]">Key Prefix</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* PRD Analysis Section */}
              {prdAnalysis && (
                <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Project Overview</h3>
                      <p className="text-xs text-[#737373]">Generated from PRD</p>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="mb-3">
                    <h4 className="text-sm font-medium text-[#a3a3a3] mb-1.5">Summary</h4>
                    <p className="text-sm text-[#f5f5f5] leading-relaxed">{prdAnalysis.summary}</p>
                  </div>

                  {/* Key Features */}
                  {prdAnalysis.key_features && prdAnalysis.key_features.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-[#a3a3a3] mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4 text-[#E0B954]" />
                        Key Features
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {prdAnalysis.key_features.map((feature, idx) => (
                          <Badge
                            key={idx}
                            className="bg-[#E0B954]/10 text-[#E0B954] border border-[#E0B954]/20 hover:bg-[#E0B954]/20"
                          >
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Technical Requirements */}
                  {prdAnalysis.technical_requirements &&
                    prdAnalysis.technical_requirements.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-[#a3a3a3] mb-3 flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-[#E0B954]" />
                          Technical Requirements
                        </h4>
                        <ul className="space-y-2">
                          {prdAnalysis.technical_requirements.map((req, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-[#f5f5f5]">
                              <CheckCircle2 className="w-4 h-4 text-[#E0B954] mt-0.5 flex-shrink-0" />
                              {req}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* Recommended Tools */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-[#a3a3a3] mb-3 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-[#F59E0B]" />
                      Recommended Tools
                    </h4>
                    {prdAnalysis.recommended_tools &&
                    Object.keys(prdAnalysis.recommended_tools).length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(prdAnalysis.recommended_tools).map(
                          ([category, tools]) =>
                            tools &&
                            Array.isArray(tools) &&
                            tools.length > 0 && (
                              <div
                                key={category}
                                className="bg-[rgba(255,255,255,0.025)] rounded-xl p-3"
                              >
                                <p className="text-xs font-medium text-[#737373] capitalize mb-2">
                                  {category}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {tools.slice(0, 3).map((tool, idx) => (
                                    <span
                                      key={idx}
                                      className="text-xs bg-[rgba(224,185,84,0.1)] text-[#E0B954] px-2 py-0.5 rounded"
                                    >
                                      {tool}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ),
                        )}
                      </div>
                    ) : (
                      <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 text-center">
                        <p className="text-sm text-[#737373]">
                          No recommended tools data available. Re-analyze PRD to generate.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Cost Analysis - Infrastructure Only */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-[#a3a3a3] mb-3 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-[#E0B954]" />
                      Infrastructure Cost Analysis
                    </h4>
                    {prdAnalysis.cost_analysis?.infrastructure ? (
                      <div className="bg-[rgba(224,185,84,0.05)] border border-[rgba(224,185,84,0.2)] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-xs text-[#737373]">Monthly Cost</p>
                            <p className="text-2xl font-bold text-[#E0B954]">
                              {prdAnalysis.cost_analysis.infrastructure.monthly || 'N/A'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-[#737373]">Annual Cost</p>
                            <p className="text-lg font-bold text-[#E0B954]">
                              {prdAnalysis.cost_analysis.infrastructure.annual || 'N/A'}
                            </p>
                          </div>
                        </div>
                        {prdAnalysis.cost_analysis.infrastructure.breakdown &&
                          prdAnalysis.cost_analysis.infrastructure.breakdown.length > 0 && (
                            <div className="border-t border-[rgba(224,185,84,0.2)] pt-3">
                              <p className="text-xs font-medium text-[#737373] mb-2">
                                Detailed Breakdown
                              </p>
                              <div className="space-y-2">
                                {prdAnalysis.cost_analysis.infrastructure.breakdown.map(
                                  (item, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between py-1.5 px-2 bg-[rgba(255,255,255,0.025)] rounded-lg"
                                    >
                                      <span className="text-sm text-[#f5f5f5]">{item.item}</span>
                                      <span className="text-sm font-medium text-[#E0B954]">
                                        {item.cost}
                                      </span>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 text-center">
                        <p className="text-sm text-[#737373]">
                          No infrastructure cost data available. Re-analyze PRD to generate.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Risks */}
                  {prdAnalysis.risks && prdAnalysis.risks.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-[#a3a3a3] mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
                        Initial Risk Assessment
                      </h4>
                      <div className="space-y-3">
                        {prdAnalysis.risks.map((risk, idx) => (
                          <div
                            key={idx}
                            className="bg-[rgba(245,158,11,0.05)] border border-[rgba(245,158,11,0.2)] rounded-xl p-4"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <p className="text-sm font-medium text-[#F59E0B]">{risk.risk}</p>
                              <Badge className="bg-[#F59E0B]/10 text-[#F59E0B] border-0 text-xs">
                                {risk.impact}
                              </Badge>
                            </div>
                            <p className="text-xs text-[#a3a3a3]">
                              <span className="text-[#737373]">Mitigation:</span> {risk.mitigation}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  <div>
                    <h4 className="text-sm font-medium text-[#a3a3a3] mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#E0B954]" />
                      Project Timeline
                    </h4>
                    {prdAnalysis.timeline && prdAnalysis.timeline.length > 0 ? (
                      <div className="space-y-3">
                        {prdAnalysis.timeline.map((phase, idx) => (
                          <div key={idx} className="flex items-start gap-4">
                            <div className="w-8 h-8 rounded-full bg-[#E0B954]/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-[#E0B954]">{idx + 1}</span>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-medium text-white">{phase.phase}</p>
                                <span className="text-xs text-[#E0B954]">{phase.duration}</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {phase.tasks &&
                                  phase.tasks.slice(0, 3).map((task, taskIdx) => (
                                    <span
                                      key={taskIdx}
                                      className="text-xs bg-[rgba(255,255,255,0.025)] text-[#a3a3a3] px-2 py-0.5 rounded"
                                    >
                                      {task}
                                    </span>
                                  ))}
                                {phase.tasks && phase.tasks.length > 3 && (
                                  <span className="text-xs text-[#737373]">
                                    +{phase.tasks.length - 3} more
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 text-center">
                        <p className="text-sm text-[#737373]">
                          No timeline data available. Provide a PRD with timeline details to
                          generate phases.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Architecture Section */}
              {project.selected_architecture &&
                (() => {
                  const arch = project.selected_architecture!;
                  return (
                    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden">
                      <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Layers className="w-5 h-5 text-[#E0B954]" />
                          <div>
                            <h3 className="font-semibold text-white">Selected Architecture</h3>
                            <p className="text-xs text-[#737373]">{arch.name}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingArchitecture(arch)}
                            className="text-[#737373] hover:text-white"
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => navigate(`/project/${project.id}/board`)}
                            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white"
                          >
                            <Sparkles className="w-4 h-4 mr-2" />
                            AI Generate
                          </Button>
                        </div>
                      </div>
                      <div className="p-4 bg-[#080808] min-h-[400px]">
                        <Suspense
                          fallback={
                            <div className="flex items-center justify-center p-8">
                              <div className="w-8 h-8 border-2 border-[#E0B954]/30 border-t-[#E0B954] rounded-full animate-spin" />
                            </div>
                          }
                        >
                          <MermaidRenderer
                            code={arch.mermaid_code}
                            className="w-full h-full min-h-[350px]"
                          />
                        </Suspense>
                      </div>

                      {/* Architecture Details */}
                      <div className="p-4 border-t border-[rgba(255,255,255,0.05)] space-y-4">
                        {/* Quick Stats Row */}
                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-[rgba(255,255,255,0.02)] rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <TrendingUp className="w-4 h-4 text-[#F59E0B]" />
                              <span className="text-xs text-[#737373]">Complexity</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-lg font-bold text-[#F59E0B] capitalize">
                                {arch.complexity}
                              </p>
                              <div className="flex gap-0.5">
                                {[1, 2, 3].map((level) => (
                                  <div
                                    key={level}
                                    className={`w-2 h-2 rounded-full ${
                                      arch.complexity === 'high'
                                        ? 'bg-[#F59E0B]'
                                        : arch.complexity === 'medium' && level <= 2
                                          ? 'bg-[#F59E0B]'
                                          : arch.complexity === 'low' && level === 1
                                            ? 'bg-[#F59E0B]'
                                            : 'bg-[#334155]'
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="bg-[rgba(255,255,255,0.02)] rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Clock className="w-4 h-4 text-[#E0B954]" />
                              <span className="text-xs text-[#737373]">Timeline</span>
                            </div>
                            <p className="text-lg font-bold text-[#E0B954]">
                              {arch.time_to_implement}
                            </p>
                          </div>
                          <div className="bg-[rgba(255,255,255,0.02)] rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <DollarSign className="w-4 h-4 text-[#E0B954]" />
                              <span className="text-xs text-[#737373]">Est. Cost</span>
                            </div>
                            <p className="text-lg font-bold text-[#E0B954]">
                              {arch.estimated_cost}
                            </p>
                          </div>
                        </div>

                        {/* Architecture Cost Analysis */}
                        {arch.cost_analysis && (
                          <div className="bg-[rgba(224,185,84,0.05)] border border-[rgba(224,185,84,0.2)] rounded-xl p-4">
                            <h4 className="text-sm font-medium text-[#E0B954] mb-3 flex items-center gap-2">
                              <DollarSign className="w-4 h-4" />
                              Architecture Cost Breakdown
                            </h4>
                            {arch.cost_analysis.infrastructure?.breakdown && (
                              <div className="mb-3">
                                <p className="text-xs text-[#737373] mb-2">
                                  Infrastructure Components
                                </p>
                                <div className="space-y-1.5">
                                  {arch.cost_analysis.infrastructure.breakdown.map(
                                    (item: { item: string; cost: string }, idx: number) => (
                                      <div
                                        key={idx}
                                        className="flex items-center justify-between py-1 px-2 bg-[rgba(255,255,255,0.025)] rounded"
                                      >
                                        <span className="text-xs text-[#f5f5f5]">{item.item}</span>
                                        <span className="text-xs font-medium text-[#E0B954]">
                                          {item.cost}
                                        </span>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}
                            {arch.tools_recommended && (
                              <div>
                                <p className="text-xs text-[#737373] mb-2">
                                  Tools & Services Required
                                </p>
                                <div className="space-y-1.5">
                                  {Object.entries(arch.tools_recommended).map(
                                    ([category, tools]) =>
                                      tools &&
                                      Array.isArray(tools) &&
                                      tools.length > 0 && (
                                        <div
                                          key={category}
                                          className="flex items-center justify-between py-1 px-2 bg-[rgba(255,255,255,0.025)] rounded"
                                        >
                                          <span className="text-xs text-[#f5f5f5] capitalize">
                                            {category}
                                          </span>
                                          <span className="text-xs text-[#a3a3a3]">
                                            {tools.slice(0, 3).join(', ')}
                                            {tools.length > 3 ? '...' : ''}
                                          </span>
                                        </div>
                                      ),
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Pros & Cons */}
                        <div className="grid grid-cols-2 gap-4">
                          {arch.pros && arch.pros.length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-[#E0B954] mb-2 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Advantages
                              </h4>
                              <ul className="space-y-1">
                                {arch.pros.map((pro, idx) => (
                                  <li
                                    key={idx}
                                    className="text-xs text-[#a3a3a3] flex items-start gap-2"
                                  >
                                    <span className="text-[#E0B954] mt-1">•</span>
                                    {pro}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {arch.cons && arch.cons.length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-[#EF4444] mb-2 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Considerations
                              </h4>
                              <ul className="space-y-1">
                                {arch.cons.map((con, idx) => (
                                  <li
                                    key={idx}
                                    className="text-xs text-[#a3a3a3] flex items-start gap-2"
                                  >
                                    <span className="text-[#EF4444] mt-1">•</span>
                                    {con}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Tools Recommended */}
                        {arch.tools_recommended &&
                          Object.keys(arch.tools_recommended).length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-[#a3a3a3] mb-2 flex items-center gap-1">
                                <Wrench className="w-3.5 h-3.5 text-[#F59E0B]" />
                                Recommended Tools
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(arch.tools_recommended).map(
                                  ([category, tools]) =>
                                    tools &&
                                    Array.isArray(tools) &&
                                    tools.map((tool, idx) => (
                                      <span
                                        key={`${category}-${idx}`}
                                        className="text-xs bg-[rgba(224,185,84,0.1)] text-[#E0B954] px-2 py-1 rounded-lg"
                                      >
                                        {tool}
                                      </span>
                                    )),
                                )}
                              </div>
                            </div>
                          )}
                      </div>
                    </div>
                  );
                })()}

              {/* Team Section */}
              <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#E0B954]/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-[#E0B954]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Project Team</h3>
                      <p className="text-xs text-[#737373]">
                        {project.developers.length} developers assigned
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => setShowAddDeveloper(true)}
                    disabled={availableDevelopers.length === 0}
                    className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50 rounded-xl"
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Developer
                  </Button>
                </div>
                {project.developers.length === 0 ? (
                  <div className="text-center py-10 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl">
                    <Users className="w-10 h-10 text-[#334155] mx-auto mb-3" />
                    <p className="text-[#737373]">No developers assigned yet</p>
                    <Button
                      onClick={() => setShowAddDeveloper(true)}
                      variant="ghost"
                      className="text-[#E0B954] mt-2"
                    >
                      Add your first developer
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {project.developers.map((dev) => (
                      <div
                        key={dev.id}
                        className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex items-start justify-between"
                      >
                        <div className="flex-1 flex items-start gap-4">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-white font-semibold">
                            {dev.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-white">{dev.name}</h3>
                              {dev.is_admin && (
                                <Badge className="bg-blue-500/20 text-blue-400 border-0">
                                  Admin
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-[#737373]">{dev.email}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge className="bg-[#E0B954]/20 text-[#E0B954] border-0">
                                {dev.role}
                              </Badge>
                              {dev.github_username && (
                                <Badge
                                  variant="outline"
                                  className="text-[#737373] border-[rgba(255,255,255,0.08)]"
                                >
                                  <Github className="w-3 h-3 mr-1" />
                                  {dev.github_username}
                                </Badge>
                              )}
                            </div>
                            {dev.responsibilities && (
                              <p className="text-sm text-[#a3a3a3] mt-1.5">
                                {dev.responsibilities}
                              </p>
                            )}
                          </div>
                        </div>
                        {isCurrentUserAdmin() ? (
                          <div className="flex items-center gap-2">
                            {dev.is_admin ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDemoteFromAdmin(dev.id)}
                                className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10"
                                title="Demote from admin"
                              >
                                <Crown className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePromoteToAdmin(dev.id)}
                                className="text-gray-500 hover:text-gray-400 hover:bg-gray-500/10"
                                title="Promote to admin"
                              >
                                <Crown className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveDeveloper(dev.id)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                              title="Remove developer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

        {/* Files/Links Section */}
        {activeTab === 'overview' && !hubLoading && (
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 mb-4 mt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#E0B954]/10 flex items-center justify-center">
                  <Link2 className="w-5 h-5 text-[#E0B954]" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Resources</h3>
                  <p className="text-xs text-[#737373]">Useful links and resources</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddLink(!showAddLink)}
                className="text-[#E0B954] hover:bg-[#E0B954]/10"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Link
              </Button>
            </div>

            {/* Add Link Form */}
            {showAddLink && (
              <div
                ref={addLinkFormRef}
                className="bg-[rgba(255,255,255,0.01)] border border-[rgba(224,185,84,0.2)] rounded-xl p-4 mb-4"
              >
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-[#737373] block mb-1.5">
                      Link Name
                    </label>
                    <Input
                      value={newLink.name}
                      onChange={(e) => setNewLink((l) => ({ ...l, name: e.target.value }))}
                      placeholder="e.g., API Documentation"
                      className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#737373] block mb-1.5">URL</label>
                    <Input
                      value={newLink.url}
                      onChange={(e) => setNewLink((l) => ({ ...l, url: e.target.value }))}
                      placeholder="https://example.com"
                      className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAddLink(false);
                        setNewLink({ name: '', url: '' });
                      }}
                      className="text-[#737373] hover:text-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddLink}
                      disabled={!newLink.name || !newLink.url}
                      className="bg-[#E0B954] hover:bg-[#C79E3B] text-white rounded-xl disabled:opacity-50"
                    >
                      Add Link
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Links List */}
            {linksLoading ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div
                    key={i}
                    className="h-12 bg-[rgba(255,255,255,0.02)] rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : links.length > 0 ? (
              <div className="space-y-2">
                {links.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between p-3 bg-[rgba(255,255,255,0.01)] border border-[rgba(255,255,255,0.04)] rounded-lg hover:bg-[rgba(255,255,255,0.02)] transition"
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 flex-1 min-w-0"
                    >
                      <ExternalLink className="w-4 h-4 text-[#E0B954] flex-shrink-0" />
                      <span className="text-sm text-[#E0B954] hover:underline truncate">
                        {link.name}
                      </span>
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteLink(link.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-400/10 ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-[#737373]">No links added yet</p>
              </div>
            )}
          </div>
        )}

        {/* Add Developer Modal (shared across overview & hub) */}
        {showAddDeveloper && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
                <h2 className="text-lg font-bold text-white">Add Developer</h2>
                <button
                  onClick={() => setShowAddDeveloper(false)}
                  className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-[#737373] block mb-1.5">
                    Developer
                  </label>
                  <select
                    value={newDeveloper.developer_id}
                    onChange={(e) =>
                      setNewDeveloper((d) => ({ ...d, developer_id: e.target.value }))
                    }
                    className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                  >
                    <option value="">Select a developer</option>
                    {availableDevelopers.map((dev) => (
                      <option key={dev.id} value={dev.id}>
                        {dev.name} ({dev.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#737373] block mb-1.5">Role</label>
                  <Input
                    value={newDeveloper.role}
                    onChange={(e) => setNewDeveloper((d) => ({ ...d, role: e.target.value }))}
                    placeholder="e.g., Backend Developer"
                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#737373] block mb-1.5">
                    Responsibilities
                  </label>
                  <Textarea
                    value={newDeveloper.responsibilities}
                    onChange={(e) =>
                      setNewDeveloper((d) => ({ ...d, responsibilities: e.target.value }))
                    }
                    placeholder="What will this developer work on?"
                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
                <Button
                  variant="ghost"
                  onClick={() => setShowAddDeveloper(false)}
                  className="text-[#737373] rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddDeveloper}
                  disabled={!newDeveloper.developer_id || !newDeveloper.role}
                  className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-xl font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Developer
                </Button>
              </div>
            </div>
          </div>
        )}
        {/* Project Tracker Tab - Combined Hub + Tracker */}
        {activeTab === 'tracker' &&
          (hubLoading ? (
            <div className="space-y-4 animate-pulse">
              {/* Active Sprints skeleton */}
              <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(224,185,84,0.12)] rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-[rgba(255,255,255,0.06)]" />
                  <div className="h-4 w-28 bg-[rgba(255,255,255,0.07)] rounded" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="bg-[rgba(255,255,255,0.025)] rounded-lg p-3 space-y-2">
                      <div className="h-3 w-24 bg-[rgba(255,255,255,0.05)] rounded" />
                      <div className="h-1.5 w-full bg-[rgba(255,255,255,0.04)] rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
              {/* Work Items skeleton */}
              <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 space-y-3">
                <div className="h-4 w-32 bg-[rgba(255,255,255,0.07)] rounded" />
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2.5 border-b border-[rgba(255,255,255,0.04)]"
                  >
                    <div className="h-4 w-4 rounded bg-[rgba(255,255,255,0.06)] flex-shrink-0" />
                    <div className="h-3 w-14 bg-[rgba(255,255,255,0.05)] rounded" />
                    <div className="h-3 flex-1 bg-[rgba(255,255,255,0.05)] rounded" />
                    <div className="h-5 w-16 bg-[rgba(255,255,255,0.04)] rounded-full" />
                    <div className="h-5 w-16 bg-[rgba(255,255,255,0.04)] rounded-full" />
                    <div className="h-3 w-20 bg-[rgba(255,255,255,0.04)] rounded" />
                  </div>
                ))}
              </div>
              {/* Analytics skeleton */}
              <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 space-y-4">
                <div className="space-y-1.5">
                  <div className="h-4 w-36 bg-[rgba(255,255,255,0.07)] rounded" />
                  <div className="h-3 w-52 bg-[rgba(255,255,255,0.04)] rounded" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4 h-52" />
                  ))}
                  <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4 col-span-2 h-64" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active Sprints */}
              {sprints.length > 0 && (
                <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(224,185,84,0.12)] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#C79E3B] flex items-center justify-center shadow-lg shadow-[#E0B954]/20">
                        <TrendingUp className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">Active Sprints</h3>
                        <p className="text-xs text-[#737373]">
                          {sprints.filter((s) => s.status === 'active').length} active ·{' '}
                          {sprints.length} total
                        </p>
                      </div>
                    </div>
                    {sprints.length > 2 && (
                      <button
                        onClick={() => setSprintsExpanded((p) => !p)}
                        className="flex items-center gap-1.5 text-xs text-[#E0B954] hover:text-[#F3D57E] px-3 py-1.5 rounded-lg bg-[#E0B954]/10 hover:bg-[#E0B954]/15 transition-colors font-medium flex-shrink-0"
                      >
                        {sprintsExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" /> Collapse
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" /> Show all {sprints.length}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(sprintsExpanded ? sprints : sprints.slice(0, 2)).map((sprint) => (
                      <div
                        key={sprint.id}
                        className={`border rounded-xl p-4 ${
                          sprint.status === 'active'
                            ? 'border-[#E0B954]/30 bg-[#E0B954]/5'
                            : sprint.status === 'completed'
                              ? 'border-[#E0B954]/20 bg-[rgba(224,185,84,0.03)]'
                              : 'border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                sprint.status === 'active'
                                  ? 'bg-[#E0B954] animate-pulse'
                                  : sprint.status === 'completed'
                                    ? 'bg-[#E0B954]'
                                    : 'bg-[#737373]'
                              }`}
                            />
                            <p className="text-sm font-semibold text-white truncate">
                              {sprint.name}
                            </p>
                          </div>
                          <Badge
                            className={`text-[10px] border-0 flex-shrink-0 ${
                              sprint.status === 'active'
                                ? 'bg-[#E0B954]/20 text-[#E0B954]'
                                : sprint.status === 'completed'
                                  ? 'bg-[#E0B954]/20 text-[#E0B954]'
                                  : 'bg-[#737373]/20 text-[#737373]'
                            }`}
                          >
                            {sprint.status}
                          </Badge>
                        </div>
                        {sprint.goal && (
                          <p className="text-xs text-[#a3a3a3] mb-2 line-clamp-1">{sprint.goal}</p>
                        )}
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#E0B954] to-[#E0B954] rounded-full transition-all"
                              style={{ width: `${sprint.completion_pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-[#E0B954] w-10 text-right">
                            {sprint.completion_pct}%
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-[#737373]">
                          <span>
                            {sprint.done_count}/{sprint.total_items} done
                          </span>
                          <span>·</span>
                          <span>{sprint.total_points} pts</span>
                          {sprint.start_date && sprint.end_date && (
                            <>
                              <span>·</span>
                              <span>{parseLocalDate(sprint.end_date)?.toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Analytics Charts */}
              {analytics && (
                <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#C79E3B] flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Project Analytics</h3>
                      {analytics.total_items > 0 ? (
                        <p className="text-xs text-[#737373]">
                          {analytics.total_items} items &bull; {analytics.completed_points}/
                          {analytics.total_story_points} points completed
                        </p>
                      ) : (
                        <p className="text-xs text-[#737373]">No work items yet</p>
                      )}
                    </div>
                  </div>
                  {analytics.total_items === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <BarChart3 className="w-12 h-12 text-[#334155] mb-3" />
                      <p className="text-sm text-[#737373] font-medium">No Analytics Data</p>
                      <p className="text-xs text-[#334155] mt-1">
                        Create work items to see analytics and charts
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4">
                        <h4 className="text-sm font-medium text-[#a3a3a3] mb-4">
                          Status Distribution
                        </h4>
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={Object.entries(analytics.status_distribution).map(
                                ([name, value]) => ({ name, value }),
                              )}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                              label={({ value, cx, cy, midAngle }) => {
                                const RADIAN = Math.PI / 180;
                                const radius = 65;
                                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                return (
                                  <text
                                    x={x}
                                    y={y}
                                    fill="#ffffff"
                                    fontSize="14"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                  >
                                    {value}
                                  </text>
                                );
                              }}
                              labelLine={false}
                            >
                              {Object.entries(analytics.status_distribution).map(
                                ([name], index) => {
                                  const statusColors: Record<string, string> = {
                                    backlog: '#6B7280',
                                    todo: '#60A5FA',
                                    in_progress: '#E0B954',
                                    in_review: '#A78BFA',
                                    done: '#34D399',
                                    blocked: '#EF4444',
                                  };
                                  const fallback = [
                                    '#6B7280',
                                    '#60A5FA',
                                    '#E0B954',
                                    '#A78BFA',
                                    '#34D399',
                                    '#EF4444',
                                  ];
                                  return (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={statusColors[name] ?? fallback[index % fallback.length]}
                                    />
                                  );
                                },
                              )}
                            </Pie>
                            <Legend
                              formatter={(value: string) =>
                                value
                                  .replace(/_/g, ' ')
                                  .replace(/\b\w/g, (l: string) => l.toUpperCase())
                              }
                              wrapperStyle={{ paddingTop: '12px' }}
                              iconType="circle"
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4">
                        <h4 className="text-sm font-medium text-[#a3a3a3] mb-4">
                          Sprint Velocity (Story Points vs Sprints)
                        </h4>
                        {analytics.velocity_data.length > 0 ? (
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={analytics.velocity_data} margin={{ left: 40 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                              <XAxis
                                dataKey="sprint_name"
                                tick={{ fill: '#737373', fontSize: 10 }}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                              />
                              <YAxis tick={{ fill: '#737373' }} />
                              <Legend wrapperStyle={{ paddingTop: '12px' }} />
                              <Bar
                                dataKey="committed"
                                fill="#60A5FA"
                                name="Estimated"
                                radius={[4, 4, 0, 0]}
                              />
                              <Bar
                                dataKey="completed"
                                fill="#34D399"
                                name="Completed"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex items-center justify-center h-[300px] text-[#737373]">
                            <p>No Sprints Created for the project</p>
                          </div>
                        )}
                      </div>
                      <div className="bg-[rgba(255,255,255,0.025)] rounded-xl p-4">
                        <h4 className="text-sm font-medium text-[#a3a3a3] mb-4">
                          Burndown Chart (Last 14 Days)
                        </h4>
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart data={analytics.burndown_data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="date" tick={{ fill: '#737373', fontSize: 10 }} />
                            <YAxis tick={{ fill: '#737373' }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#121212',
                                border: 'none',
                                borderRadius: '8px',
                              }}
                            />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="remaining"
                              stroke="#EF4444"
                              name="Remaining Items"
                              strokeWidth={2}
                              dot={{ fill: '#EF4444', r: 3 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="completed"
                              stroke="#34D399"
                              name="Completed Items"
                              strokeWidth={2}
                              dot={{ fill: '#34D399', r: 3 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

        {/* Timeline Tab (Calendar + Timeline) */}
        {activeTab === 'calendar' &&
          (hubLoading ? (
            <div className="space-y-4 animate-pulse">
              {/* Calendar skeleton */}
              <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5">
                <div className="grid grid-cols-7 gap-2 mb-3">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className="h-8 bg-[rgba(255,255,255,0.05)] rounded" />
                  ))}
                </div>
                {[...Array(5)].map((_, r) => (
                  <div key={r} className="grid grid-cols-7 gap-2 mb-2">
                    {[...Array(7)].map((_, c) => (
                      <div key={c} className="h-16 bg-[rgba(255,255,255,0.03)] rounded" />
                    ))}
                  </div>
                ))}
              </div>
              {/* Timeline skeleton */}
              <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5">
                <div className="h-96 bg-[rgba(255,255,255,0.025)] rounded-xl" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <TimelineView
                workItems={hubWorkItems}
                milestones={milestones}
                goals={goals}
                projectStartDate={project?.created_at}
                projectId={parseInt(id!)}
                developers={project.developers.map((d) => ({
                  id: d.id,
                  name: d.name,
                  email: d.email,
                }))}
                onTaskUpdate={handleTaskUpdate}
                onTaskCreate={handleTaskCreate}
              />
              <CalendarView workItems={hubWorkItems} milestones={milestones} goals={goals} />
            </div>
          ))}

        {/* Pulse Tab (was Business Review) */}
        {activeTab === 'pulse' &&
          (hubLoading || !pulseData ? (
            <div className="space-y-4 animate-pulse">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5"
                >
                  <div className="h-4 w-40 bg-[rgba(255,255,255,0.07)] rounded mb-4" />
                  <div className="h-40 bg-[rgba(255,255,255,0.025)] rounded-xl" />
                </div>
              ))}
            </div>
          ) : (
            <ProjectPulseView pulse={pulseData} />
          ))}

        {/* Pulse Settings Tab — gated on `project.pulse.settings` capability */}
        {activeTab === 'pulse_settings' &&
          (canAccessPulseSettings && id && pulseData ? (
            <PulseSettingsView projectId={id} initial={pulseData} onChange={setPulseData} />
          ) : (
            <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
          ))}

        {/* Activity Tab */}
        {activeTab === 'activity' &&
          (hubLoading ? (
            <div className="space-y-2 animate-pulse">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 py-3 border-b border-[rgba(255,255,255,0.04)]"
                >
                  <div className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.06)] flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-3/4 bg-[rgba(255,255,255,0.06)] rounded" />
                    <div className="h-2.5 w-24 bg-[rgba(255,255,255,0.04)] rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ActivityFeed activities={activities} />
          ))}

        {/* Project Manager Tab */}
        {activeTab === 'project_manager' &&
          canAccessPMTab() &&
          (hubLoading ? (
            <div className="space-y-4 animate-pulse">
              {/* PMView (with 4 cards) skeleton */}
              <div className="space-y-4">
                {/* Four stat cards skeleton */}
                <div className="grid grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4"
                    >
                      <div className="h-2.5 w-20 bg-[rgba(255,255,255,0.05)] rounded mb-3" />
                      <div className="h-7 w-16 bg-[rgba(255,255,255,0.06)] rounded mb-2" />
                      <div className="h-2.5 w-28 bg-[rgba(255,255,255,0.04)] rounded" />
                    </div>
                  ))}
                </div>
              </div>
              {/* Sprint Progress skeleton */}
              <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(224,185,84,0.12)] rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.06)]" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-48 bg-[rgba(255,255,255,0.07)] rounded" />
                    <div className="h-3 w-64 bg-[rgba(255,255,255,0.04)] rounded" />
                  </div>
                </div>
                {[...Array(2)].map((_, i) => (
                  <div
                    key={i}
                    className="border border-[rgba(255,255,255,0.05)] rounded-xl p-4 mb-3 space-y-3"
                  >
                    <div className="h-4 w-36 bg-[rgba(255,255,255,0.07)] rounded" />
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 w-14 bg-[rgba(255,255,255,0.04)] rounded" />
                      <div className="flex-1 h-2 bg-[rgba(255,255,255,0.05)] rounded-full" />
                      <div className="h-3 w-8 bg-[rgba(255,255,255,0.04)] rounded" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 w-14 bg-[rgba(255,255,255,0.04)] rounded" />
                      <div className="flex-1 h-2 bg-[rgba(255,255,255,0.05)] rounded-full" />
                      <div className="h-3 w-8 bg-[rgba(255,255,255,0.04)] rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <PMView projectId={id!} sprints={sprints} />
            </div>
          ))}
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
