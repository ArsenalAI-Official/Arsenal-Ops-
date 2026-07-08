import * as SelectPrimitive from '@radix-ui/react-select';
import { CheckIcon } from 'lucide-react';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';

// An inline edit-in-place dropdown for the Properties rail. Wraps the shadcn
// (Radix) Select — which already implements the listbox pattern, keyboard nav,
// and typeahead — and adds an optional leading colored dot or avatar.
//
// The marker is a SIBLING of the item's text (not inside ItemText) and is
// aria-hidden, so: (a) typeahead + the accessible name rely on the label alone,
// and (b) SelectValue (which mirrors only ItemText) shows just the label — we
// render the trigger's marker explicitly, avoiding the doubled-marker bug you
// get if the marker lives inside ItemText.
export interface EditableSelectOption {
  value: string;
  label: string;
  /** Leading colored status/priority dot (hex). */
  dot?: string;
  /** Leading avatar bubble (initial + hex color) for people/epics. */
  avatar?: { initial: string; color: string };
}

interface EditableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: EditableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  'aria-label': string;
}

const Marker = ({ option }: { option?: EditableSelectOption }) => {
  if (option?.avatar) {
    return (
      <span
        aria-hidden
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
        style={{ backgroundColor: `${option.avatar.color}22`, color: option.avatar.color }}
      >
        {option.avatar.initial}
      </span>
    );
  }
  if (option?.dot) {
    return (
      <span
        aria-hidden
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: option.dot }}
      />
    );
  }
  return null;
};

export const EditableSelect = ({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  'aria-label': ariaLabel,
}: EditableSelectProps) => {
  const selected = options.find((o) => o.value === value);
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-9 w-full rounded-lg border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.05)]"
      >
        {/* Group the explicit marker + label so justify-between keeps them left
            and the chevron right. SelectValue renders only the label text. */}
        <span className="flex min-w-0 items-center gap-2">
          <Marker option={selected} />
          <SelectValue placeholder={placeholder} />
        </span>
      </SelectTrigger>
      <SelectContent className="border-[rgba(255,255,255,0.08)] bg-[#0d0d0d] text-[#F4F6FF]">
        {options.map((o) => (
          <SelectPrimitive.Item
            key={o.value}
            value={o.value}
            className="relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm text-[#F4F6FF] outline-hidden select-none focus:bg-[rgba(255,255,255,0.06)] focus:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
          >
            <Marker option={o} />
            <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
            <span className="absolute right-2 flex size-3.5 items-center justify-center">
              <SelectPrimitive.ItemIndicator>
                <CheckIcon className="size-4" />
              </SelectPrimitive.ItemIndicator>
            </span>
          </SelectPrimitive.Item>
        ))}
      </SelectContent>
    </Select>
  );
};
