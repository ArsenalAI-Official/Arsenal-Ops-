import { Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  epicKey: string;
  epicTitle?: string;
  onOpen?: () => void;
  className?: string;
}

export function EpicChip({ epicKey, epicTitle, onOpen, className }: Props) {
  const fullLabel = epicTitle ? `Epic: ${epicKey} — ${epicTitle}` : `Epic: ${epicKey}`;
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
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md max-w-full',
        'bg-[rgba(167,139,250,0.12)] text-[#A78BFA] hover:bg-[rgba(167,139,250,0.2)]',
        'text-[10px] font-medium transition-colors',
        className,
      )}
    >
      <Target className="w-2.5 h-2.5 shrink-0" />
      <span className="font-mono shrink-0">{epicKey}</span>
      {epicTitle && <span className="truncate text-[#A78BFA]/80">· {epicTitle}</span>}
    </button>
  );
}
