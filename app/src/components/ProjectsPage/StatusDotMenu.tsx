import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { STATUS_COLOR } from './constants';

const MENU_STATUSES: { value: string; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Completed' },
];

const statusLabel = (s: string) =>
  MENU_STATUSES.find((m) => m.value === s)?.label ??
  s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

interface StatusDotMenuProps {
  status: string;
  onChange: (newStatus: string) => void;
}

const StatusDotMenu = ({ status, onChange }: StatusDotMenuProps) => {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const color = STATUS_COLOR[status] || '#555';

  const handleSelect = (e: React.MouseEvent, value: string) => {
    e.stopPropagation();
    setOpen(false);
    if (value !== status) onChange(value);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Status: ${statusLabel(status)}. Click to change.`}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs flex-shrink-0 cursor-pointer outline-none"
          style={{
            color,
            backgroundColor: hovered || open ? `${color}25` : `${color}15`,
            transition: 'background-color 150ms ease',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          {statusLabel(status)}
          <ChevronDown
            className="w-3 h-3 opacity-60 flex-shrink-0"
            style={{
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
            }}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        onClick={(e) => e.stopPropagation()}
        className="w-44 p-1 bg-[#141414] border border-[rgba(255,255,255,0.08)] rounded-lg shadow-xl"
      >
        <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[#737373]">
          Set status
        </div>
        {MENU_STATUSES.map((option) => {
          const isCurrent = option.value === status;
          const optionColor = STATUS_COLOR[option.value] || '#555';
          return (
            <button
              key={option.value}
              type="button"
              onClick={(e) => handleSelect(e, option.value)}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors text-left ${
                isCurrent
                  ? 'bg-[rgba(255,255,255,0.05)] text-white'
                  : 'text-[#d4d4d4] hover:bg-[rgba(255,255,255,0.04)] hover:text-white'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: optionColor }}
              />
              <span className="flex-1">{option.label}</span>
              {isCurrent && <Check className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
};

export default StatusDotMenu;
