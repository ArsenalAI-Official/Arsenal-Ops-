import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Download, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/config/api';
import { ApiError } from '@/lib/api';
import { parseLocalDate, formatLocalDate } from '@/components/ProjectsPage/utils';

interface ExistingTemplate {
  start_date: string;
  end_date: string;
  sprint_weeks: number;
}

interface GenerateRoadmapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  projectName: string;
  existingTemplate?: ExistingTemplate | null;
}

interface FormState {
  startDate: string;
  endDate: string;
  sprintWeeks: number;
}

// Snap any date to the Monday of its ISO week. Used ONLY for previewing the
// week-grid that lands in the generated xlsx — the user's selected dates are
// stored verbatim (matching the Due Date picker pattern elsewhere in the app).
function snapToMondayISO(iso: string): string {
  const d = parseLocalDate(iso);
  if (!d) return iso;
  // JS getDay(): Sunday=0, Monday=1, ..., Saturday=6.
  // Convert to ISO weekday where Monday=0 so we can subtract directly.
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday);
  return formatLocalDate(d);
}

function todayISO(): string {
  return formatLocalDate(new Date());
}

function addWeeksISO(iso: string, weeks: number): string {
  const d = parseLocalDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + weeks * 7);
  return formatLocalDate(d);
}

function defaultFormState(): FormState {
  const start = todayISO();
  return { startDate: start, endDate: addWeeksISO(start, 12), sprintWeeks: 2 };
}

// Count how many Monday-anchored weeks the generated file will contain.
// Mirrors the backend's build_week_dates(start, end) which snaps both ends
// to Monday and emits one row per inclusive week.
function countSnappedWeeks(startISO: string, endISO: string): number {
  const start = parseLocalDate(snapToMondayISO(startISO));
  const end = parseLocalDate(snapToMondayISO(endISO));
  if (!start || !end || end < start) return 0;
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(days / 7) + 1;
}

async function fetchRoadmapBlob(
  projectId: number,
  body: { start_date: string; end_date: string; sprint_weeks: number },
): Promise<{ blob: Blob; filename: string }> {
  const token = localStorage.getItem('token');
  const res = await fetch(
    `${API_BASE_URL}/api/prd/projects/${projectId}/generate-roadmap-template`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = await res.json();
      detail = json.detail ?? detail;
    } catch {
      // Non-JSON error body — fall back to statusText.
    }
    throw new ApiError(res.status, detail);
  }

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? 'roadmap_template.xlsx';
  const blob = await res.blob();
  return { blob, filename };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Reused tailwind classes for the date-picker trigger button (matches the
// styling used in CreateSprintModal for a consistent look).
const TRIGGER_CLASSES =
  'w-full bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 justify-start font-normal';

// Calendar visual classes — copied verbatim from CreateSprintModal to keep
// the popover look consistent across the app.
const CALENDAR_CLASSNAMES = {
  months: 'flex flex-col',
  month: 'space-y-4',
  caption: 'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
  caption_label: 'text-sm font-medium text-white',
  nav: 'space-x-1 flex items-center',
  nav_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
  nav_button_previous: 'absolute left-0',
  nav_button_next: 'absolute right-0',
  table: 'w-full border-collapse space-y-1',
  head_row: 'flex',
  head_cell: 'text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded',
  row: 'flex w-full gap-1',
  cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent',
  day: 'h-8 w-8 p-0 font-normal',
  day_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors',
  day_selected: 'bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold',
  day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold',
  day_outside: 'text-[#444]',
  day_disabled: 'text-[#333] opacity-50 cursor-not-allowed',
  day_range_middle: 'aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white',
  day_hidden: 'invisible',
};

const GenerateRoadmapModal = ({
  open,
  onOpenChange,
  projectId,
  projectName,
  existingTemplate,
}: GenerateRoadmapModalProps) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  // Pre-fill from the saved template when the modal opens. setState-in-effect
  // is intentional here: we're syncing props (existingTemplate) into local
  // form state on open, the standard pattern CLAUDE.md sanctions with an
  // inline disable.
  useEffect(() => {
    if (!open) return;
    if (existingTemplate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        startDate: existingTemplate.start_date,
        endDate: existingTemplate.end_date,
        sprintWeeks: existingTemplate.sprint_weeks,
      });
    } else {
      setForm(defaultFormState());
    }
  }, [open, existingTemplate]);

  const generateMutation = useMutation({
    mutationFn: () =>
      fetchRoadmapBlob(projectId, {
        start_date: form.startDate,
        end_date: form.endDate,
        sprint_weeks: form.sprintWeeks,
      }),
    onSuccess: ({ blob, filename }) => {
      triggerDownload(blob, filename);
      queryClient.invalidateQueries({ queryKey: ['roadmapTemplate', projectId] });
      toast.success('Roadmap template downloaded');
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const detail = err instanceof ApiError ? err.message : 'Failed to generate roadmap template';
      toast.error(detail);
    },
  });

  const isInvalidRange = form.endDate < form.startDate;
  const isPending = generateMutation.isPending;
  const totalWeeks = countSnappedWeeks(form.startDate, form.endDate);

  const handleStartSelect = (date: Date | undefined) => {
    if (!date) return;
    const picked = formatLocalDate(date);
    setForm((prev) => {
      // If the new start pushes past the current end, bump the end forward
      // by the existing duration so the user doesn't have to re-pick.
      const prevSpan = Math.max(1, countSnappedWeeks(prev.startDate, prev.endDate));
      const newEnd = picked > prev.endDate ? addWeeksISO(picked, prevSpan - 1) : prev.endDate;
      return { ...prev, startDate: picked, endDate: newEnd };
    });
    setStartOpen(false);
  };

  const handleEndSelect = (date: Date | undefined) => {
    if (!date) return;
    setForm((prev) => ({ ...prev, endDate: formatLocalDate(date) }));
    setEndOpen(false);
  };

  const startDisplay = parseLocalDate(form.startDate)?.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const endDisplay = parseLocalDate(form.endDate)?.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#E0B954]" />
            Generate roadmap template
          </DialogTitle>
          <DialogDescription className="text-[#a3a3a3]">
            Build a starter roadmap for <span className="text-white">{projectName}</span> from the
            latest PRD analysis. Edit assignees and weekly hours, then re-upload via the roadmap
            importer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">Start date</label>
              <Popover open={startOpen} onOpenChange={setStartOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`${TRIGGER_CLASSES} ${!form.startDate ? 'text-[#737373]' : ''}`}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {startDisplay ?? 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="start"
                  className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]"
                >
                  <CalendarIcon
                    mode="single"
                    selected={parseLocalDate(form.startDate)}
                    onSelect={handleStartSelect}
                    classNames={CALENDAR_CLASSNAMES}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">End date</label>
              <Popover
                open={endOpen && !!form.startDate}
                onOpenChange={(o) => form.startDate && setEndOpen(o)}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={!form.startDate}
                    className={`${TRIGGER_CLASSES} ${!form.endDate ? 'text-[#737373]' : ''}`}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {endDisplay ?? 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="start"
                  className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]"
                >
                  <CalendarIcon
                    mode="single"
                    defaultMonth={
                      parseLocalDate(form.endDate) ?? parseLocalDate(form.startDate) ?? undefined
                    }
                    selected={parseLocalDate(form.endDate)}
                    onSelect={handleEndSelect}
                    disabled={(date) => {
                      const start = parseLocalDate(form.startDate);
                      return start ? date < start : false;
                    }}
                    classNames={CALENDAR_CLASSNAMES}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <label
              className="text-xs font-medium text-[#737373] block mb-1.5"
              htmlFor="roadmap-sprint-weeks"
            >
              Sprint length (weeks)
            </label>
            <Input
              id="roadmap-sprint-weeks"
              type="number"
              min={1}
              max={6}
              value={form.sprintWeeks}
              onChange={(e) => setForm({ ...form, sprintWeeks: Number(e.target.value) || 1 })}
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-white rounded-xl h-10"
            />
          </div>

          {!isInvalidRange && totalWeeks > 0 && (
            <p className="text-xs text-[#737373]">
              Template will contain <span className="text-[#E0B954] font-medium">{totalWeeks}</span>{' '}
              {totalWeeks === 1 ? 'week column' : 'week columns'}, starting{' '}
              <span className="text-[#E0B954] font-medium">
                {parseLocalDate(snapToMondayISO(form.startDate))?.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>{' '}
              (the Monday on or before your start date — roadmap columns are weekly).
            </p>
          )}

          {isInvalidRange && (
            <p className="text-xs text-[#EF4444]">End date must be on or after start date.</p>
          )}
        </div>

        <DialogFooter className="pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="bg-transparent border-[rgba(255,255,255,0.08)] text-white hover:bg-[rgba(255,255,255,0.04)]"
          >
            Cancel
          </Button>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={isPending || isInvalidRange}
            className="bg-[#E0B954] hover:bg-[#C79E3B] text-black"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-1" />
                Generate &amp; download
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateRoadmapModal;
