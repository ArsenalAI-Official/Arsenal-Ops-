import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { useAuth } from '@/contexts/AuthContext';
import { useAllDevelopers } from '@/hooks/useAllDevelopers';
import { apiFetch, ApiError } from '@/lib/api';

/** Minimal work item the modal reports back on success — enough for the caller
 *  to place a calendar block against it. */
export interface CreatedWorkItem {
  id: number;
  key: string;
  title: string;
  type: string;
  status: string;
  assignee_id: number | null;
  remaining_hours: number;
}

interface ProjectRow {
  id: number;
  name: string;
}
interface DeveloperRow {
  id: number;
  name: string;
  email: string;
}

interface CreateWorkItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the work item is created (e.g. to drop a block at a slot). */
  onCreated?: (item: CreatedWorkItem) => void;
}

const TYPES = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'user_story', label: 'Story' },
];

/**
 * Minimal shared "create a work item" dialog (project + title + type + assignee
 * + estimate). The calendar opens it from a double-click on empty grid or the
 * palette "+ New" button; it's intentionally generic so other surfaces can
 * reuse it instead of duplicating a create flow.
 */
export function CreateWorkItemModal({ open, onOpenChange, onCreated }: CreateWorkItemModalProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: projects = [] } = useQuery<ProjectRow[]>({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectRow[]>('/api/projects/'),
  });
  const { data: developers = [] } = useAllDevelopers<DeveloperRow>();

  // Default the assignee to the current user's developer row (matched by email)
  // so the new ticket is immediately log-able by them on the calendar.
  const selfDevId = useMemo(
    () => developers.find((d) => d.email && d.email === user?.email)?.id ?? null,
    [developers, user?.email],
  );

  const [projectId, setProjectId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState('task');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [estimate, setEstimate] = useState('');

  // Seed assignee with self once developers load (only if the user hasn't picked).
  const effectiveAssignee = assigneeId || (selfDevId != null ? String(selfDevId) : '');

  const reset = () => {
    setProjectId('');
    setTitle('');
    setType('task');
    setAssigneeId('');
    setEstimate('');
  };

  // Clear stale field values whenever the modal closes (cancel, Esc, backdrop),
  // so reopening starts fresh — not just on the success path.
  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<CreatedWorkItem>('/api/workitems/', {
        method: 'POST',
        body: JSON.stringify({
          project_id: Number(projectId),
          title: title.trim(),
          type,
          assignee_id: effectiveAssignee ? Number(effectiveAssignee) : null,
          estimated_hours: estimate ? parseInt(estimate, 10) : 0,
        }),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      toast.success(`Created ${created.key}`);
      onCreated?.({
        id: created.id,
        key: created.key,
        title: created.title,
        type: created.type,
        status: created.status,
        assignee_id: created.assignee_id,
        remaining_hours: created.remaining_hours ?? 0,
      });
      reset();
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to create ticket'),
  });

  const canSubmit = projectId !== '' && title.trim().length > 0 && !createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#0f0f0f] border-white/10 text-[#f5f5f5]">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="text-[12px] text-[#a3a3a3]">
            <span className="block mb-1">Project</span>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger aria-label="Project">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-[12px] text-[#a3a3a3]">
            <span className="block mb-1">Title</span>
            <Input
              aria-label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
            />
          </div>

          <div className="flex gap-3">
            <div className="text-[12px] text-[#a3a3a3] flex-1">
              <span className="block mb-1">Type</span>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger aria-label="Type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-[12px] text-[#a3a3a3] w-28">
              <span className="block mb-1">Estimate (h)</span>
              <Input
                aria-label="Estimate in hours"
                type="number"
                min="0"
                step="1"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
              />
            </div>
          </div>

          <div className="text-[12px] text-[#a3a3a3]">
            <span className="block mb-1">Assignee</span>
            <Select value={effectiveAssignee} onValueChange={setAssigneeId}>
              <SelectTrigger aria-label="Assignee">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {developers.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                    {d.id === selfDevId ? ' (you)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => createMutation.mutate()}>
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
