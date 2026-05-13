import React from 'react';
import { X } from 'lucide-react';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  is_first_login: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface RoleManagementModalProps {
  openRoleDropdown: number | null;
  users: User[];
  setOpenRoleDropdown: (id: number | null) => void;
  handleToggleUserRole: (user: User, role: string) => void;
  toPascalCase: (str: string) => string;
}

const RoleManagementModal: React.FC<RoleManagementModalProps> = ({
  openRoleDropdown,
  users,
  setOpenRoleDropdown,
  handleToggleUserRole,
  toPascalCase,
}) => {
  if (!openRoleDropdown || !users.find((u) => u.id === openRoleDropdown)) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={() => setOpenRoleDropdown(null)}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
          <h2 className="text-lg font-bold text-white">
            Edit Roles - {users.find((u) => u.id === openRoleDropdown)?.name}
          </h2>
          <button
            onClick={() => setOpenRoleDropdown(null)}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {['admin', 'project_manager', 'developer'].map((role) => {
            const user = users.find((u) => u.id === openRoleDropdown);
            const isChecked = user?.role.includes(role) || false;
            return (
              <label
                key={role}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => user && handleToggleUserRole(user, role)}
                  className="w-5 h-5 rounded cursor-pointer"
                />
                <div className="flex-1">
                  <span className="text-sm text-white font-medium">{toPascalCase(role)}</span>
                  <p className="text-xs text-[#737373] mt-0.5">
                    {role === 'admin' && 'Full system access and user management'}
                    {role === 'project_manager' && 'Manage projects and team workload'}
                    {role === 'developer' && 'Access to assigned projects and tasks'}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-[rgba(255,255,255,0.05)]">
          <button
            onClick={() => setOpenRoleDropdown(null)}
            className="px-4 py-2 rounded-lg text-[#737373] hover:bg-[rgba(255,255,255,0.05)] transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoleManagementModal;
