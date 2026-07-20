import { Users, Plus, Github, Trash2, Crown } from 'lucide-react';
import { useState } from 'react';
import type { ProjectDeveloperEntry, DeveloperResponse } from '@/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';

interface NewDeveloperForm {
  developer_id: string;
  role: string;
  responsibilities: string;
}

interface TeamSectionProps {
  developers: ProjectDeveloperEntry[];
  availableDevelopers: DeveloperResponse[];
  isCurrentUserAdmin: boolean;
  onAddDeveloper: (form: NewDeveloperForm) => void;
  onRemoveDeveloper: (developerId: number) => void;
  onPromoteToAdmin: (developerId: number) => void;
  onDemoteFromAdmin: (developerId: number) => void;
}

const TeamSection = ({
  developers,
  availableDevelopers,
  isCurrentUserAdmin,
  onAddDeveloper,
  onRemoveDeveloper,
  onPromoteToAdmin,
  onDemoteFromAdmin,
}: TeamSectionProps) => {
  const [showAddDeveloper, setShowAddDeveloper] = useState(false);
  const [newDeveloper, setNewDeveloper] = useState<NewDeveloperForm>({
    developer_id: '',
    role: '',
    responsibilities: '',
  });

  // Defense-in-depth: even if `showAddDeveloper` was set to true while the
  // user was admin (then they lost admin via cap refresh / demotion mid-
  // session), the modal must not stay open with its submit button live.
  // Backend independently enforces `require_project_admin` on the POST.
  const effectiveShowAddDeveloper = showAddDeveloper && isCurrentUserAdmin;

  const handleAddDeveloper = () => {
    if (!newDeveloper.developer_id) return;
    if (!isCurrentUserAdmin) return; // mirror of the UI gate, see above
    onAddDeveloper(newDeveloper);
    setShowAddDeveloper(false);
    setNewDeveloper({ developer_id: '', role: '', responsibilities: '' });
  };

  return (
    <>
      <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E0B954]/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-[#E0B954]" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Project Team</h3>
              <p className="text-xs text-[#737373]">{developers.length} developers assigned</p>
            </div>
          </div>
          {/* Add Developer — restricted to project admins + system admins.
              Mirrors the row-level controls (promote/demote/remove) below
              which already gate on `isCurrentUserAdmin`. Backend gate lives
              on POST /{project_id}/developers via `require_project_admin`. */}
          {isCurrentUserAdmin && (
            <Button
              onClick={() => setShowAddDeveloper(true)}
              disabled={availableDevelopers.length === 0}
              className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50 rounded-xl"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Developer
            </Button>
          )}
        </div>
        {developers.length === 0 ? (
          <div className="text-center py-10 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl">
            <Users className="w-10 h-10 text-[#334155] mx-auto mb-3" />
            <p className="text-[#737373]">No developers assigned yet</p>
            {isCurrentUserAdmin && (
              <Button
                onClick={() => setShowAddDeveloper(true)}
                variant="ghost"
                className="text-[#E0B954] mt-2"
              >
                Add your first developer
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {developers.map((dev) => (
              <div
                key={dev.id}
                className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 flex items-start justify-between"
              >
                <div className="flex-1 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-white font-semibold">
                    {dev.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white">{dev.name}</h3>
                      {dev.is_admin && (
                        <Badge className="bg-blue-500/20 text-blue-400 border-0">Admin</Badge>
                      )}
                    </div>
                    <p className="text-sm text-[#737373]">{dev.email}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge className="bg-[#E0B954]/20 text-[#E0B954] border-0">{dev.role}</Badge>
                      {dev.github_username && (
                        <Badge
                          variant="outline"
                          className="text-[#737373] border-[rgba(255,255,255,0.08)]"
                        >
                          <Github className="w-3 h-3 mr-1" />
                          {dev.github_username}
                        </Badge>
                      )}
                    </div>
                    {dev.responsibilities && (
                      <p className="text-sm text-[#a3a3a3] mt-1.5">{dev.responsibilities}</p>
                    )}
                  </div>
                </div>
                {isCurrentUserAdmin ? (
                  <div className="flex items-center gap-2">
                    {dev.is_admin ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDemoteFromAdmin(dev.id)}
                        className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10"
                        title="Demote from admin"
                      >
                        <Crown className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onPromoteToAdmin(dev.id)}
                        className="text-gray-500 hover:text-gray-400 hover:bg-gray-500/10"
                        title="Promote to admin"
                      >
                        <Crown className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveDeveloper(dev.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                      title="Remove developer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Developer Modal */}
      {effectiveShowAddDeveloper && (
        <Modal
          open
          onClose={() => setShowAddDeveloper(false)}
          title="Add Developer"
          maxWidthClass="max-w-md"
          closeOnBackdrop={false}
        >
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">Developer</label>
              <select
                value={newDeveloper.developer_id}
                onChange={(e) => setNewDeveloper((d) => ({ ...d, developer_id: e.target.value }))}
                className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
              >
                <option value="">Select a developer</option>
                {availableDevelopers.map((dev) => (
                  <option key={dev.id} value={dev.id}>
                    {dev.name} ({dev.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">Role</label>
              <Input
                value={newDeveloper.role}
                onChange={(e) => setNewDeveloper((d) => ({ ...d, role: e.target.value }))}
                placeholder="e.g., Backend Developer"
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">
                Responsibilities
              </label>
              <Textarea
                value={newDeveloper.responsibilities}
                onChange={(e) =>
                  setNewDeveloper((d) => ({ ...d, responsibilities: e.target.value }))
                }
                placeholder="What will this developer work on?"
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
            <Button
              variant="ghost"
              onClick={() => setShowAddDeveloper(false)}
              className="text-[#737373] rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddDeveloper}
              disabled={!newDeveloper.developer_id || !newDeveloper.role}
              className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-xl font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Developer
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
};

export default TeamSection;
