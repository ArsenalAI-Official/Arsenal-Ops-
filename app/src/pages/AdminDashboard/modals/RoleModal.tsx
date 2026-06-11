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

/**
 * One picker entry — either a tab/feature (top-level) or a sub-row (child).
 * Each entry has up to two grants: `readGrant` (view), `writeGrant` (edit).
 * Render rules:
 *   - both present → two checkboxes per row
 *   - readGrant only → Read checkbox + "—" placeholder for Write
 *   - writeGrant only → "—" placeholder for Read + Write checkbox
 * The W→R dependency is enforced by the parent's `togglePickerCheckbox`.
 */
export interface CatalogChild {
  label: string;
  description: string;
  readGrant?: string;
  writeGrant?: string;
  footnote?: string;
}

export interface CatalogItem extends CatalogChild {
  /** Optional nested sub-rows. Rendered indented under the parent. When the
   *  parent's read wildcard is active (or `*`), children show as covered. */
  children?: readonly CatalogChild[];
}

interface CatalogGroup {
  prefix: 'project' | 'admin';
  label: string;
  /** Group-level wildcard cap (e.g. `project.*`). The "Grant all <Group>"
   *  toggle flips this one key, which the matcher then covers every cap in
   *  the group with. */
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
  pickerCatalog: CatalogGroup[];
  /** Toggle the global `*` (full access) grant. */
  toggleGrant: (key: string) => void;
  /** Toggle the group wildcard ("Grant all Project" / "Grant all Admin"). */
  toggleGroupWildcard: (group: CatalogGroup) => void;
  /** Toggle a single side of a paired row. Implements the W→R dependency:
   *  - Toggling Read OFF also clears Write.
   *  - Toggling Write ON also sets Read. */
  togglePickerCheckbox: (item: CatalogChild | CatalogItem, side: 'read' | 'write') => void;
  /** Strict check: is this exact grant (or a wildcard ancestor) in `grants`. */
  isGrantHeld: (grant: string, grants: string[]) => boolean;
  /** Effective check for one side of an item. Returns true when:
   *  - the item's own side-grant is held, OR
   *  - the item has children and every child's same-side grant is held. */
  isSideEffective: (
    item: CatalogChild | CatalogItem,
    side: 'read' | 'write',
    grants: string[],
  ) => boolean;
  /** True when the entire group is effectively covered — either its wildcard
   *  is held, or every item's every defined side is held. Drives the "Grant
   *  all <Group>" checkbox display. */
  isGroupEffective: (group: CatalogGroup, grants: string[]) => boolean;
  toPascalCase: (str: string) => string;
  handleSaveRole: () => void;
}

/**
 * A single Read or Write cell inside a row. Renders an "—" placeholder when
 * the item doesn't expose this side, so the columns stay vertically aligned
 * across rows where some are R-only, some W-only, some both.
 */
const RWCell: React.FC<{
  grant: string | undefined;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}> = ({ grant, checked, disabled, onToggle }) => {
  if (!grant) {
    return (
      <span
        className="w-4 h-4 inline-flex items-center justify-center text-[#3a3a3a] text-[11px]"
        aria-hidden
      >
        —
      </span>
    );
  }
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
};

const RoleModal: React.FC<RoleModalProps> = ({
  open,
  onClose,
  editingRole,
  roleForm,
  setRoleForm,
  isSavingRole,
  pickerCatalog,
  toggleGrant,
  toggleGroupWildcard,
  togglePickerCheckbox,
  isGrantHeld,
  isSideEffective,
  isGroupEffective,
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
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-3xl shadow-2xl max-h-[88vh] flex flex-col"
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
            {/* Header: Full-access toggle on the right. */}
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

            {/* R/W column header strip — aligns with the per-row cells below. */}
            <div className="px-4 py-2 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.015)] grid grid-cols-[1fr_56px_56px] gap-2 text-[10px] uppercase tracking-wider text-[#737373]">
              <div />
              <div className="text-center">Read</div>
              <div className="text-center">Write</div>
            </div>

            <div className="p-4 space-y-5 max-h-[50vh] overflow-y-auto">
              {pickerCatalog.map((group) => {
                const groupChecked = isGroupEffective(group, roleForm.capability_keys);
                // When the group wildcard is directly granted (not just
                // auto-promoted from per-item checks), items show as covered.
                const groupWildcardActive = isGrantHeld(group.wildcard, roleForm.capability_keys);
                return (
                  <div key={group.prefix} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#737373]">
                        {group.label}
                      </h4>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={groupChecked}
                          disabled={fullAccessSelected}
                          onChange={() => toggleGroupWildcard(group)}
                          className="w-4 h-4 rounded cursor-pointer disabled:opacity-40"
                        />
                        <span className="text-[11px] text-[#a3a3a3]">Grant all {group.label}</span>
                      </label>
                    </div>

                    <div className="space-y-1">
                      {group.items.map((item) => {
                        // Force-covered when `*` or the group wildcard is held.
                        const covered = fullAccessSelected || groupWildcardActive;
                        const readOn = isSideEffective(item, 'read', roleForm.capability_keys);
                        const writeOn = isSideEffective(item, 'write', roleForm.capability_keys);
                        // Children covered also when this item's read wildcard
                        // is directly held — e.g. `project.overview.*` covers
                        // all four overview sub-rows.
                        const childrenCovered =
                          covered ||
                          (!!item.readGrant && roleForm.capability_keys.includes(item.readGrant));
                        const hasChildren = !!item.children && item.children.length > 0;

                        return (
                          <div key={item.label} className="space-y-1">
                            <ItemRow
                              item={item}
                              readOn={readOn}
                              writeOn={writeOn}
                              covered={covered}
                              onToggle={togglePickerCheckbox}
                            />
                            {hasChildren && (
                              <div className="ml-6 pl-3 border-l border-[rgba(255,255,255,0.06)] space-y-0.5">
                                {item.children!.map((child) => {
                                  const cRead = isSideEffective(
                                    child,
                                    'read',
                                    roleForm.capability_keys,
                                  );
                                  const cWrite = isSideEffective(
                                    child,
                                    'write',
                                    roleForm.capability_keys,
                                  );
                                  return (
                                    <ItemRow
                                      key={child.label}
                                      item={child}
                                      readOn={cRead}
                                      writeOn={cWrite}
                                      covered={childrenCovered}
                                      onToggle={togglePickerCheckbox}
                                      isChild
                                    />
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

/**
 * One row in the picker — label + description on the left, R/W cells on the
 * right. Extracted so children render the exact same shape, just smaller
 * type sizes via `isChild`.
 */
const ItemRow: React.FC<{
  item: CatalogChild | CatalogItem;
  readOn: boolean;
  writeOn: boolean;
  covered: boolean;
  onToggle: (item: CatalogChild | CatalogItem, side: 'read' | 'write') => void;
  isChild?: boolean;
}> = ({ item, readOn, writeOn, covered, onToggle, isChild }) => {
  const labelClass = isChild ? 'text-[11px] text-[#d4d4d4]' : 'text-[12px] text-white';
  const descClass = isChild ? 'text-[10px] text-[#737373]' : 'text-[10px] text-[#737373]';
  const rowClass = `grid grid-cols-[1fr_56px_56px] gap-2 items-start p-2 rounded-lg transition ${
    covered ? 'bg-[rgba(224,185,84,0.04)]' : 'hover:bg-[rgba(255,255,255,0.02)]'
  }`;
  return (
    <div className={rowClass}>
      <div className="min-w-0">
        <div className={labelClass}>{item.label}</div>
        <p className={`${descClass} truncate`}>{item.description}</p>
        {item.footnote && (
          <p className="text-[10px] text-[#525252] italic mt-0.5">{item.footnote}</p>
        )}
      </div>
      <div className="flex justify-center pt-0.5">
        <RWCell
          grant={item.readGrant}
          checked={readOn}
          disabled={covered}
          onToggle={() => onToggle(item, 'read')}
        />
      </div>
      <div className="flex justify-center pt-0.5">
        <RWCell
          grant={item.writeGrant}
          checked={writeOn}
          disabled={covered}
          onToggle={() => onToggle(item, 'write')}
        />
      </div>
    </div>
  );
};

export default RoleModal;
