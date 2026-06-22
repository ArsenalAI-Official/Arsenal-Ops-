import React from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Modal } from '@/components/ui/modal';
import type { ProjectDeveloperEntry } from '@/client';

interface ProjectLike {
  id: number;
  name: string;
}

interface EmployeeLike {
  id: number;
  name: string;
  email: string;
}

interface AddMemberFormState {
  developer_id: string;
  role: string;
}

interface ProjectMembersModalProps {
  open: boolean;
  onClose: () => void;
  selectedProjectForMembers: ProjectLike | null;
  projectMembers: ProjectDeveloperEntry[];
  projectMembersLoading: boolean;
  employees: EmployeeLike[];
  addMemberForm: AddMemberFormState;
  setAddMemberForm: React.Dispatch<React.SetStateAction<AddMemberFormState>>;
  handleAddProjectMember: () => void;
  handleRemoveProjectMember: (developerId: number) => void;
  addMemberPending: boolean;
  removeMemberPending: boolean;
}

const ProjectMembersModal: React.FC<ProjectMembersModalProps> = ({
  open,
  onClose,
  selectedProjectForMembers,
  projectMembers,
  projectMembersLoading,
  employees,
  addMemberForm,
  setAddMemberForm,
  handleAddProjectMember,
  handleRemoveProjectMember,
  addMemberPending,
  removeMemberPending,
}) => {
  if (!selectedProjectForMembers) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      panelClassName="max-h-[85vh] flex flex-col"
    >
      <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
        <div>
          <h2 className="text-lg font-bold text-white">Project Members</h2>
          <div className="text-xs text-[#737373] mt-0.5">{selectedProjectForMembers.name}</div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-5 overflow-y-auto">
        {/* Current members */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider">
              Current Members
            </h3>
            <span className="text-xs text-[#737373]">{projectMembers.length} total</span>
          </div>
          {projectMembersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="sm" tone="gold" />
            </div>
          ) : projectMembers.length === 0 ? (
            <Empty>
              <EmptyDescription>No members assigned yet.</EmptyDescription>
            </Empty>
          ) : (
            <ul className="space-y-2">
              {projectMembers.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[rgba(224,185,84,0.2)] flex items-center justify-center text-sm font-medium text-[#E0B954] flex-shrink-0">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate flex items-center gap-2">
                        {m.name}
                        {m.is_admin && (
                          <span className="px-1.5 py-0.5 rounded bg-[rgba(224,185,84,0.15)] text-[#E0B954] text-[9px] font-semibold uppercase tracking-wider">
                            Admin
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#737373] truncate">
                        {m.email}
                        {m.role && <span className="ml-2 capitalize">· {m.role}</span>}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveProjectMember(m.id)}
                    disabled={removeMemberPending}
                    className="text-red-400 hover:text-red-300 h-8 w-8 p-0 flex-shrink-0"
                    title="Remove from project"
                  >
                    {removeMemberPending ? (
                      <Spinner size="xs" tone="red" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add member */}
        <div>
          <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider mb-2">
            Add Member
          </h3>
          {(() => {
            const assignedIds = new Set(projectMembers.map((m) => m.id));
            const available = employees.filter((e) => !assignedIds.has(e.id));
            return (
              <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] space-y-3">
                {available.length === 0 ? (
                  <div className="text-xs text-[#737373] py-2 text-center">
                    All employees are already on this project.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-medium text-[#737373] uppercase tracking-wider block mb-1.5">
                          Employee
                        </label>
                        <select
                          value={addMemberForm.developer_id}
                          onChange={(e) =>
                            setAddMemberForm((f) => ({ ...f, developer_id: e.target.value }))
                          }
                          className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                        >
                          <option value="">Select an employee</option>
                          {available.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name} · {emp.email}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-[#737373] uppercase tracking-wider block mb-1.5">
                          Role
                        </label>
                        <select
                          value={addMemberForm.role}
                          onChange={(e) =>
                            setAddMemberForm((f) => ({ ...f, role: e.target.value }))
                          }
                          className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                        >
                          <option value="developer">Developer</option>
                          <option value="lead">Lead</option>
                          <option value="qa">QA</option>
                          <option value="designer">Designer</option>
                          <option value="pm">Product Manager</option>
                        </select>
                      </div>
                    </div>
                    <Button
                      onClick={handleAddProjectMember}
                      disabled={addMemberPending || !addMemberForm.developer_id}
                      className="w-full h-9 bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl font-medium disabled:opacity-50"
                    >
                      {addMemberPending ? (
                        <>
                          <Spinner size="xs" tone="white" className="mr-2" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-1.5" />
                          Add to Project
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
        <Button variant="ghost" onClick={onClose} className="text-[#737373] rounded-xl px-5">
          Close
        </Button>
      </div>
    </Modal>
  );
};

export default ProjectMembersModal;
