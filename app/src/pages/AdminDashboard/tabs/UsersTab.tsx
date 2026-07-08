import {
  Shield,
  UserCog,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Plus,
  Pencil,
  Trash2,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { UserListItemResponse } from '@/client';
import { Button } from '@/components/ui/button';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { avatarColor } from '@/lib/avatarColor';
import { toPascalCase } from '@/lib/stringUtils';

type UsersSortKey = 'created' | 'name' | 'status' | 'last_login';

interface UsersTabProps {
  users: UserListItemResponse[];
  onEditUserRoles: (userId: number) => void;
  onAddUser: () => void;
  onDeleteUser: (user: UserListItemResponse) => void;
  onEditUser: (user: UserListItemResponse) => void;
  /** Gates Add User + per-row Edit/Delete (all mutate the users table). */
  canWriteUsers: boolean;
  /** Gates the per-row "Edit Roles" affordance — that mutation hits
   *  user_roles which the backend gates on `admin.roles_write`. Separate
   *  prop because a role-write-only admin can adjust assignments without
   *  being able to add/delete users themselves. */
  canWriteRoles: boolean;
}

const UsersTab = ({
  users,
  onEditUserRoles,
  onAddUser,
  onDeleteUser,
  onEditUser,
  canWriteUsers,
  canWriteRoles,
}: UsersTabProps) => {
  // Users tab filters + sort (tab-local state per CONVENTIONS.md)
  const [usersRoleFilter, setUsersRoleFilter] = useState<string>('all');
  const [usersSearch, setUsersSearch] = useState<string>('');
  const [usersSort, setUsersSort] = useState<{ key: UsersSortKey; dir: 'asc' | 'desc' }>({
    key: 'created',
    dir: 'desc',
  });

  const handleUsersSort = (key: UsersSortKey) => {
    setUsersSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  };

  const availableUserRoles = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) =>
      u.role.split(',').forEach((r) => {
        const trimmed = r.trim();
        if (trimmed) set.add(trimmed);
      }),
    );
    return Array.from(set).sort();
  }, [users]);

  const visibleUsers = useMemo(() => {
    const search = usersSearch.trim().toLowerCase();
    const filtered = users.filter((u) => {
      // Role-filter test
      if (usersRoleFilter !== 'all') {
        const roles = u.role.split(',').map((r) => r.trim());
        if (!roles.includes(usersRoleFilter)) return false;
      }
      // Search-filter test — match on name OR email so admins can search
      // by either. Case-insensitive substring match keeps the UX
      // predictable for partial typing.
      if (search) {
        const name = u.name.toLowerCase();
        const email = u.email.toLowerCase();
        if (!name.includes(search) && !email.includes(search)) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (usersSort.key) {
        case 'name':
          av = a.name.toLowerCase();
          bv = b.name.toLowerCase();
          break;
        case 'status':
          av = a.is_active ? 1 : 0;
          bv = b.is_active ? 1 : 0;
          break;
        case 'last_login':
          av = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
          bv = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
          break;
        case 'created':
        default:
          av = new Date(a.created_at).getTime();
          bv = new Date(b.created_at).getTime();
          break;
      }
      if (av < bv) return usersSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return usersSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [users, usersRoleFilter, usersSearch, usersSort]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">User Management</h2>
        {canWriteUsers && (
          <Button
            onClick={onAddUser}
            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search — matches name or email. Same styling as other admin
            tab searches so the admin shell stays visually consistent. */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
          <Input
            placeholder="Search name or email…"
            value={usersSearch}
            onChange={(e) => setUsersSearch(e.target.value)}
            className="pl-8 w-56 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-9 text-sm focus:border-brand/50"
          />
        </div>
        <select
          value={usersRoleFilter}
          onChange={(e) => setUsersRoleFilter(e.target.value)}
          className="h-9 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
          title="Filter by role"
        >
          <option value="all">All roles</option>
          {availableUserRoles.map((r) => (
            <option key={r} value={r}>
              {toPascalCase(r)}
            </option>
          ))}
        </select>
        {(usersRoleFilter !== 'all' || usersSearch !== '') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setUsersRoleFilter('all');
              setUsersSearch('');
            }}
            className="h-9 text-xs text-[#737373] hover:text-white rounded-xl px-3"
          >
            Clear filters
          </Button>
        )}
        <div className="ml-auto text-xs text-[#737373]">
          {visibleUsers.length} of {users.length}
        </div>
      </div>

      <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl overflow-visible">
        <table className="w-full">
          <thead className="bg-[rgba(255,255,255,0.02)]">
            <tr>
              {(
                [
                  { key: 'name' as const, label: 'User', sortable: true, align: 'left' as const },
                  { key: null, label: 'Roles', sortable: false, align: 'left' as const },
                  {
                    key: 'status' as const,
                    label: 'Status',
                    sortable: true,
                    align: 'left' as const,
                  },
                  {
                    key: 'last_login' as const,
                    label: 'Last Login',
                    sortable: true,
                    align: 'left' as const,
                  },
                  { key: null, label: 'Actions', sortable: false, align: 'right' as const },
                ] as const
              ).map((col, i) => {
                const isActive = col.sortable && col.key && usersSort.key === col.key;
                const ArrowIcon = isActive
                  ? usersSort.dir === 'asc'
                    ? ChevronUp
                    : ChevronDown
                  : ArrowUpDown;
                const baseCls = `text-xs font-medium text-[#737373] py-3 px-4 ${col.align === 'right' ? 'text-right' : 'text-left'}`;
                if (!col.sortable || !col.key) {
                  return (
                    <th key={i} className={baseCls}>
                      {col.label}
                    </th>
                  );
                }
                return (
                  <th key={i} className={baseCls}>
                    <button
                      onClick={() => handleUsersSort(col.key as UsersSortKey)}
                      className={`inline-flex items-center gap-1 hover:text-white transition-colors ${isActive ? 'text-white' : ''}`}
                      title={`Sort by ${col.label}`}
                    >
                      {col.label}
                      <ArrowIcon className={`w-3 h-3 ${isActive ? 'opacity-100' : 'opacity-40'}`} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.03)]">
            {visibleUsers.map((user) => {
              const c = avatarColor(user.id);
              return (
                <tr key={user.id} className="hover:bg-[rgba(255,255,255,0.02)]">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                        style={{
                          backgroundColor: c.bg,
                          color: c.fg,
                          border: `1px solid ${c.ring}`,
                        }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm text-white">{user.name}</div>
                        <div className="text-xs text-[#737373]">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1 mb-2 items-center">
                      {user.role
                        .split(',')
                        .slice(0, 2)
                        .map((r, i) => {
                          const role = r.trim();
                          return (
                            <span
                              key={i}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                                role === 'admin'
                                  ? 'bg-[rgba(255,255,255,0.06)] text-muted-foreground'
                                  : 'bg-[rgba(255,255,255,0.06)] text-muted-foreground'
                              }`}
                            >
                              {role === 'admin' && <Shield className="w-3 h-3" />}
                              {role === 'project_manager' && <UserCog className="w-3 h-3" />}
                              {toPascalCase(role)}
                            </span>
                          );
                        })}
                      {user.role.split(',').length > 2 &&
                        (canWriteRoles ? (
                          <button
                            onClick={() => onEditUserRoles(user.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-[rgba(255,255,255,0.06)] text-muted-foreground hover:bg-[rgba(255,255,255,0.1)] transition cursor-pointer"
                          >
                            +{user.role.split(',').length - 2}
                          </button>
                        ) : (
                          // Read-only chip — no click target, no editor open.
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-[rgba(255,255,255,0.06)] text-muted-foreground">
                            +{user.role.split(',').length - 2}
                          </span>
                        ))}
                    </div>
                    {canWriteRoles && (
                      <button
                        onClick={() => onEditUserRoles(user.id)}
                        className="text-xs px-2 py-1 rounded bg-[rgba(255,255,255,0.06)] text-muted-foreground hover:bg-[rgba(255,255,255,0.1)] transition"
                      >
                        Edit Roles
                      </button>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {user.is_active ? (
                      <span className="inline-flex items-center gap-1 text-xs text-status-done">
                        <span className="w-1.5 h-1.5 rounded-full bg-status-done" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-[#737373]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#737373]" />
                        Inactive
                      </span>
                    )}
                    {user.is_first_login && (
                      <span className="ml-2 text-[10px] text-[#F59E0B]">(First Login)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-[#737373]">
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      {/* Buttons stay visible so the action column has consistent
                        width across rows. `disabled` gates the click + greys
                        out the icon; tooltip explains why. The mutating
                        endpoint is independently gated on the backend. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditUser(user)}
                        disabled={!canWriteUsers}
                        className="text-[#737373] hover:text-white h-8 w-8 p-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-[#737373]"
                        title={canWriteUsers ? 'Edit user profile' : 'Requires user-write access'}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteUser(user)}
                        disabled={!canWriteUsers}
                        className="text-red-400 hover:text-red-300 h-8 w-8 p-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-red-400"
                        title={canWriteUsers ? 'Delete user' : 'Requires user-write access'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && (
          <Empty>
            <EmptyTitle>No users yet</EmptyTitle>
            <EmptyDescription>Click "Add User" to create one.</EmptyDescription>
          </Empty>
        )}
        {users.length > 0 && visibleUsers.length === 0 && (
          <Empty>
            <EmptyDescription>
              {usersSearch.trim()
                ? 'No users match your search.'
                : 'No users match the current filter.'}
            </EmptyDescription>
          </Empty>
        )}
      </div>
    </div>
  );
};

export default UsersTab;
