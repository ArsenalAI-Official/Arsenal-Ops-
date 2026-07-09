import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { HierarchyItem, WorkItemType } from '@/lib/hierarchy/validateReparent';
import { cn } from '@/lib/utils';

export interface WorkItemComboboxItem extends HierarchyItem {
  key?: string;
  title?: string;
}

interface Props {
  value: number | null;
  valueKey?: string | null;
  items: WorkItemComboboxItem[];
  allowedTypes: WorkItemType[];
  excludeIds?: Set<number>;
  onChange: (id: number | null, key: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  clearLabel?: string;
  id?: string;
}

export function WorkItemCombobox({
  value,
  valueKey,
  items,
  allowedTypes,
  excludeIds,
  onChange,
  placeholder = 'Select…',
  disabled,
  clearLabel = 'Clear selection',
  id,
}: Props) {
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    return items
      .filter((it) => allowedTypes.includes(it.type))
      .filter((it) => {
        const n = Number(it.id);
        if (Number.isNaN(n)) return false;
        if (excludeIds?.has(n)) return false;
        return true;
      })
      .sort((a, b) => (a.key ?? '').localeCompare(b.key ?? ''));
  }, [items, allowedTypes, excludeIds]);

  const selected = useMemo(() => {
    if (value == null) return null;
    return items.find((it) => Number(it.id) === value) ?? null;
  }, [items, value]);

  const triggerLabel = selected
    ? `${selected.key ?? ''} ${selected.title ?? ''}`.trim() || selected.key || `#${value}`
    : valueKey
      ? valueKey
      : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            'flex w-full h-10 items-center justify-between rounded-xl border px-3 text-left text-sm transition-colors',
            'bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF]',
            'hover:bg-[rgba(255,255,255,0.04)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            !selected && !valueKey && 'text-[#737373]',
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 text-[#737373] shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]"
      >
        <Command className="bg-transparent">
          <CommandInput placeholder="Search by key or title…" className="text-[#F4F6FF]" />
          <CommandList>
            <CommandEmpty className="text-xs text-[#737373] py-4 text-center">
              No matching items
            </CommandEmpty>
            {value != null && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onChange(null, null);
                    setOpen(false);
                  }}
                  className="text-[#a3a3a3] data-[selected=true]:bg-[rgba(239,68,68,0.12)] data-[selected=true]:text-[#EF4444]"
                >
                  <X className="mr-2 h-3.5 w-3.5" />
                  {clearLabel}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((opt) => {
                const isSelected = Number(opt.id) === value;
                return (
                  <CommandItem
                    key={opt.id}
                    value={`${opt.key ?? ''} ${opt.title ?? ''} ${opt.id}`}
                    onSelect={() => {
                      onChange(Number(opt.id), opt.key ?? null);
                      setOpen(false);
                    }}
                    className="text-[#F4F6FF] data-[selected=true]:bg-[rgba(255,255,255,0.12)] data-[selected=true]:text-white"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-3.5 w-3.5',
                        isSelected ? 'opacity-100 text-muted-foreground' : 'opacity-0',
                      )}
                    />
                    <span className="text-[10px] font-mono text-muted-foreground mr-2 shrink-0">
                      {opt.key}
                    </span>
                    <span className="truncate">{opt.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
