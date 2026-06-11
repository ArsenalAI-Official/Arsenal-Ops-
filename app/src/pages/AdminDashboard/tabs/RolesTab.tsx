import { Plus, Pencil, Trash2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toPascalCase } from '@/lib/stringUtils';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

interface Role {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  capability_keys: string[];
  user_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface RolesTabProps {
  roles: Role[];
  isDeletingRole: boolean;
  onCreateRole: () => void;
  onEditRole: (role: Role) => void;
  onDeleteRole: (role: Role) => void;
  /** Gates Add/Edit/Delete role buttons. Without it the tab is read-only —
   *  users with `admin.roles` can still see what each role grants. */
  canWriteRoles: boolean;
}

const RolesTab = ({
  roles,
  isDeletingRole,
  onCreateRole,
  onEditRole,
  onDeleteRole,
  canWriteRoles,
}: RolesTabProps) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Roles &amp; Capabilities</h2>
          <p className="text-xs text-[#737373] mt-1">
            Define what each role can see. Users get the union of capabilities from every role
            assigned to them.
          </p>
        </div>
        {canWriteRoles && (
          <Button
            onClick={onCreateRole}
            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-xl h-10 px-4"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Role
          </Button>
        )}
      </div>
      <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl overflow-visible">
        <table className="w-full">
          <thead className="bg-[rgba(255,255,255,0.02)]">
            <tr>
              <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">Name</th>
              <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">
                Description
              </th>
              <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">Users</th>
              <th className="text-right text-xs font-medium text-[#737373] py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.03)]">
            {roles.map((role) => (
              <tr key={role.id} className="hover:bg-[rgba(255,255,255,0.02)]">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-[#E0B954]/20 text-[#E0B954] font-medium">
                      <KeyRound className="w-3 h-3" />
                      {toPascalCase(role.name)}
                    </span>
                    {role.is_system && (
                      <span className="text-[10px] uppercase tracking-wide text-[#737373] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
                        System
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 text-sm text-[#a3a3a3]">
                  {role.description || <span className="text-[#525252]">—</span>}
                </td>
                <td className="py-3 px-4 text-sm text-[#a3a3a3]">{role.user_count ?? 0}</td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {/* Buttons stay visible so the action column has consistent
                        width across rows. Disabled when the caller lacks
                        roles-write OR (for delete) the role is a system role.
                        Tooltip explains the most specific reason. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditRole(role)}
                      disabled={!canWriteRoles}
                      className="text-[#737373] hover:text-white h-8 w-8 p-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-[#737373]"
                      title={canWriteRoles ? 'Edit role' : 'Requires roles-write access'}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteRole(role)}
                      disabled={!canWriteRoles || role.is_system || isDeletingRole}
                      className="text-red-400 hover:text-red-300 h-8 w-8 p-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-red-400"
                      title={
                        !canWriteRoles
                          ? 'Requires roles-write access'
                          : role.is_system
                            ? 'System roles cannot be deleted'
                            : 'Delete role'
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {roles.length === 0 && (
          <Empty>
            <EmptyTitle>No roles yet</EmptyTitle>
            <EmptyDescription>Click "Add Role" to create one.</EmptyDescription>
          </Empty>
        )}
      </div>
    </div>
  );
};

export default RolesTab;
export type { Role };
