import React from 'react';
import { X, Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ProjectLike {
  id: number;
  name: string;
  has_github_token: boolean;
}

interface GitHubFormState {
  github_repo_url: string;
  github_repo_name: string;
  github_token: string;
}

interface GitHubModalProps {
  open: boolean;
  onClose: () => void;
  editingProject: ProjectLike | null;
  gitHubForm: GitHubFormState;
  setGitHubForm: React.Dispatch<React.SetStateAction<GitHubFormState>>;
  handleSaveGitHubSettings: () => void;
}

const GitHubModal: React.FC<GitHubModalProps> = ({
  open,
  onClose,
  editingProject,
  gitHubForm,
  setGitHubForm,
  handleSaveGitHubSettings,
}) => {
  if (!open || !editingProject) return null;
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
          <div>
            <h2 className="text-lg font-bold text-white">GitHub Settings</h2>
            <p className="text-xs text-[#737373] mt-0.5">{editingProject.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">
              Repository URL
            </label>
            <Input
              value={gitHubForm.github_repo_url}
              onChange={(e) => setGitHubForm((f) => ({ ...f, github_repo_url: e.target.value }))}
              placeholder="https://github.com/org/repo"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">
              Repository Name (org/repo)
            </label>
            <Input
              value={gitHubForm.github_repo_name}
              onChange={(e) => setGitHubForm((f) => ({ ...f, github_repo_name: e.target.value }))}
              placeholder="myorg/myrepo"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">GitHub Token</label>
            <Input
              type="password"
              value={gitHubForm.github_token}
              onChange={(e) => setGitHubForm((f) => ({ ...f, github_token: e.target.value }))}
              placeholder={
                editingProject.has_github_token
                  ? 'Token already set (leave empty to keep)'
                  : 'ghp_xxxx...'
              }
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
            />
            <p className="text-[10px] text-[#737373] mt-1">
              Token needs repo scope for invitations. Leave empty to keep existing token.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
          <Button variant="ghost" onClick={onClose} className="text-[#737373] rounded-xl px-5">
            Cancel
          </Button>
          <Button
            onClick={handleSaveGitHubSettings}
            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
          >
            <Github className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GitHubModal;
