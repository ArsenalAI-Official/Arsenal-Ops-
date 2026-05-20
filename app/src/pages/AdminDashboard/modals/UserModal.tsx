import React from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface UserFormState {
  email: string;
  name: string;
  roles: string[];
}

interface UserModalProps {
  open: boolean;
  onClose: () => void;
  userForm: UserFormState;
  setUserForm: React.Dispatch<React.SetStateAction<UserFormState>>;
  generatedPassword: string | null;
  setGeneratedPassword: React.Dispatch<React.SetStateAction<string | null>>;
  handleRoleToggle: (role: string) => void;
  handleSaveUser: () => void;
}

const UserModal: React.FC<UserModalProps> = ({
  open,
  onClose,
  userForm,
  generatedPassword,
  setGeneratedPassword,
  handleRoleToggle,
  handleSaveUser,
  setUserForm,
}) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
          <h2 className="text-lg font-bold text-white">Add New User</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {generatedPassword ? (
            <div className="space-y-4">
              <div className="p-4 bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.2)] rounded-xl">
                <p className="text-sm text-[#E0B954] font-medium mb-2">
                  User Created Successfully!
                </p>
                <p className="text-xs text-[#a3a3a3] mb-2">
                  Share this temporary password with the user:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[rgba(244,246,255,0.05)] px-3 py-2 rounded-lg text-sm text-white font-mono">
                    {generatedPassword}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedPassword);
                      toast.success('Copied to clipboard');
                    }}
                    className="text-[#737373] hover:text-white"
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <p className="text-xs text-[#737373]">
                They will be required to change this password on first login.
              </p>
            </div>
          ) : (
            <>
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
                <label className="text-xs font-medium text-[#737373] block mb-1.5">Email *</label>
                <Input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="john@company.com"
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-2">Roles</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userForm.roles.includes('admin')}
                      onChange={() => handleRoleToggle('admin')}
                      className="w-4 h-4 rounded border-[rgba(244,246,255,0.2)] bg-[rgba(255,255,255,0.025)] text-[#E0B954] focus:ring-[#E0B954]"
                    />
                    <span className="text-sm text-[#f5f5f5]">Admin</span>
                    <span className="text-xs text-[#737373]">(Full access)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userForm.roles.includes('project_manager')}
                      onChange={() => handleRoleToggle('project_manager')}
                      className="w-4 h-4 rounded border-[rgba(244,246,255,0.2)] bg-[rgba(255,255,255,0.025)] text-[#C79E3B] focus:ring-[#C79E3B]"
                    />
                    <span className="text-sm text-[#f5f5f5]">Project Manager</span>
                    <span className="text-xs text-[#737373]">(PM tab access)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userForm.roles.includes('developer')}
                      onChange={() => handleRoleToggle('developer')}
                      className="w-4 h-4 rounded border-[rgba(244,246,255,0.2)] bg-[rgba(255,255,255,0.025)] text-[#E0B954] focus:ring-[#E0B954]"
                    />
                    <span className="text-sm text-[#f5f5f5]">Developer</span>
                    <span className="text-xs text-[#737373]">(Project access)</span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
          <Button
            variant="ghost"
            onClick={() => {
              onClose();
              setGeneratedPassword(null);
            }}
            className="text-[#737373] rounded-xl px-5"
          >
            {generatedPassword ? 'Close' : 'Cancel'}
          </Button>
          {!generatedPassword && (
            <Button
              onClick={handleSaveUser}
              className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create User
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserModal;
