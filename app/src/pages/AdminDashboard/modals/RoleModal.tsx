import React from 'react';
import { X, Check, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Capability {
  key: string;
  description: string;
}

interface RoleLike {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  capability_keys: string[];
}

interface RoleFormState {
  name: string;
  description: string;
  capability_keys: string[];
}

interface GroupedCapability {
  prefix: string;
  wildcard: string;
  caps: Capability[];
}

interface RoleModalProps {
  open: boolean;
  onClose: () => void;
  editingRole: RoleLike | null;
  roleForm: RoleFormState;
  setRoleForm: React.Dispatch<React.SetStateAction<RoleFormState>>;
  isSavingRole: boolean;
  groupedCapabilities: GroupedCapability[];
  toggleGrant: (key: string) => void;
  isCoveredByWildcard: (key: string, grants: string[]) => boolean;
  toPascalCase: (str: string) => string;
  handleSaveRole: () => void;
}

const RoleModal: React.FC<RoleModalProps> = ({
  open,
  onClose,
  editingRole,
  roleForm,
  setRoleForm,
  isSavingRole,
  groupedCapabilities,
  toggleGrant,
  isCoveredByWildcard,
  toPascalCase,
  handleSaveRole,
}) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={() => !isSavingRole && onClose()}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-2xl shadow-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
          <div>
            <h2 className="text-lg font-bold text-white">
              {editingRole ? `Edit Role - ${toPascalCase(editingRole.name)}` : 'Add Role'}
            </h2>
            {editingRole?.is_system && (
              <p className="text-xs text-[#737373] mt-0.5">
                System role — name is locked, but description and capabilities can be edited.
              </p>
            )}
          </div>
          <button
            onClick={() => !isSavingRole && onClose()}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">Role Name *</label>
              <Input
                value={roleForm.name}
                onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g., qa_lead, finance_viewer"
                disabled={editingRole?.is_system}
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">Description</label>
              <Input
                value={roleForm.description}
                onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief summary of who gets this role"
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
              />
            </div>
          </div>

          <div className="border border-[rgba(255,255,255,0.06)] rounded-xl">
            <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">Capabilities</h3>
                <p className="text-[10px] text-[#737373] mt-0.5">
                  Wildcards (e.g. <code className="text-[#a3a3a3]">project.*</code>) cover all keys
                  under that prefix, including ones added later.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={roleForm.capability_keys.includes('*')}
                  onChange={() => toggleGrant('*')}
                  className="w-4 h-4 rounded cursor-pointer"
                />
                <span className="text-xs text-white">
                  Full access (<code className="text-[#E0B954]">*</code>)
                </span>
              </label>
            </div>
            <div className="p-4 space-y-4 max-h-[40vh] overflow-y-auto">
              {groupedCapabilities.map((group) => {
                const wildcardSelected = roleForm.capability_keys.includes(group.wildcard);
                const fullAccessSelected = roleForm.capability_keys.includes('*');
                return (
                  <div key={group.prefix} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#737373]">
                        {group.prefix}
                      </h4>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wildcardSelected}
                          disabled={fullAccessSelected}
                          onChange={() => toggleGrant(group.wildcard)}
                          className="w-4 h-4 rounded cursor-pointer disabled:opacity-40"
                        />
                        <span className="text-[11px] text-[#a3a3a3]">
                          Grant all <code className="text-[#E0B954]">{group.wildcard}</code>
                        </span>
                      </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                      {group.caps.map((cap) => {
                        const isSelected = roleForm.capability_keys.includes(cap.key);
                        const covered =
                          !isSelected && isCoveredByWildcard(cap.key, roleForm.capability_keys);
                        return (
                          <label
                            key={cap.key}
                            className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition ${
                              covered
                                ? 'bg-[rgba(224,185,84,0.04)]'
                                : 'hover:bg-[rgba(255,255,255,0.02)]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected || covered}
                              onChange={() => toggleGrant(cap.key)}
                              className="w-4 h-4 mt-0.5 rounded cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <code
                                  className={`text-[11px] ${
                                    covered ? 'text-[#E0B954]/70' : 'text-[#E0B954]'
                                  }`}
                                >
                                  {cap.key}
                                </code>
                                {covered && (
                                  <span
                                    className="text-[9px] text-[#737373] inline-flex items-center gap-0.5"
                                    title="Granted via a wildcard. Unchecking will expand the wildcard into explicit per-key grants minus this one."
                                  >
                                    <Check className="w-2.5 h-2.5" />
                                    covered
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-[#737373] truncate">
                                {cap.description}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {groupedCapabilities.length === 0 && (
                <p className="text-sm text-[#737373] text-center py-6">
                  Capability registry is empty.
                </p>
              )}
            </div>
            <div className="px-4 py-2 border-t border-[rgba(255,255,255,0.05)] text-[10px] text-[#737373]">
              {roleForm.capability_keys.length === 0
                ? 'No grants selected — users with only this role will see nothing.'
                : `${roleForm.capability_keys.length} grant${
                    roleForm.capability_keys.length === 1 ? '' : 's'
                  } selected.`}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-[rgba(255,255,255,0.05)]">
          <button
            onClick={() => !isSavingRole && onClose()}
            className="px-4 py-2 rounded-lg text-[#737373] hover:bg-[rgba(255,255,255,0.05)] transition disabled:opacity-50"
            disabled={isSavingRole}
          >
            Cancel
          </button>
          <Button
            onClick={handleSaveRole}
            disabled={isSavingRole || !roleForm.name.trim()}
            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSavingRole ? 'Saving…' : editingRole ? 'Update Role' : 'Create Role'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RoleModal;
