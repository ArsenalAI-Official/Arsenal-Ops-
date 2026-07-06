import { Calendar as CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { parseLocalDate, formatLocalDate } from '@/components/ProjectsPage/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PRIORITY_COLOR, STATUS_CONFIG } from '@/lib/workItemConfig';
import { EditableSelect, type EditableSelectOption } from './EditableSelect';
import { HoursBlock } from './HoursBlock';
import { PropertyRow } from './PropertyRow';
import { CALENDAR_CLASS_NAMES } from '../../constants';
import { avatarColor } from '../../lib/renderContent';
import type { WorkItem } from '../../types';

// A developer option for the Assignee dropdown. Both variants supply {id,name}
// (compact fetches ProjectDeveloperEntry; full passes the project developers).
export interface RailDeveloper {
  id: number;
  name: string;
}

interface PropertiesRailProps {
  item: WorkItem;
  developers: RailDeveloper[];
  /** project.tracker_write — gates every editable control. */
  canWrite: boolean;
  /** status === 'done' && !editing — freezes all non-status fields (server rule). */
  isFrozen: boolean;
  /** Single edit-in-place seam. The panel routes status → moveMutation and
   *  everything else → the field-patch mutation. Assignee sends BOTH id + name. */
  onPatchField: (edits: Partial<WorkItem>) => void;
}

const STATUS_OPTIONS: EditableSelectOption[] = (
  Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>
)
  .filter((s) => s !== 'backlog')
  .map((s) => ({ value: s, label: STATUS_CONFIG[s].label, dot: STATUS_CONFIG[s].color }));

const PRIORITY_OPTIONS: EditableSelectOption[] = (
  ['critical', 'high', 'medium', 'low'] as const
).map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1), dot: PRIORITY_COLOR[p] }));

// Fibonacci-ish point scale used across the board's create/edit flows.
const STORY_POINT_OPTIONS: EditableSelectOption[] = [0, 1, 2, 3, 5, 8, 13, 21].map((n) => ({
  value: String(n),
  label: `${n} pts`,
}));

// Radix Select forbids an empty-string item value, so the "no assignee" choice
// uses a sentinel that maps back to null on change.
const UNASSIGNED = '__unassigned__';

export const PropertiesRail = ({
  item,
  developers,
  canWrite,
  isFrozen,
  onPatchField,
}: PropertiesRailProps) => {
  const [dateOpen, setDateOpen] = useState(false);
  const isEpic = item.type === 'epic';
  // Non-status fields are locked when the user lacks write access or the ticket
  // is frozen (done). Status stays editable so a done ticket can be re-opened.
  const lockNonStatus = !canWrite || isFrozen;

  const assigneeOptions: EditableSelectOption[] = [
    { value: UNASSIGNED, label: 'Unassigned' },
    ...developers.map((d) => ({
      value: String(d.id),
      label: d.name,
      avatar: { initial: d.name.charAt(0).toUpperCase(), color: avatarColor(d.id) ?? '#737373' },
    })),
  ];

  const dueDate = parseLocalDate(item.due_date ?? undefined);

  return (
    <div className="space-y-5">
      <div className="text-[11px] font-semibold tracking-wider text-[#8A8A8A] uppercase">
        Properties
      </div>

      <PropertyRow label="Status">
        <EditableSelect
          aria-label="Status"
          value={item.status}
          options={STATUS_OPTIONS}
          disabled={!canWrite}
          onValueChange={(status) => onPatchField({ status: status as WorkItem['status'] })}
        />
      </PropertyRow>

      {!isEpic && (
        <PropertyRow label="Assignee">
          <EditableSelect
            aria-label="Assignee"
            value={item.assignee_id != null ? String(item.assignee_id) : UNASSIGNED}
            options={assigneeOptions}
            placeholder="Unassigned"
            disabled={lockNonStatus}
            onValueChange={(val) => {
              const id = val === UNASSIGNED ? null : parseInt(val);
              // Send BOTH the id (persisted) and the display name (drives the
              // "unassigned"/"Assign to me" predicate) so the cache stays honest.
              const name = developers.find((d) => d.id === id)?.name ?? 'Unassigned';
              onPatchField({ assignee_id: id, assignee: name });
            }}
          />
        </PropertyRow>
      )}

      <PropertyRow label="Priority">
        <EditableSelect
          aria-label="Priority"
          value={item.priority}
          options={PRIORITY_OPTIONS}
          disabled={lockNonStatus}
          onValueChange={(priority) => onPatchField({ priority: priority as WorkItem['priority'] })}
        />
      </PropertyRow>

      {!isEpic && (
        <PropertyRow label="Story Points">
          <EditableSelect
            aria-label="Story points"
            value={String(item.story_points ?? 0)}
            options={STORY_POINT_OPTIONS}
            disabled={lockNonStatus}
            onValueChange={(val) => onPatchField({ story_points: parseInt(val) || 0 })}
          />
        </PropertyRow>
      )}

      {(item.epic_key || item.epic) && (
        <PropertyRow label="Epic">
          <div className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#A78BFA]" aria-hidden />
            <span className="truncate text-sm text-[#F4F6FF]">
              {item.epic_key ? `${item.epic_key} · ${item.epic}` : item.epic}
            </span>
          </div>
        </PropertyRow>
      )}

      <PropertyRow label="Due Date">
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button
              disabled={lockNonStatus}
              className="h-9 w-full justify-start rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-left font-normal text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#F4F6FF]"
            >
              <CalendarIcon className="mr-2 h-4 w-4 text-[#8A8A8A]" />
              {dueDate
                ? dueDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Not set'}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto border-[rgba(255,255,255,0.08)] bg-[#0d0d0d] p-0"
            align="start"
          >
            <Calendar
              mode="single"
              selected={dueDate}
              onSelect={(date) => {
                if (date) {
                  onPatchField({ due_date: formatLocalDate(date) });
                  setDateOpen(false);
                }
              }}
              classNames={CALENDAR_CLASS_NAMES}
            />
          </PopoverContent>
        </Popover>
      </PropertyRow>

      {!isEpic && (
        <div className="border-t border-[rgba(255,255,255,0.05)] pt-4">
          <HoursBlock
            allocated={item.assigned_hours}
            logged={item.logged_hours}
            remaining={item.remaining_hours}
          />
        </div>
      )}
    </div>
  );
};
