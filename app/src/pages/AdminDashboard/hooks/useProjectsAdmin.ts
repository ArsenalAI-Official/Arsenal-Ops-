import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { invalidateProjectScope, invalidateAdminMembershipImpact } from '@/lib/invalidations';
import type { ConfirmFn } from '@/components/ui/confirm-dialog';
import type { ProjectResponse, ProjectWeeklyReportResponse, ProjectDetailResponse } from '@/client';
import type { CategoryFormPayload, ProjectCategory } from '../types';
import { ADMIN_REFETCH } from './adminRefetch';

/**
 * Owns the Projects-tab domain: projects + categories + weekly-report queries,
 * the category filter and derived filtered list, category CRUD, GitHub settings,
 * and project-member management (incl. the members modal). The Employees list
 * needed by the add-member dropdown is NOT owned here — the parent/container
 * passes it in. Category-scope invalidation (categories + projects + weekly
 * report) preserved from the original component.
 */
export function useProjectsAdmin(confirm: ConfirmFn) {
  const queryClient = useQueryClient();

  const projectsQuery = useQuery<ProjectResponse[]>({
    queryKey: ['admin', 'projects'],
    queryFn: () => apiFetch<ProjectResponse[]>('/api/admin/projects'),
    ...ADMIN_REFETCH,
  });
  // Stabilize the empty default — `data ?? []` creates a new array every render,
  // which busts the downstream `filteredProjects` useMemo. See app/CLAUDE.md.
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  const categoriesQuery = useQuery<ProjectCategory[]>({
    queryKey: ['admin', 'projectCategories'],
    queryFn: () => apiFetch<ProjectCategory[]>('/api/admin/project-categories/'),
    ...ADMIN_REFETCH,
  });
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  // Category manager modal + filter state.
  //   'all'           → no filter (default)
  //   'uncategorized' → only projects with category_id === null
  //   '<numeric id>'  → only projects with category_id === Number(value)
  const [showCategoryManagerModal, setShowCategoryManagerModal] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filteredProjects = useMemo(() => {
    if (categoryFilter === 'all') return projects;
    if (categoryFilter === 'uncategorized') return projects.filter((p) => p.category_id === null);
    const id = Number(categoryFilter);
    return Number.isFinite(id) ? projects.filter((p) => p.category_id === id) : projects;
  }, [projects, categoryFilter]);

  // Weekly report — server-side filtered by the same category filter the card
  // grid uses. The query key includes `categoryFilter` so React Query refetches
  // on filter change.
  const weeklyReportQuery = useQuery<ProjectWeeklyReportResponse>({
    queryKey: ['admin', 'projectsWeeklyReport', categoryFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryFilter === 'uncategorized') {
        params.set('uncategorized', 'true');
      } else {
        const id = Number(categoryFilter);
        if (Number.isFinite(id)) params.set('category_id', String(id));
      }
      const qs = params.toString();
      return apiFetch<ProjectWeeklyReportResponse>(
        `/api/admin/projects/weekly-report${qs ? `?${qs}` : ''}`,
      );
    },
    ...ADMIN_REFETCH,
  });

  // ── Category CRUD mutations ───────────────────────────────────────────
  // Invalidate four keys on any category mutation: categories list (manager
  // modal), admin projects (cards show category badges), weekly report (rows
  // include category_name), and the home-page CreateProjectDialog picker which
  // reads the non-admin ['projectCategories'] key. A rename reflows into cards
  // AND report; an assignment change re-buckets which projects show in a
  // filtered report.
  const invalidateCategoryScope = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'projectCategories'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'projectsWeeklyReport'] });
    queryClient.invalidateQueries({ queryKey: ['projectCategories'] });
  };

  const createCategoryMutation = useMutation({
    mutationFn: (payload: CategoryFormPayload) =>
      apiFetch<ProjectCategory>('/api/admin/project-categories/', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidateCategoryScope();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create category'),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CategoryFormPayload }) =>
      apiFetch<ProjectCategory>(`/api/admin/project-categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidateCategoryScope();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update category'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/admin/project-categories/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      // Reset the filter to 'all' ONLY if the active filter was on the category
      // we just deleted — otherwise a delete of an unrelated category would
      // silently change the user's filter.
      setCategoryFilter((current) => (current === String(deletedId) ? 'all' : current));
      invalidateCategoryScope();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete category'),
  });

  // Assigning a category to a single project. Uses the dedicated admin endpoint
  // — gated on `admin.projects_write` so a read-only admin (or a per-project
  // admin only) can't reorganize the admin-wide categorization. Passing null
  // clears the assignment.
  const setProjectCategoryMutation = useMutation({
    mutationFn: ({ projectId, categoryId }: { projectId: number; categoryId: number | null }) =>
      apiFetch(`/api/admin/projects/${projectId}/category`, {
        method: 'PUT',
        body: JSON.stringify({ category_id: categoryId }),
      }),
    onSuccess: () => {
      invalidateCategoryScope();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Failed to update project category'),
  });

  // GitHub settings state
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectResponse | null>(null);
  const [gitHubForm, setGitHubForm] = useState({
    github_repo_url: '',
    github_repo_name: '',
    github_token: '',
  });
  const [invitingProjectId, setInvitingProjectId] = useState<number | null>(null);

  const handleEditGitHubSettings = (project: ProjectResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(project);
    setGitHubForm({
      github_repo_url: project.github_repo_url || '',
      github_repo_name: project.github_repo_name || '',
      github_token: '', // Don't show existing token
    });
    setShowGitHubModal(true);
  };

  const saveGitHubMutation = useMutation({
    mutationFn: () => {
      if (!editingProject) throw new Error('No project selected');
      return apiFetch<void>(`/api/admin/projects/${editingProject.id}/github`, {
        method: 'PUT',
        body: JSON.stringify(gitHubForm),
      });
    },
    onSuccess: () => {
      toast.success('GitHub settings updated!');
      setShowGitHubModal(false);
    },
    onError: () => toast.error('Failed to update GitHub settings'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      invalidateProjectScope(queryClient, editingProject?.id);
    },
  });

  const handleSaveGitHubSettings = () => saveGitHubMutation.mutate();

  const sendGitHubInvitesMutation = useMutation({
    mutationFn: (project: ProjectResponse) =>
      apiFetch<{ successful_invitations: number }>(
        `/api/projects/${project.id}/github-invite?role=push`,
        {
          method: 'POST',
        },
      ),
    onSuccess: (data, project) => {
      toast.success(
        `Sent ${data.successful_invitations} GitHub invitation(s) for ${project.name}!`,
      );
      setInvitingProjectId(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to send invitations');
      setInvitingProjectId(null);
    },
  });

  const handleSendGitHubInvites = (project: ProjectResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project.github_repo_url) {
      toast.error('No GitHub repository configured');
      return;
    }
    setInvitingProjectId(project.id);
    sendGitHubInvitesMutation.mutate(project);
  };

  // Project members management
  const [showProjectMembersModal, setShowProjectMembersModal] = useState(false);
  const [selectedProjectForMembers, setSelectedProjectForMembers] =
    useState<ProjectResponse | null>(null);
  const [addMemberForm, setAddMemberForm] = useState<{ developer_id: string; role: string }>({
    developer_id: '',
    role: 'developer',
  });

  const projectMembersQuery = useQuery<ProjectDetailResponse>({
    queryKey: ['project', selectedProjectForMembers?.id],
    queryFn: () => apiFetch(`/api/projects/${selectedProjectForMembers!.id}`),
    enabled: !!selectedProjectForMembers,
  });
  const projectMembers = projectMembersQuery.data?.developers ?? [];
  const projectMembersLoading = projectMembersQuery.isLoading;

  const handleOpenProjectMembers = (project: ProjectResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProjectForMembers(project);
    setShowProjectMembersModal(true);
    setAddMemberForm({ developer_id: '', role: 'developer' });
  };

  const addMemberMutation = useMutation({
    mutationFn: ({ projectId, devId, role }: { projectId: number; devId: number; role: string }) =>
      apiFetch<void>(`/api/projects/${projectId}/developers`, {
        method: 'POST',
        body: JSON.stringify({ developer_id: devId, role }),
      }),
    onSuccess: () => {
      toast.success('Member added');
      setAddMemberForm({ developer_id: '', role: 'developer' });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to add member'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      invalidateProjectScope(queryClient, selectedProjectForMembers?.id);
      invalidateAdminMembershipImpact(queryClient);
    },
  });

  const handleAddProjectMember = () => {
    if (!selectedProjectForMembers) return;
    const devId = parseInt(addMemberForm.developer_id, 10);
    if (!devId) {
      toast.error('Select an employee to add');
      return;
    }
    addMemberMutation.mutate({
      projectId: selectedProjectForMembers.id,
      devId,
      role: addMemberForm.role || 'developer',
    });
  };

  const removeMemberMutation = useMutation({
    mutationFn: ({ projectId, developerId }: { projectId: number; developerId: number }) =>
      apiFetch<void>(`/api/projects/${projectId}/developers/${developerId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Member removed');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to remove member'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      invalidateProjectScope(queryClient, selectedProjectForMembers?.id);
      invalidateAdminMembershipImpact(queryClient);
    },
  });

  const handleRemoveProjectMember = async (developerId: number) => {
    if (!selectedProjectForMembers) return;
    if (
      !(await confirm({
        title: 'Remove member?',
        description:
          'Remove this member from the project? Their assigned work items will be unassigned.',
        confirmText: 'Remove',
        destructive: true,
      }))
    )
      return;
    removeMemberMutation.mutate({ projectId: selectedProjectForMembers.id, developerId });
  };

  return {
    // data
    categories,
    filteredProjects,
    categoryFilter,
    setCategoryFilter,
    weeklyReportQuery,
    categoriesQuery,
    isLoading: projectsQuery.isLoading || categoriesQuery.isLoading,
    // category manager modal + mutations
    showCategoryManagerModal,
    setShowCategoryManagerModal,
    createCategoryMutation,
    updateCategoryMutation,
    deleteCategoryMutation,
    setProjectCategoryMutation,
    // github modal
    showGitHubModal,
    setShowGitHubModal,
    editingProject,
    gitHubForm,
    setGitHubForm,
    invitingProjectId,
    handleEditGitHubSettings,
    handleSaveGitHubSettings,
    handleSendGitHubInvites,
    // project members modal
    showProjectMembersModal,
    setShowProjectMembersModal,
    selectedProjectForMembers,
    projectMembers,
    projectMembersLoading,
    addMemberForm,
    setAddMemberForm,
    handleOpenProjectMembers,
    handleAddProjectMember,
    handleRemoveProjectMember,
    addMemberMutation,
    removeMemberMutation,
  };
}
