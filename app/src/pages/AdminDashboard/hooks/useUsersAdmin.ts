import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import type { ConfirmFn } from '@/components/ui/confirm-dialog';
import type { User } from '../types';
import { ADMIN_REFETCH } from './adminRefetch';

/**
 * Owns the Users-tab domain: the users query plus the create / edit-profile /
 * delete flows and their modal+form state. Cross-cutting invalidation keeps the
 * Employees tab and developer lists consistent (developer-role users surface in
 * both) — preserved from the original component, see app/CLAUDE.md.
 */
export function useUsersAdmin(confirm: ConfirmFn) {
  const queryClient = useQueryClient();

  const usersQuery = useQuery<User[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch<User[]>('/api/auth/admin/users'),
    ...ADMIN_REFETCH,
  });
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

  // Create-user modal + form
  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState<{ email: string; name: string; roles: string[] }>({
    email: '',
    name: '',
    roles: ['developer'],
  });

  const handleRoleToggle = (role: string) => {
    setUserForm((f) => {
      const roles = f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role];
      return { ...f, roles: roles.length > 0 ? roles : ['developer'] };
    });
  };

  const createUserMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ status: string }>('/api/auth/admin/create-user', {
        method: 'POST',
        body: JSON.stringify({ ...userForm, role: userForm.roles.join(',') }),
      }),
    onSuccess: () => {
      toast.success('User authorized. They can now sign in with Google SSO.');
      setShowUserModal(false);
      setUserForm({ email: '', name: '', roles: ['developer'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to create user'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      // Developer-role users also surface in the Employees tab — keep both
      // tabs consistent on role mutations.
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      // Backend creates a Developer row when role includes 'developer' — keep
      // the per-project add-developer dropdown in sync.
      queryClient.invalidateQueries({ queryKey: ['developers'] });
    },
  });

  const handleSaveUser = () => {
    if (!userForm.email.trim() || !userForm.name.trim()) {
      toast.error('Email and name are required');
      return;
    }
    createUserMutation.mutate();
  };

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/api/auth/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('User deleted'),
    onError: (err: any) => toast.error(err?.message || 'Failed to delete user'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      // Deleting a user cascades to their developer record (if any), so refresh
      // the dependent lists too.
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['developers'] });
    },
  });

  const handleDeleteUser = async (user: User) => {
    if (
      !(await confirm({
        title: 'Delete user?',
        description: `Delete user "${user.name}" (${user.email})? They'll lose access immediately. This cannot be undone.`,
        confirmText: 'Delete',
        destructive: true,
      }))
    )
      return;
    deleteUserMutation.mutate(user.id);
  };

  // Edit-user profile (name + email + github_username) — distinct from role
  // editing which lives behind the inline "Edit Roles" pill.
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState<{
    name: string;
    email: string;
    github_username: string;
  }>({ name: '', email: '', github_username: '' });

  const updateUserMutation = useMutation({
    mutationFn: (vars: { id: number; name: string; email: string; github_username: string }) =>
      apiFetch<User>(`/api/auth/admin/users/${vars.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: vars.name,
          email: vars.email,
          github_username: vars.github_username,
        }),
      }),
    onSuccess: () => {
      toast.success('User updated');
      setEditingUser(null);
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to update user'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      // Name/email/github changes flow through to Developer rows too.
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['developers'] });
    },
  });

  const handleOpenEditUser = (user: User) => {
    setEditingUser(user);
    setEditUserForm({
      name: user.name,
      email: user.email,
      github_username: user.github_username || '',
    });
  };

  const handleSaveEditUser = () => {
    if (!editingUser) return;
    const name = editUserForm.name.trim();
    const email = editUserForm.email.trim();
    if (!name || !email) {
      toast.error('Name and email are required');
      return;
    }
    updateUserMutation.mutate({
      id: editingUser.id,
      name,
      email,
      github_username: editUserForm.github_username.trim(),
    });
  };

  return {
    users,
    isLoading: usersQuery.isLoading,
    // create-user modal
    showUserModal,
    setShowUserModal,
    userForm,
    setUserForm,
    handleRoleToggle,
    handleSaveUser,
    // edit-user modal
    editingUser,
    setEditingUser,
    editUserForm,
    setEditUserForm,
    handleOpenEditUser,
    handleSaveEditUser,
    updateUserMutation,
    // delete
    handleDeleteUser,
  };
}
