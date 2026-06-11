import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PersonalTask, Project } from '../types';

interface ConvertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTask: PersonalTask | null;
  projects: Project[];
  projectMembers: any[];
  convertProjectId: string;
  onProjectChange: (projectId: string) => void;
  convertEstimatedHours: string;
  setConvertEstimatedHours: (value: string) => void;
  convertAssigneeId: string;
  setConvertAssigneeId: (value: string) => void;
  loading: boolean;
  onConvert: () => void;
}

const ConvertDialog = ({
  open,
  onOpenChange,
  selectedTask,
  projects,
  projectMembers,
  convertProjectId,
  onProjectChange,
  convertEstimatedHours,
  setConvertEstimatedHours,
  convertAssigneeId,
  setConvertAssigneeId,
  loading,
  onConvert,
}: ConvertDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
        <DialogHeader>
          <DialogTitle>Convert to Project Ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          {selectedTask && (
            <div className="p-3 bg-[#0A0A14] rounded border border-[rgba(255,255,255,0.05)]">
              <p className="text-white font-medium">{selectedTask.title}</p>
              <p className="text-[#737373] text-sm">{selectedTask.priority}</p>
            </div>
          )}
          <div>
            <label className="text-sm text-[#737373]">Select Project</label>
            <Select value={convertProjectId} onValueChange={onProjectChange}>
              <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                <SelectValue placeholder="Choose a project..." />
              </SelectTrigger>
              <SelectContent className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-[#737373]">Estimated Hours</label>
            <Input
              value={convertEstimatedHours}
              onChange={(e) => setConvertEstimatedHours(e.target.value)}
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
            />
          </div>
          {convertProjectId && (
            <div>
              <label className="text-sm text-[#737373]">Assign To (optional)</label>
              <Select value={convertAssigneeId} onValueChange={setConvertAssigneeId}>
                <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                  {projectMembers.length === 0 ? (
                    <div className="p-2 text-xs text-[#737373]">
                      No team members in this project
                    </div>
                  ) : (
                    projectMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id.toString()}>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#E0B954] to-[#C79E3B] flex items-center justify-center text-[#080808] text-xs font-bold">
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
            disabled={loading || !convertProjectId}
            className="w-full bg-[#E0B954] hover:bg-[#C79E3B] text-black"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Convert to Ticket'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertDialog;
