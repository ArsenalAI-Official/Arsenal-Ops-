import type { ChangeEventHandler } from 'react';

export interface WorkItemSelectOption {
  value: string;
  label: string;
}

export interface WorkItemSelectFieldProps {
  label: string;
  /** Controlled binding. Provide EITHER `value` OR `defaultValue`, not both. */
  value?: string;
  /** Uncontrolled binding. Provide EITHER `value` OR `defaultValue`, not both. */
  defaultValue?: string;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  options: readonly WorkItemSelectOption[];
}

const SELECT_CLASS =
  'w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm';

/**
 * Stateless label + styled `<select>` + mapped `<option>`s for the work-item
 * forms (simplify-audit DD-F3 / §1.4). Holds NO internal state: the caller
 * decides controlled (`value`) vs uncontrolled (`defaultValue`) and owns
 * `onChange`. Only the provided binding prop is forwarded, so React never sees
 * both `value` and `defaultValue` on the same element.
 */
export const WorkItemSelectField = ({
  label,
  value,
  defaultValue,
  onChange,
  options,
}: WorkItemSelectFieldProps) => (
  <div>
    <label className="text-xs font-medium text-[#737373] block mb-1.5">{label}</label>
    <select
      {...(value !== undefined ? { value } : { defaultValue })}
      onChange={onChange}
      className={SELECT_CLASS}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);
