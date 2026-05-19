import { CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  parentKey: string;
  parentTitle?: string;
  onOpen?: () => void;
  className?: string;
}

export function ParentChip({ parentKey, parentTitle, onOpen, className }: Props) {
  const fullLabel = parentTitle
    ? `Subtask of ${parentKey} — ${parentTitle}`
    : `Subtask of ${parentKey}`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
      }}
      title={fullLabel}
      aria-label={fullLabel}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md',
        'bg-[rgba(255,255,255,0.04)] text-[#737373] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#a3a3a3]',
        'text-[10px] font-medium transition-colors',
        className,
      )}
    >
      <CornerDownRight className="w-2.5 h-2.5 shrink-0" />
      <span className="font-mono shrink-0">{parentKey}</span>
    </button>
  );
}
