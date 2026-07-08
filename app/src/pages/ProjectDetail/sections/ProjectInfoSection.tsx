import { Github, Info, Pencil, Save, X, Users, Calendar, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { ProjectDetailResponse } from '@/client';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { parseLocalDate } from '@/lib/dateUtils';

interface ProjectInfoSectionProps {
  project: ProjectDetailResponse;
  /** True when the current user is a project admin OR system admin.
   *  Mirrors `isCurrentUserAdmin()` from ProjectDetail. Drives the visibility
   *  of the inline Edit button; the matching backend gate lives on
   *  `PUT /api/projects/{id}` via `require_project_admin`. */
  isCurrentUserAdmin: boolean;
  onSave: (updates: Partial<ProjectDetailResponse>) => void;
}

const ProjectInfoSection = ({ project, isCurrentUserAdmin, onSave }: ProjectInfoSectionProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ProjectDetailResponse>>({});
  const [showCalendarStartDate, setShowCalendarStartDate] = useState(false);
  const [showCalendarEndDate, setShowCalendarEndDate] = useState(false);

  // Defense-in-depth: derive the effective edit mode from BOTH the local
  // toggle and the current admin status. If admin status is revoked
  // mid-session (caps refresh, demotion, etc.), the form + Save controls
  // disappear immediately even though `isEditing` is still true in state.
  // Backend independently enforces `require_project_admin` on the PUT, so
  // this is purely a UI defense — but it stops the misleading "I see
  // editable inputs that would 403 on Save" surface.
  const effectiveIsEditing = isEditing && isCurrentUserAdmin;

  const handleSaveEdit = () => {
    // Mirror of the UI gate — guards against a stale state where
    // `effectiveIsEditing` was true on render but admin flipped before the
    // click landed.
    if (!isCurrentUserAdmin) return;
    onSave(editForm);
    setIsEditing(false);
  };

  return (
    <>
      <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Project Information</h2>
          {!effectiveIsEditing ? (
            isCurrentUserAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditForm(project);
                  setIsEditing(true);
                }}
                className="text-[#737373] hover:text-white"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )
          ) : (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setEditForm(project);
                }}
                className="text-[#737373] hover:text-white"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                className="bg-brand hover:bg-[#C79E3B] text-white"
              >
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
          )}
        </div>

        {effectiveIsEditing ? (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">
                Project Name
              </label>
              <Input
                value={editForm.name || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">Description</label>
              <Textarea
                value={editForm.description || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[120px]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">
                GitHub Repository URL
              </label>
              <Input
                value={editForm.github_repo_url || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, github_repo_url: e.target.value }))}
                placeholder="https://github.com/username/repo"
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Start Date
                </label>
                <Popover open={showCalendarStartDate} onOpenChange={setShowCalendarStartDate}>
                  <PopoverTrigger asChild>
                    <Button className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10">
                      <Calendar className="w-4 h-4 mr-2" />
                      {editForm.created_at
                        ? parseLocalDate(editForm.created_at)?.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]"
                    align="start"
                  >
                    <CalendarIcon
                      mode="single"
                      selected={parseLocalDate(
                        editForm.created_at === null ? undefined : editForm.created_at,
                      )}
                      onSelect={(date) => {
                        if (date) {
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          setEditForm((f) => ({
                            ...f,
                            created_at: `${year}-${month}-${day}`,
                          }));
                          setShowCalendarStartDate(false);
                        }
                      }}
                      classNames={{
                        months: 'flex flex-col',
                        month: 'space-y-4',
                        caption: 'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                        caption_label: 'text-sm font-medium text-white',
                        nav: 'space-x-1 flex items-center',
                        nav_button: 'text-white hover:bg-[rgba(255,255,255,0.12)] rounded p-1',
                        nav_button_previous: 'absolute left-0',
                        nav_button_next: 'absolute right-0',
                        table: 'w-full border-collapse space-y-1',
                        head_row: 'flex gap-1 mb-1',
                        head_cell: 'w-8 h-8 rounded text-[#737373] font-normal text-sm',
                        row: 'flex gap-1 mb-1',
                        cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
                        day: 'p-0 h-8 w-8 rounded bg-transparent text-white text-sm cursor-pointer hover:bg-[rgba(255,255,255,0.12)]',
                        day_selected: 'bg-brand text-[#0d0d0d] font-medium hover:bg-brand',
                        day_today: 'bg-[rgba(255,255,255,0.12)] text-muted-foreground',
                        day_outside: 'text-[#555]',
                        day_disabled: 'text-[#333] cursor-not-allowed',
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">End Date</label>
                <Popover open={showCalendarEndDate} onOpenChange={setShowCalendarEndDate}>
                  <PopoverTrigger asChild>
                    <Button className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10">
                      <Calendar className="w-4 h-4 mr-2" />
                      {editForm.end_date
                        ? parseLocalDate(editForm.end_date)?.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]"
                    align="start"
                  >
                    <CalendarIcon
                      mode="single"
                      selected={parseLocalDate(
                        editForm.end_date === null ? undefined : editForm.end_date,
                      )}
                      onSelect={(date) => {
                        if (date) {
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          setEditForm((f) => ({
                            ...f,
                            end_date: `${year}-${month}-${day}`,
                          }));
                          setShowCalendarEndDate(false);
                        }
                      }}
                      classNames={{
                        months: 'flex flex-col',
                        month: 'space-y-4',
                        caption: 'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                        caption_label: 'text-sm font-medium text-white',
                        nav: 'space-x-1 flex items-center',
                        nav_button: 'text-white hover:bg-[rgba(255,255,255,0.12)] rounded p-1',
                        nav_button_previous: 'absolute left-0',
                        nav_button_next: 'absolute right-0',
                        table: 'w-full border-collapse space-y-1',
                        head_row: 'flex gap-1 mb-1',
                        head_cell: 'w-8 h-8 rounded text-[#737373] font-normal text-sm',
                        row: 'flex gap-1 mb-1',
                        cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
                        day: 'p-0 h-8 w-8 rounded bg-transparent text-white text-sm cursor-pointer hover:bg-[rgba(255,255,255,0.12)]',
                        day_selected: 'bg-brand text-[#0d0d0d] font-medium hover:bg-brand',
                        day_today: 'bg-[rgba(255,255,255,0.12)] text-muted-foreground',
                        day_outside: 'text-[#555]',
                        day_disabled: 'text-[#333] cursor-not-allowed',
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1">Description</label>
              <p className="text-sm text-[#f5f5f5] leading-relaxed">
                {project.description || 'No description provided.'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1">
                GitHub Repository
              </label>
              {project.github_repo_url ? (
                <a
                  href={project.github_repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-info hover:underline"
                >
                  <Github className="w-4 h-4" />
                  {project.github_repo_url}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <p className="text-sm text-[#737373]">No repository configured</p>
              )}
            </div>
            <div className="flex items-center gap-4 pt-3 border-t border-[rgba(255,255,255,0.05)] flex-wrap">
              <div>
                <span className="text-xs text-[#737373]">Start Date</span>
                <p className="text-sm text-[#f5f5f5]">
                  {new Date(project.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-xs text-[#737373]">End Date</span>
                <p className="text-sm text-[#f5f5f5]">
                  {project.end_date ? new Date(project.end_date).toLocaleDateString() : 'Not set'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(255,255,255,0.06)] flex items-center justify-center">
              <Users className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{project.developers?.length ?? 0}</p>
              <p className="text-xs text-[#737373]">Developers</p>
            </div>
          </div>
        </div>
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[rgba(255,255,255,0.06)] flex items-center justify-center">
              <Github className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {(Array.isArray(project.github_repo_urls) && project.github_repo_urls.length > 0) ||
                project.github_repo_url
                  ? 'Yes'
                  : 'No'}
              </p>
              <p className="text-xs text-[#737373]">GitHub Repos</p>
            </div>
          </div>
        </div>
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center">
              <Info className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{project.key_prefix}</p>
              <p className="text-xs text-[#737373]">Key Prefix</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProjectInfoSection;
