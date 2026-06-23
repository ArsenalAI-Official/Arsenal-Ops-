import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SprintResponse } from '@/client';
import { apiFetch } from '@/lib/api';
import { invalidateProjectScope, invalidateWorkItemScope } from '@/lib/invalidations';
import { toastErrorHandler } from '@/lib/mutationToast';
import { validateSprintForm } from '../lib/sprintValidation';

interface SprintFormInput {
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
}

interface UseSprintMutationsArgs {
  // Live values/setters threaded from the orchestrator so the onSuccess/handler
  // close + reset + validation behavior stays byte-identical.
  sprints: SprintResponse[];
  invalidateWorkItems: () => void;
  editingSprint: SprintResponse | null;
  completingSprintId: number | null;
  deletingSprintId: number | null;
  setShowCreateSprintModal: (open: boolean) => void;
  setEditingSprint: (sprint: SprintResponse | null) => void;
  setCompletingSprintId: (id: number | null) => void;
  setDeletingSprintId: (id: number | null) => void;
}

/**
 * Owns the board's sprint mutations (create / edit / complete / delete) plus
 * their handler wrappers. Moved verbatim from the ProjectBoard orchestrator.
 * Validation is delegated to the already-extracted `validateSprintForm`. The
 * UI state setters/values the onSuccess/handlers need are threaded in as params
 * so the exact close/reset/toast behavior is preserved.
 */
export function useSprintMutations(
  id: string | undefined,
  {
    sprints,
    invalidateWorkItems,
    editingSprint,
    completingSprintId,
    deletingSprintId,
    setShowCreateSprintModal,
    setEditingSprint,
    setCompletingSprintId,
    setDeletingSprintId,
  }: UseSprintMutationsArgs,
) {
  const queryClient = useQueryClient();

  // Create sprint mutation
  const createSprintMutation = useMutation({
    mutationFn: (vars: {
      name: string;
      goal: string;
      start_date: string | null;
      end_date: string | null;
    }) =>
      apiFetch('/api/workitems/sprints/', {
        method: 'POST',
        body: JSON.stringify({
          project_id: parseInt(id!),
          name: vars.name,
          goal: vars.goal,
          start_date: vars.start_date,
          end_date: vars.end_date,
        }),
      }),
    onSuccess: () => {
      toast.success('Sprint created!');
      setShowCreateSprintModal(false);
    },
    onError: toastErrorHandler('create sprint'),
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
    },
  });

  const handleCreateSprint = (form: SprintFormInput) => {
    if (createSprintMutation.isPending) return;
    if (!form.name.trim()) {
      toast.error('Sprint name is required');
      return;
    }
    const validationError = validateSprintForm({
      form,
      sprints,
      overlapMessage: 'Sprint dates overlap with an existing sprint. Sprints cannot overlap.',
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }
    createSprintMutation.mutate({
      name: form.name,
      goal: form.goal,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    });
  };

  // Edit sprint mutation
  const editSprintMutation = useMutation({
    mutationFn: (vars: {
      sprintId: number;
      name: string;
      goal: string;
      start_date: string | null;
      end_date: string | null;
    }) =>
      apiFetch(`/api/workitems/sprints/${vars.sprintId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: vars.name,
          goal: vars.goal,
          start_date: vars.start_date,
          end_date: vars.end_date,
        }),
      }),
    onSuccess: () => {
      toast.success('Sprint updated!');
      setEditingSprint(null);
    },
    onError: toastErrorHandler('update sprint'),
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
    },
  });

  const handleEditSprint = (form: SprintFormInput) => {
    if (!editingSprint || !form.name.trim()) {
      toast.error('Sprint name is required');
      return;
    }
    const validationError = validateSprintForm({
      form,
      sprints,
      excludeSprintId: editingSprint.id,
      overlapMessage: 'Sprint dates overlap with an existing sprint.',
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }
    editSprintMutation.mutate({
      sprintId: editingSprint.id,
      name: form.name,
      goal: form.goal,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    });
  };

  // Complete sprint mutation
  const completeSprintMutation = useMutation({
    mutationFn: (sprintId: number) =>
      apiFetch(`/api/workitems/sprints/${sprintId}/complete`, { method: 'PUT' }),
    onSuccess: (_data, sprintId) => {
      const sprint = sprints.find((s) => s.id === sprintId);
      toast.success(`"${sprint?.name}" has been completed.`);
      setCompletingSprintId(null);
    },
    onError: toastErrorHandler('complete sprint'),
    onSettled: () => {
      invalidateProjectScope(queryClient, id);
      invalidateWorkItemScope(queryClient, id);
    },
  });

  const handleCompleteSprint = () => {
    if (!completingSprintId) return;
    completeSprintMutation.mutate(completingSprintId);
  };

  // Delete sprint mutation
  const deleteSprintMutation = useMutation({
    mutationFn: (sprintId: number) =>
      apiFetch(`/api/workitems/sprints/${sprintId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Sprint deleted');
      setDeletingSprintId(null);
    },
    onError: toastErrorHandler('delete sprint'),
    onSettled: () => {
      invalidateWorkItems();
      invalidateProjectScope(queryClient, id);
    },
  });

  const handleDeleteSprint = () => {
    if (!deletingSprintId) return;
    deleteSprintMutation.mutate(deletingSprintId);
  };

  return {
    createSprintMutation,
    handleCreateSprint,
    editSprintMutation,
    handleEditSprint,
    completeSprintMutation,
    handleCompleteSprint,
    deleteSprintMutation,
    handleDeleteSprint,
  };
}
