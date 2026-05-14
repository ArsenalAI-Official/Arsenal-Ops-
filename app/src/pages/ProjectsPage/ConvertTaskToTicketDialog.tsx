import React from 'react';
import { Loader2 } from 'lucide-react';
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

interface PersonalTask {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  estimated_hours: number;
  due_date?: string;
  tags: string[];
  is_converted: boolean;
  project_id?: number;
  work_item_id?: number;
}

interface Project {
  id: number;
  name: string;
}

interface ProjectMember {
  id: number;
  name: string;
  email: string;
}

interface ConvertTaskToTicketDialogProps {
  showConvertDialog: boolean;
  setShowConvertDialog: (open: boolean) => void;
  convertingTask: PersonalTask | null;
  convertProjectId: string;
  setConvertProjectId: (id: string) => void;
  convertAssigneeId: string;
  setConvertAssigneeId: (id: string) => void;
  convertEstimatedHours: string;
  setConvertEstimatedHours: (hours: string) => void;
  setMemberLookupProjectId: (id: string) => void;
  projectMembersForLookup: ProjectMember[];
  projects: Project[];
  convertToTicket: () => void;
  convertingTicket: boolean;
}

const ConvertTaskToTicketDialog: React.FC<ConvertTaskToTicketDialogProps> = ({
  showConvertDialog,
  setShowConvertDialog,
  convertingTask,
  convertProjectId,
  setConvertProjectId,
  convertAssigneeId,
  setConvertAssigneeId,
  convertEstimatedHours,
  setConvertEstimatedHours,
  setMemberLookupProjectId,
  projectMembersForLookup,
  projects,
  convertToTicket,
  convertingTicket,
}) => {
  return (
    <Dialog
      open={showConvertDialog}
      onOpenChange={(open) => {
        setShowConvertDialog(open);
        if (!open) {
          setConvertProjectId('');
          setConvertAssigneeId('');
          setConvertEstimatedHours('');
          setMemberLookupProjectId('');
        }
      }}
    >
      <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
        <DialogHeader>
          <DialogTitle>Tag to Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {convertingTask && (
            <div className="p-3 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]">
              <p className="text-white font-medium text-sm">{convertingTask.title}</p>
              <p className="text-[#737373] text-xs mt-0.5 capitalize">
                {convertingTask.priority} priority
              </p>
            </div>
          )}
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Select Project</label>
            <Select
              value={convertProjectId}
              onValueChange={(v) => {
                setConvertProjectId(v);
                setConvertAssigneeId('');
                setMemberLookupProjectId(v);
              }}
            >
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
                Assign To <span className="text-[#555]">(optional — defaults to you)</span>
              </label>
              <Select value={convertAssigneeId} onValueChange={setConvertAssigneeId}>
                <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                  {projectMembersForLookup.length === 0 ? (
                    <div className="p-2 text-xs text-[#737373]">
                      No team members in this project
                    </div>
                  ) : (
                    projectMembersForLookup.map((member) => (
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
            onClick={convertToTicket}
            disabled={convertingTicket || !convertProjectId}
            className="w-full bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold hover:opacity-90"
          >
            {convertingTicket ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Create Project Ticket'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertTaskToTicketDialog;
