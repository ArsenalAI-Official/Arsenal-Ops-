import React from 'react';
import { X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

interface CatalogChild {
  label: string;
  grant: string;
  description: string;
}

interface CatalogItem {
  label: string;
  grant: string;
  description: string;
  /** Optional nested sub-rows. Rendered indented under the parent. When the
   *  parent's grant is active (or `*`), children show as covered/disabled —
   *  admins uncheck the parent first to grant a subset. */
  children?: CatalogChild[];
}

interface CatalogGroup {
  prefix: 'project' | 'admin';
  label: string;
  wildcard: string;
  items: CatalogItem[];
}

interface RoleModalProps {
  open: boolean;
  onClose: () => void;
  editingRole: RoleLike | null;
  roleForm: RoleFormState;
  setRoleForm: React.Dispatch<React.SetStateAction<RoleFormState>>;
  isSavingRole: boolean;
  /** PM-friendly capability catalog. Replaces the auto-grouped registry so
   *  the picker shows human labels (e.g. "Overview") instead of raw keys
   *  ("project.overview.prd"), and collapses sub-caps to one row per feature. */
  pickerCatalog: CatalogGroup[];
  /** Toggle the global `*` (full access) grant. */
  toggleGrant: (key: string) => void;
  /** Toggle a catalog node (group wildcard, top-level item, or child).
   *  Receives `{ grant, children? }` so the toggle can compute the
   *  effective-checked state correctly — clicking a parent that's checked
   *  only because all children are granted sweeps those children. */
  toggleCatalogItem: (node: { grant: string; children?: readonly { grant: string }[] }) => void;
  /** Strict checked: exact grant or wildcard ancestor in `grants`. */
  isItemChecked: (grant: string, grants: string[]) => boolean;
  /** Effective checked: strict OR every child of the node effectively checked.
   *  Drives display so a parent auto-checks when all sub-rows are granted. */
  isItemEffectivelyChecked: (
    node: { grant: string; children?: readonly { grant: string }[] },
    grants: string[],
  ) => boolean;
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
  pickerCatalog,
  toggleGrant,
  toggleCatalogItem,
  isItemChecked,
  isItemEffectivelyChecked,
  toPascalCase,
  handleSaveRole,
}) => {
  if (!open) return null;

  const fullAccessSelected = roleForm.capability_keys.includes('*');

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
            {/* Header: just the Full-access toggle. The "Capabilities" h3 and
                its description were removed per UX cleanup — the section
                speaks for itself once you see the group labels below. */}
            <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fullAccessSelected}
                  onChange={() => toggleGrant('*')}
                  className="w-4 h-4 rounded cursor-pointer"
                />
                <span className="text-xs text-white">Full access</span>
              </label>
            </div>

            <div className="p-4 space-y-5 max-h-[40vh] overflow-y-auto">
              {pickerCatalog.map((group) => {
                // groupNode lets isItemEffectivelyChecked recurse into the
                // group's items so "Grant all Project" auto-checks when
                // every project item is individually checked.
                const groupNode = { grant: group.wildcard, children: group.items };
                // Display state — uses effective check (own grant OR all
                // children effectively checked).
                const groupDisplayChecked = isItemEffectivelyChecked(
                  groupNode,
                  roleForm.capability_keys,
                );
                // "Wildcard actually granted" — drives whether ITEMS inside
                // the group are forced-covered (disabled). Auto-promotion
                // does NOT force-cover children: when all items are granted
                // individually, admins can still uncheck them individually.
                const groupWildcardActive = isItemChecked(group.wildcard, roleForm.capability_keys);
                return (
                  <div key={group.prefix} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#737373]">
                        {group.label}
                      </h4>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={groupDisplayChecked}
                          disabled={fullAccessSelected}
                          onChange={() => toggleCatalogItem(groupNode)}
                          className="w-4 h-4 rounded cursor-pointer disabled:opacity-40"
                        />
                        <span className="text-[11px] text-[#a3a3a3]">Grant all {group.label}</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                      {group.items.map((item) => {
                        // Display state — own grant OR all children granted.
                        const directlyChecked = isItemEffectivelyChecked(
                          item,
                          roleForm.capability_keys,
                        );
                        // Force-covered when `*` or the group wildcard is in
                        // grants directly (NOT when "Grant all" is just
                        // auto-promoted from per-item checks — those are
                        // still individually controllable).
                        const covered = fullAccessSelected || groupWildcardActive;
                        const hasChildren = !!item.children && item.children.length > 0;
                        const parentClass = hasChildren ? 'md:col-span-2' : '';
                        // Children force-covered when `*`, the group wildcard,
                        // or this item's own wildcard is directly granted.
                        // Auto-promotion via all-children-granted leaves the
                        // individual children controllable.
                        const childrenCovered =
                          covered || roleForm.capability_keys.includes(item.grant);
                        return (
                          <div key={item.grant} className={parentClass}>
                            <label
                              className={`flex items-start gap-2 p-2 rounded-lg transition ${
                                covered
                                  ? 'bg-[rgba(224,185,84,0.04)] cursor-not-allowed'
                                  : 'hover:bg-[rgba(255,255,255,0.02)] cursor-pointer'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={directlyChecked}
                                // Disable when a higher wildcard covers this
                                // item. Without this, clicking would call
                                // toggleCatalogItem but the wildcard ancestor
                                // would keep access intact — confusing no-op.
                                // Admin uncheck the covering wildcard first.
                                disabled={covered}
                                onChange={() => toggleCatalogItem(item)}
                                className="w-4 h-4 mt-0.5 rounded cursor-pointer disabled:cursor-not-allowed"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] text-white">{item.label}</div>
                                <p className="text-[10px] text-[#737373] truncate">
                                  {item.description}
                                </p>
                              </div>
                            </label>

                            {hasChildren && (
                              <div className="ml-6 mt-1 pl-3 border-l border-[rgba(255,255,255,0.06)] space-y-0.5">
                                {item.children!.map((child) => {
                                  // Effective check: strict (own grant or
                                  // covered by a wildcard ancestor). Children
                                  // have no further nesting, so effective ==
                                  // strict for them.
                                  const childEffective = isItemEffectivelyChecked(
                                    child,
                                    roleForm.capability_keys,
                                  );
                                  return (
                                    <label
                                      key={child.grant}
                                      className={`flex items-start gap-2 p-1.5 rounded transition ${
                                        childrenCovered
                                          ? 'cursor-not-allowed opacity-70'
                                          : 'hover:bg-[rgba(255,255,255,0.02)] cursor-pointer'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={childEffective}
                                        disabled={childrenCovered}
                                        onChange={() => toggleCatalogItem(child)}
                                        className="w-3.5 h-3.5 mt-0.5 rounded cursor-pointer disabled:cursor-not-allowed"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-[11px] text-[#d4d4d4]">
                                          {child.label}
                                        </div>
                                        <p className="text-[10px] text-[#737373] truncate">
                                          {child.description}
                                        </p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {pickerCatalog.length === 0 && (
                <p className="text-sm text-[#737373] text-center py-6">
                  Capability catalog is empty.
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
