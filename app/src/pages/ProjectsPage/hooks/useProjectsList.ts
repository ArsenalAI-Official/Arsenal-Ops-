import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import type {
  Project,
  Developer,
  CreateProjectForm,
  SelectedDeveloper,
} from '@/components/ProjectsPage';
import type { ConfirmFn } from '@/components/ui/confirm-dialog';
import { apiFetch } from '@/lib/api';
import { invalidateAdminWorkItemImpact } from '@/lib/invalidations';
import { toastErrorHandler } from '@/lib/mutationToast';

// The projects column of the home page: the projects list + search, the
// Create Project modal (form, developer roster builder, category list), and
// the create/delete project mutations.
export const useProjectsList = (confirm: ConfirmFn) => {
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');

  // Create project modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateProjectForm>({
    name: '',
    description: '',
    github_repo_url: '',
    category_id: null,
  });
  const [selectedDevelopers, setSelectedDevelopers] = useState<SelectedDeveloper[]>([]);
  const [selectedDeveloperId, setSelectedDeveloperId] = useState<string>('');
  const [newRole, setNewRole] = useState('');
  const [newResponsibilities, setNewResponsibilities] = useState('');

  const projectsQuery = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => apiFetch<Project[]>('/api/projects/'),
  });
  const projects = projectsQuery.data ?? [];
  const isLoading = projectsQuery.isLoading;

  // Developers available for the project-create modal. Gated on modal open so
  // the list isn't fetched on every home-page visit.
  const developersQuery = useQuery<Developer[]>({
    queryKey: ['developers'],
    queryFn: () => apiFetch<Developer[]>('/api/developers/'),
    enabled: showCreateModal,
  });
  const availableDevelopers = developersQuery.data ?? [];

  // Category list for the Create Project dialog. Lite endpoint (id + name
  // only) gated on `project.create` — distinct from the admin endpoint
  // which is gated on `admin.projects` and carries `project_count`.
  // Enabled only when the modal is open so the list isn't fetched on every
  // home-page visit.
  const projectCategoriesQuery = useQuery<{ id: number; name: string }[]>({
    queryKey: ['projectCategories'],
    queryFn: () => apiFetch<{ id: number; name: string }[]>('/api/projects/categories'),
    enabled: showCreateModal,
  });
  const projectCategories = projectCategoriesQuery.data ?? [];

  const handleAddDeveloper = () => {
    if (!selectedDeveloperId || !newRole.trim()) {
      toast.error('Please select a developer and enter a role');
      return;
    }
    const devId = parseInt(selectedDeveloperId);
    const alreadyAdded = selectedDevelopers.find((d) => d.developer_id === devId);
    if (alreadyAdded) {
      toast.error('Developer already added to this project');
      return;
    }
    const developer = availableDevelopers.find((d) => d.id === devId);
    setSelectedDevelopers((prev) => [
      ...prev,
      { developer_id: devId, role: newRole, responsibilities: newResponsibilities },
    ]);
    toast.success(`${developer?.name} added as ${newRole}`);
    setSelectedDeveloperId('');
    setNewRole('');
    setNewResponsibilities('');
  };

  const handleRemoveDeveloper = (developerId: number) => {
    setSelectedDevelopers((prev) => prev.filter((d) => d.developer_id !== developerId));
  };

  const createProjectMutation = useMutation({
    mutationFn: () =>
      apiFetch<Project>('/api/projects/', {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name,
          description: createForm.description,
          github_repo_url: createForm.github_repo_url || undefined,
          // Send category_id only when set — backend treats absent as null,
          // same as null. Sending `undefined` keeps the field out of the
          // JSON payload entirely, which is slightly cleaner.
          category_id: createForm.category_id ?? undefined,
          developers: selectedDevelopers,
        }),
      }),
    onSuccess: () => {
      setShowCreateModal(false);
      setCreateForm({ name: '', description: '', github_repo_url: '', category_id: null });
      setSelectedDevelopers([]);
      toast.success('Project created successfully!');
    },
    onError: toastErrorHandler('create project'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: number) =>
      apiFetch<void>(`/api/projects/${projectId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Project deleted');
    },
    onError: toastErrorHandler('delete project'),
    onSettled: (_data, _err, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      // Assignments were freed by the cascading delete, so developer capacity moves.
      invalidateAdminWorkItemImpact(queryClient);
      // Evict per-project caches so a recreated id can't see stale data. Keys
      // use the STRING route-param shape, so normalize the number id or the
      // removeQueries silently no-op (['project', 7] !== ['project', '7']).
      if (projectId !== undefined) {
        const id = String(projectId);
        queryClient.removeQueries({ queryKey: ['project', id] });
        queryClient.removeQueries({ queryKey: ['projectOverview', id] });
        queryClient.removeQueries({ queryKey: ['sprints', id] });
        queryClient.removeQueries({ queryKey: ['hubData', id] });
      }
    },
  });

  const handleCreateProject = () => {
    if (!createForm.name.trim()) {
      toast.error('Project name is required');
      return;
    }
    createProjectMutation.mutate();
  };
  const isCreating = createProjectMutation.isPending;

  const handleDeleteProject = async (e: React.MouseEvent, projectId: number) => {
    e.stopPropagation();
    if (
      !(await confirm({
        title: 'Delete project?',
        description: 'Delete this project and all its work items?',
        destructive: true,
        confirmText: 'Delete',
      }))
    )
      return;
    deleteProjectMutation.mutate(projectId);
  };

  return {
    searchQuery,
    setSearchQuery,
    projects,
    isLoading,
    showCreateModal,
    setShowCreateModal,
    createForm,
    setCreateForm,
    selectedDevelopers,
    selectedDeveloperId,
    setSelectedDeveloperId,
    newRole,
    setNewRole,
    newResponsibilities,
    setNewResponsibilities,
    availableDevelopers,
    projectCategories,
    handleAddDeveloper,
    handleRemoveDeveloper,
    handleCreateProject,
    isCreating,
    handleDeleteProject,
  };
};
