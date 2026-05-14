import React from 'react';
import { Plus, FolderKanban, X, Sparkles, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Developer {
  id: number;
  name: string;
  email: string;
  github_username?: string;
  avatar_url?: string;
}

interface SelectedDeveloper {
  developer_id: number;
  role: string;
  responsibilities: string;
}

interface CreateForm {
  name: string;
  description: string;
  github_repo_url: string;
}

interface CreateProjectModalProps {
  showCreateModal: boolean;
  setShowCreateModal: (show: boolean) => void;
  createForm: CreateForm;
  setCreateForm: React.Dispatch<React.SetStateAction<CreateForm>>;
  selectedDevelopers: SelectedDeveloper[];
  setSelectedDevelopers: React.Dispatch<React.SetStateAction<SelectedDeveloper[]>>;
  selectedDeveloperId: string;
  setSelectedDeveloperId: (id: string) => void;
  newRole: string;
  setNewRole: (role: string) => void;
  newResponsibilities: string;
  setNewResponsibilities: (resp: string) => void;
  availableDevelopers: Developer[];
  handleAddDeveloper: () => void;
  handleRemoveDeveloper: (developerId: number) => void;
  handleCreateProject: () => void;
  isCreating: boolean;
}

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  showCreateModal,
  setShowCreateModal,
  createForm,
  setCreateForm,
  selectedDevelopers,
  availableDevelopers,
  selectedDeveloperId,
  setSelectedDeveloperId,
  newRole,
  setNewRole,
  newResponsibilities,
  setNewResponsibilities,
  handleAddDeveloper,
  handleRemoveDeveloper,
  handleCreateProject,
  isCreating,
}) => {
  if (!showCreateModal) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={() => setShowCreateModal(false)}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-lg shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-[rgba(255,255,255,0.05)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center">
              <FolderKanban className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">New Project</h2>
              <p className="text-xs text-[#737373]">Create a project to organize your work</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(false)}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="text-sm font-medium text-[#a3a3a3] block mb-2">
              Project Name *
            </label>
            <Input
              placeholder="e.g. Mobile App Redesign"
              value={createForm.name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-11 focus:border-[#E0B954]/50 placeholder:text-[#334155]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#a3a3a3] block mb-2">Description</label>
            <Textarea
              placeholder="Brief description of the project goals..."
              value={createForm.description}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, description: e.target.value }))
              }
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] focus:border-[#E0B954]/50 placeholder:text-[#334155] resize-none"
            />
          </div>

          {/* GitHub Repository */}
          <div>
            <label className="text-sm font-medium text-[#a3a3a3] block mb-2">
              GitHub Repository URL
              <span className="text-[#737373] text-xs ml-2">
                (Optional - for sending invitations)
              </span>
            </label>
            <Input
              placeholder="https://github.com/owner/repo"
              value={createForm.github_repo_url}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, github_repo_url: e.target.value }))
              }
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-11 focus:border-[#E0B954]/50 placeholder:text-[#334155]"
            />
            <p className="text-xs text-[#737373] mt-1.5">
              Enter the GitHub repo URL to automatically send invitations to assigned developers
            </p>
          </div>

          {/* Developer Assignment Section */}
          <div className="border-t border-[rgba(255,255,255,0.05)] pt-5">
            <label className="text-sm font-medium text-[#a3a3a3] block mb-3">
              Assign Developers
            </label>

            {/* Add Developer Form */}
            <div className="space-y-3">
              <Select value={selectedDeveloperId} onValueChange={setSelectedDeveloperId}>
                <SelectTrigger className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-11 focus:border-[#E0B954]/50">
                  <SelectValue placeholder="Select a developer" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d29] border-[rgba(255,255,255,0.07)]">
                  {availableDevelopers
                    .filter(
                      (dev) => !selectedDevelopers.find((sd) => sd.developer_id === dev.id),
                    )
                    .map((dev) => (
                      <SelectItem
                        key={dev.id}
                        value={String(dev.id)}
                        className="text-[#F4F6FF] focus:bg-[rgba(224,185,84,0.2)] focus:text-[#F4F6FF]"
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-[#737373]" />
                          <span>{dev.name}</span>
                          <span className="text-[#737373] text-xs">({dev.email})</span>
                          {dev.github_username && (
                            <span className="text-[#E0B954] text-xs ml-1">
                              @{dev.github_username}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  {availableDevelopers.length === 0 && (
                    <SelectItem value="none" disabled className="text-[#737373]">
                      No developers available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>

              <Input
                placeholder="Role (e.g. Frontend Developer, Tech Lead)"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-11 focus:border-[#E0B954]/50 placeholder:text-[#334155]"
              />

              <Textarea
                placeholder="What will they be working on in this project?"
                value={newResponsibilities}
                onChange={(e) => setNewResponsibilities(e.target.value)}
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[60px] focus:border-[#E0B954]/50 placeholder:text-[#334155] resize-none"
              />

              <Button
                type="button"
                onClick={handleAddDeveloper}
                disabled={!selectedDeveloperId || !newRole.trim()}
                className="w-full bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] font-semibold rounded-xl font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Developer
              </Button>
            </div>

            {/* Selected Developers List */}
            {selectedDevelopers.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-[#737373] font-medium">Assigned Developers:</p>
                {selectedDevelopers.map((dev) => {
                  const developerInfo = availableDevelopers.find(
                    (d) => d.id === dev.developer_id,
                  );
                  return (
                    <div
                      key={dev.developer_id}
                      className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E0B954]/20 to-[#B8872A]/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-[#E0B954]" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#F4F6FF]">
                              {developerInfo?.name}
                            </p>
                            <p className="text-xs text-[#E0B954]">{dev.role}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveDeveloper(dev.developer_id)}
                          className="p-1 rounded hover:bg-red-500/10 text-[#737373] hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {dev.responsibilities && (
                        <p className="text-xs text-[#737373] mt-2 ml-10">
                          {dev.responsibilities}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-[rgba(255,255,255,0.05)]">
          <Button
            variant="ghost"
            onClick={() => setShowCreateModal(false)}
            disabled={isCreating}
            className="text-[#737373] hover:text-white rounded-xl px-6"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateProject}
            disabled={isCreating || !createForm.name.trim()}
            className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] font-semibold rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Create Project
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateProjectModal;
