import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PersonalTask, ProjectSummary, Developer } from '../types';

interface ConvertToTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  convertingTask: PersonalTask | null;
  projects: ProjectSummary[];
  projectMembers: Developer[];
  convertProjectId: string;
  onProjectChange: (projectId: string) => void;
  convertEstimatedHours: string;
  setConvertEstimatedHours: (value: string) => void;
  convertAssigneeId: string;
  setConvertAssigneeId: (value: string) => void;
  isConverting: boolean;
  onConvert: () => void;
}

const ConvertToTicketDialog = ({
  open,
  onOpenChange,
  convertingTask,
  projects,
  projectMembers,
  convertProjectId,
  onProjectChange,
  convertEstimatedHours,
  setConvertEstimatedHours,
  convertAssigneeId,
  setConvertAssigneeId,
  isConverting,
  onConvert,
}: ConvertToTicketDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
        <DialogHeader>
          <DialogTitle>Tag to Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {convertingTask && (
            <div className="p-3 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]">
              <p className="text-sm text-[#a3a3a3]">
                <span className="font-semibold text-white">{convertingTask.title}</span>
              </p>
            </div>
          )}
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Select Project</label>
            <Select value={convertProjectId} onValueChange={onProjectChange}>
              <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                <SelectValue placeholder="Choose a project..." />
              </SelectTrigger>
              <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                {projects.map((project) => (
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
                Assign To <span className="text-[#555]">(optional)</span>
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
                    projectMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id.toString()}>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E0B954] to-[#C79E3B] flex items-center justify-center text-[#080808] text-xs font-bold">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          {member.name}
                        </div>
                      </SelectItem>
                    ))
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
            {isConverting ? 'Creating...' : 'Create Project Ticket'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertToTicketDialog;
