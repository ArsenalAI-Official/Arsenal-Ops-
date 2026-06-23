import { Plus, X, FolderKanban, User, Trash2, Sparkles, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Developer, CreateProjectForm, SelectedDeveloper } from './types';

/** Sentinel used by the shadcn Select to represent "no category". Lifted
 *  out so it isn't an inline magic string at two call sites (the value and
 *  the onChange branch). Matches the pattern used by the admin Projects
 *  tab's per-card category picker. */
const UNCATEGORIZED_OPTION = '__uncategorized__';

interface ProjectCategoryOption {
  id: number;
  name: string;
}

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  form: CreateProjectForm;
  setForm: (next: CreateProjectForm | ((prev: CreateProjectForm) => CreateProjectForm)) => void;
  isCreating: boolean;
  onCreate: () => void;
  availableDevelopers: Developer[];
  selectedDevelopers: SelectedDeveloper[];
  selectedDeveloperId: string;
  setSelectedDeveloperId: (id: string) => void;
  newRole: string;
  setNewRole: (value: string) => void;
  newResponsibilities: string;
  setNewResponsibilities: (value: string) => void;
  onAddDeveloper: () => void;
  onRemoveDeveloper: (developerId: number) => void;
  /** Categories the user can pick from. When the list is empty (no
   *  categories defined yet) the picker still renders with only the
   *  "Uncategorized" option, so creation always works. */
  categories: ProjectCategoryOption[];
}

const CreateProjectDialog = ({
  open,
  onClose,
  form,
  setForm,
  isCreating,
  onCreate,
  availableDevelopers,
  selectedDevelopers,
  selectedDeveloperId,
  setSelectedDeveloperId,
  newRole,
  setNewRole,
  newResponsibilities,
  setNewResponsibilities,
  onAddDeveloper,
  onRemoveDeveloper,
  categories,
}: CreateProjectDialogProps) => {
  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-lg" panelClassName="shadow-black/50">
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
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
        <div>
          <label className="text-sm font-medium text-[#a3a3a3] block mb-2">Project Name *</label>
          <Input
            placeholder="e.g. Mobile App Redesign"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-11 focus:border-[#E0B954]/50 placeholder:text-[#334155]"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#a3a3a3] block mb-2">Description</label>
          <Textarea
            placeholder="Brief description of the project goals..."
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] focus:border-[#E0B954]/50 placeholder:text-[#334155] resize-none"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-[#a3a3a3] block mb-2">
            GitHub Repository URL
            <span className="text-[#737373] text-xs ml-2">
              (Optional - for sending invitations)
            </span>
          </label>
          <Input
            placeholder="https://github.com/owner/repo"
            value={form.github_repo_url}
            onChange={(e) => setForm((prev) => ({ ...prev, github_repo_url: e.target.value }))}
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-11 focus:border-[#E0B954]/50 placeholder:text-[#334155]"
          />
          <p className="text-xs text-[#737373] mt-1.5">
            Enter the GitHub repo URL to automatically send invitations to assigned developers
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-[#a3a3a3] block mb-2">
            Category
            <span className="text-[#737373] text-xs ml-2">(Optional)</span>
          </label>
          <Select
            value={form.category_id === null ? UNCATEGORIZED_OPTION : String(form.category_id)}
            onValueChange={(value) =>
              setForm((prev) => ({
                ...prev,
                category_id: value === UNCATEGORIZED_OPTION ? null : Number(value),
              }))
            }
          >
            <SelectTrigger className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-11 focus:border-[#E0B954]/50">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#737373]" />
                <SelectValue placeholder="Uncategorized" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d29] border-[rgba(255,255,255,0.07)]">
              <SelectItem
                value={UNCATEGORIZED_OPTION}
                className="text-[#F4F6FF] focus:bg-[rgba(224,185,84,0.2)] focus:text-[#F4F6FF]"
              >
                Uncategorized
              </SelectItem>
              {categories.map((cat) => (
                <SelectItem
                  key={cat.id}
                  value={String(cat.id)}
                  className="text-[#F4F6FF] focus:bg-[rgba(224,185,84,0.2)] focus:text-[#F4F6FF]"
                >
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border-t border-[rgba(255,255,255,0.05)] pt-5">
          <label className="text-sm font-medium text-[#a3a3a3] block mb-3">Assign Developers</label>

          <div className="space-y-3">
            <Select value={selectedDeveloperId} onValueChange={setSelectedDeveloperId}>
              <SelectTrigger className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-11 focus:border-[#E0B954]/50">
                <SelectValue placeholder="Select a developer" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d29] border-[rgba(255,255,255,0.07)]">
                {availableDevelopers
                  .filter((dev) => !selectedDevelopers.find((sd) => sd.developer_id === dev.id))
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
              onClick={onAddDeveloper}
              disabled={!selectedDeveloperId || !newRole.trim()}
              className="w-full bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] font-semibold rounded-xl font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Developer
            </Button>
          </div>

          {selectedDevelopers.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-[#737373] font-medium">Assigned Developers:</p>
              {selectedDevelopers.map((dev) => {
                const developerInfo = availableDevelopers.find((d) => d.id === dev.developer_id);
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
                        onClick={() => onRemoveDeveloper(dev.developer_id)}
                        className="p-1 rounded hover:bg-red-500/10 text-[#737373] hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {dev.responsibilities && (
                      <p className="text-xs text-[#737373] mt-2 ml-10">{dev.responsibilities}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 p-6 border-t border-[rgba(255,255,255,0.05)]">
        <Button
          variant="ghost"
          onClick={onClose}
          disabled={isCreating}
          className="text-[#737373] hover:text-white rounded-xl px-6"
        >
          Cancel
        </Button>
        <Button
          onClick={onCreate}
          disabled={isCreating || !form.name.trim()}
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
    </Modal>
  );
};

export default CreateProjectDialog;
