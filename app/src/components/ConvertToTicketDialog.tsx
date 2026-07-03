import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { avatarColor } from '@/lib/avatarColor';

interface ConvertToTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  convertingTask: { title: string; priority?: string | null } | null;
  projects: { id: number | string; name: string }[];
  projectMembers: { id: number; name: string }[];
  convertProjectId: string;
  onProjectChange: (projectId: string) => void;
  convertAssigneeId: string;
  setConvertAssigneeId: (value: string) => void;
  convertEstimatedHours: string;
  setConvertEstimatedHours: (value: string) => void;
  isConverting: boolean;
  onConvert: () => void;
  /** Sort the project options alphabetically by name. Defaults to true. */
  sortProjects?: boolean;
}

const ConvertToTicketDialog = ({
  open,
  onOpenChange,
  convertingTask,
  projects,
  projectMembers,
  convertProjectId,
  onProjectChange,
  convertAssigneeId,
  setConvertAssigneeId,
  convertEstimatedHours,
  setConvertEstimatedHours,
  isConverting,
  onConvert,
  sortProjects = true,
}: ConvertToTicketDialogProps) => {
  const orderedProjects = sortProjects
    ? [...projects].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      )
    : projects;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
        <DialogHeader>
          <DialogTitle>Tag to Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {convertingTask && (
            <div className="p-3 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]">
              <p className="text-white font-medium text-sm">{convertingTask.title}</p>
              {convertingTask.priority && (
                <p className="text-[#737373] text-xs mt-0.5 capitalize">
                  {convertingTask.priority} priority
                </p>
              )}
            </div>
          )}
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Select Project</label>
            <Select value={convertProjectId} onValueChange={onProjectChange}>
              <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                <SelectValue placeholder="Choose a project..." />
              </SelectTrigger>
              <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                {orderedProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Estimated Hours</label>
            <Input
              value={convertEstimatedHours}
              onChange={(e) => setConvertEstimatedHours(e.target.value)}
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
            />
          </div>
          {convertProjectId && (
            <div>
              <label className="text-xs text-[#737373] mb-1 block">
                Assign To <span className="text-[#555]">(optional — defaults to you)</span>
              </label>
              <Select value={convertAssigneeId} onValueChange={setConvertAssigneeId}>
                <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                  {projectMembers.length === 0 ? (
                    <div className="p-2 text-xs text-[#737373]">
                      No team members in this project
                    </div>
                  ) : (
                    projectMembers.map((member) => {
                      const c = avatarColor(member.id);
                      return (
                        <SelectItem key={member.id} value={member.id.toString()}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{
                                backgroundColor: c.bg,
                                color: c.fg,
                                border: `1px solid ${c.ring}`,
                              }}
                            >
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            {member.name}
                          </div>
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            onClick={onConvert}
            disabled={isConverting || !convertProjectId}
            className="w-full bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold hover:opacity-90"
          >
            {isConverting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Project Ticket'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertToTicketDialog;
