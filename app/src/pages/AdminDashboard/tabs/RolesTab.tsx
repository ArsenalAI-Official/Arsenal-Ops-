import { Plus, Pencil, Trash2, Shield, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
}

// Helper function to convert role to Pascal Case
const toPascalCase = (str: string): string => {
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
};

const RolesTab = ({
  roles,
  isDeletingRole,
  onCreateRole,
  onEditRole,
  onDeleteRole,
}: RolesTabProps) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Roles &amp; Capabilities</h2>
          <p className="text-xs text-[#737373] mt-1">
            Define what each role can see. Users get the union of capabilities from every
            role assigned to them.
          </p>
        </div>
        <Button
          onClick={onCreateRole}
          className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-xl h-10 px-4"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Role
        </Button>
      </div>
      <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl overflow-visible">
        <table className="w-full">
          <thead className="bg-[rgba(255,255,255,0.02)]">
            <tr>
              <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">
                Name
              </th>
              <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">
                Description
              </th>
              <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">
                Capabilities
              </th>
              <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">
                Users
              </th>
              <th className="text-right text-xs font-medium text-[#737373] py-3 px-4">
                Actions
              </th>
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
                <td className="py-3 px-4 text-sm text-[#a3a3a3]">
                  {role.capability_keys.length === 0 ? (
                    <span className="text-[#525252]">None</span>
                  ) : role.capability_keys.includes('*') ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-[#E0B954]/15 text-[#E0B954]">
                      <Shield className="w-3 h-3" />
                      Full access
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-w-md">
                      {role.capability_keys.slice(0, 3).map((k) => (
                        <span
                          key={k}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.04)] text-[#a3a3a3] border border-[rgba(255,255,255,0.06)]"
                        >
                          {k}
                        </span>
                      ))}
                      {role.capability_keys.length > 3 && (
                        <span className="text-[10px] text-[#737373] px-1.5 py-0.5">
                          +{role.capability_keys.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 text-sm text-[#a3a3a3]">
                  {role.user_count ?? 0}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditRole(role)}
                      className="text-[#737373] hover:text-white h-8"
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteRole(role)}
                      disabled={role.is_system || isDeletingRole}
                      className="text-[#737373] hover:text-red-400 h-8 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={
                        role.is_system ? 'System roles cannot be deleted' : 'Delete role'
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {roles.length === 0 && (
          <div className="text-center py-12 text-[#737373]">
            No roles yet. Click "Add Role" to create one.
          </div>
        )}
      </div>
    </div>
  );
};

export default RolesTab;
export type { Role };
