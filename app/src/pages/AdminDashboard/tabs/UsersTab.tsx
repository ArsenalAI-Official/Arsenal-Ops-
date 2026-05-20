import { useMemo, useState } from 'react';
import {
  Shield,
  UserCog,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface User {
  id: number;
  email: string;
  name: string;
  role: string; // Comma-separated roles
  is_active: boolean;
  is_first_login: boolean;
  created_at: string;
  last_login_at: string | null;
}

type UsersSortKey = 'created' | 'name' | 'status' | 'last_login';

interface UsersTabProps {
  users: User[];
  onEditUserRoles: (userId: number) => void;
}

// Helper function to convert role to Pascal Case
const toPascalCase = (str: string): string => {
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
};

const UsersTab = ({ users, onEditUserRoles }: UsersTabProps) => {
  // Users tab filters + sort (tab-local state per CONVENTIONS.md)
  const [usersRoleFilter, setUsersRoleFilter] = useState<string>('all');
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
    const filtered =
      usersRoleFilter === 'all'
        ? users
        : users.filter((u) =>
            u.role
              .split(',')
              .map((r) => r.trim())
              .includes(usersRoleFilter),
          );

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
  }, [users, usersRoleFilter, usersSort]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">User Management</h2>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
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
        {usersRoleFilter !== 'all' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUsersRoleFilter('all')}
            className="h-9 text-xs text-[#737373] hover:text-white rounded-xl px-3"
          >
            Clear filter
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
                  { key: 'name' as const, label: 'User', sortable: true },
                  { key: null, label: 'Roles', sortable: false },
                  { key: 'status' as const, label: 'Status', sortable: true },
                  { key: 'last_login' as const, label: 'Last Login', sortable: true },
                ] as const
              ).map((col, i) => {
                const isActive = col.sortable && col.key && usersSort.key === col.key;
                const ArrowIcon = isActive
                  ? usersSort.dir === 'asc'
                    ? ChevronUp
                    : ChevronDown
                  : ArrowUpDown;
                const baseCls = 'text-left text-xs font-medium text-[#737373] py-3 px-4';
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
                      <ArrowIcon
                        className={`w-3 h-3 ${isActive ? 'opacity-100' : 'opacity-40'}`}
                      />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.03)]">
            {visibleUsers.map((user) => (
              <tr key={user.id} className="hover:bg-[rgba(255,255,255,0.02)]">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-white text-sm font-medium">
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
                                ? 'bg-[#E0B954]/20 text-[#E0B954]'
                                : 'bg-[#E0B954]/20 text-[#E0B954]'
                            }`}
                          >
                            {role === 'admin' && <Shield className="w-3 h-3" />}
                            {role === 'project_manager' && (
                              <UserCog className="w-3 h-3" />
                            )}
                            {toPascalCase(role)}
                          </span>
                        );
                      })}
                    {user.role.split(',').length > 2 && (
                      <button
                        onClick={() => onEditUserRoles(user.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-[#E0B954]/20 text-[#E0B954] hover:bg-[#E0B954]/30 transition cursor-pointer"
                      >
                        +{user.role.split(',').length - 2}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => onEditUserRoles(user.id)}
                    className="text-xs px-2 py-1 rounded bg-[rgba(224,185,84,0.1)] text-[#E0B954] hover:bg-[rgba(224,185,84,0.2)] transition"
                  >
                    Edit Roles
                  </button>
                </td>
                <td className="py-3 px-4">
                  {user.is_active ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[#E0B954]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E0B954]" />
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
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="text-center py-12 text-[#737373]">
            No users yet. Click "Add User" to create one.
          </div>
        )}
        {users.length > 0 && visibleUsers.length === 0 && (
          <div className="text-center py-12 text-sm text-[#737373]">
            No users match the current filter.
          </div>
        )}
      </div>
    </div>
  );
};

export default UsersTab;
export type { User };
