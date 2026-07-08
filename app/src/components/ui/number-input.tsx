import { ChevronDown, ChevronUp } from 'lucide-react';
import { forwardRef, useRef } from 'react';
import { cn } from '@/lib/utils';

// React-compatible synthetic value update — avoids controlled-input staleness.
const nativeSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  'value',
)?.set;

function fireChange(el: HTMLInputElement, value: number) {
  nativeSetter?.call(el, String(value));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export type NumberInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

// Drop-in replacement for <Input type="number">.
//
// Layout: [ChevronDown] [value] [ChevronUp]
// Each chevron is a distinct focusable button at opposite ends of the field,
// giving generous individual click targets instead of two cramped controls
// stacked in the same corner. No background fill — only icon colour changes
// on hover/active/disabled to keep the surface minimal.
const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, min, max, step, disabled, ...props }, forwardedRef) => {
    const innerRef = useRef<HTMLInputElement>(null);

    // Merge forwarded ref with internal ref so both callers and this component
    // can access the underlying <input> element.
    const mergedRef = (node: HTMLInputElement | null) => {
      (innerRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };

    const stepVal = Number(step ?? 1);
    const minVal = min !== undefined ? Number(min) : -Infinity;
    const maxVal = max !== undefined ? Number(max) : Infinity;

    const adjust = (delta: number) => {
      const el = innerRef.current;
      if (!el || disabled) return;
      const next = Math.min(maxVal, Math.max(minVal, (parseFloat(el.value) || 0) + delta));
      fireChange(el, next);
      el.focus();
    };

    const chevron = cn(
      'flex-shrink-0 flex items-center justify-center px-2 h-full',
      'text-[#3a3a3a] transition-colors duration-100',
      'hover:text-progress active:text-white',
      'focus-visible:outline-none focus-visible:text-progress',
      'disabled:opacity-25 disabled:cursor-not-allowed',
    );

    return (
      <div
        className={cn(
          'flex items-center rounded-xl overflow-hidden',
          'bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)]',
          'focus-within:border-[rgba(255,255,255,0.15)] transition-colors duration-100',
          disabled && 'opacity-50',
          className,
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Decrease"
          disabled={!!disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            adjust(-stepVal);
          }}
          className={cn(chevron, 'border-r border-[rgba(255,255,255,0.06)]')}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        <input
          ref={mergedRef}
          type="number"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          {...props}
          className="flex-1 min-w-0 bg-transparent text-[#F4F6FF] text-sm h-full px-2 text-center tabular-nums outline-none focus:outline-none focus:ring-0 focus:shadow-none"
        />

        <button
          type="button"
          tabIndex={-1}
          aria-label="Increase"
          disabled={!!disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            adjust(stepVal);
          }}
          className={cn(chevron, 'border-l border-[rgba(255,255,255,0.06)]')}
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  },
);

NumberInput.displayName = 'NumberInput';

export { NumberInput };
