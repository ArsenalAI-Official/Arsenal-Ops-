import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

interface UserFormState {
  email: string;
  name: string;
  roles: string[];
}

interface RoleOption {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
}

interface UserModalProps {
  open: boolean;
  onClose: () => void;
  userForm: UserFormState;
  setUserForm: React.Dispatch<React.SetStateAction<UserFormState>>;
  handleRoleToggle: (role: string) => void;
  handleSaveUser: () => void;
  /** All assignable roles (system + custom). Sorted: system first, then custom A-Z. */
  roles: RoleOption[];
}

// snake_case → Title Case so "project_manager" reads as "Project Manager".
// Custom roles created in the Roles tab usually have human-friendly names
// already; this is a no-op cleanup for them.
const formatRoleName = (name: string): string =>
  name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const UserModal: React.FC<UserModalProps> = ({
  open,
  onClose,
  userForm,
  handleRoleToggle,
  handleSaveUser,
  setUserForm,
  roles,
}) => {
  if (!open) return null;
  // Stable display order: system roles first (admin/PM/developer keep their
  // historical position at the top), then custom roles alphabetically. Sort
  // inline since this only runs while the modal is open and the role list is
  // tiny — no useMemo needed.
  const sortedRoles = [...roles].sort((a, b) => {
    if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={
        <div>
          <h2 className="text-lg font-bold text-white">Add User</h2>
          <p className="text-xs text-[#737373] mt-0.5">
            Authorize a Google account to sign in. No password is issued — users log in via SSO.
          </p>
        </div>
      }
    >
      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Name *</label>
          <Input
            value={userForm.name}
            onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="John Doe"
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">
            Google account email *
          </label>
          <Input
            type="email"
            value={userForm.email}
            onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="user@external.com"
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-2">Roles</label>
          {sortedRoles.length === 0 ? (
            <p className="text-xs text-[#737373] italic">
              No roles available. Create one in the Roles tab first.
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {sortedRoles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={userForm.roles.includes(role.name)}
                    onChange={() => handleRoleToggle(role.name)}
                    className="w-4 h-4 rounded border-[rgba(244,246,255,0.2)] bg-[rgba(255,255,255,0.025)] text-[#E0B954] focus:ring-[#E0B954]"
                  />
                  <span className="text-sm text-[#f5f5f5]">{formatRoleName(role.name)}</span>
                  {role.description && (
                    <span className="text-xs text-[#737373]">({role.description})</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
        <Button variant="ghost" onClick={onClose} className="text-[#737373] rounded-xl px-5">
          Cancel
        </Button>
        <Button
          onClick={handleSaveUser}
          className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
        >
          <Plus className="w-4 h-4 mr-2" />
          Authorize User
        </Button>
      </div>
    </Modal>
  );
};

export default UserModal;
