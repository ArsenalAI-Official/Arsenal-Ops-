import { cn } from '@/lib/utils';

// Ring spinner matching the app's de-facto loading visual
// (`border-2 border-[#E0B954]/30 border-t-[#E0B954] rounded-full animate-spin`),
// which was hand-rolled inline in ~20 places. Pick a size + tone instead of
// re-typing the classes. Most call sites are pixel-identical to their old
// inline copy; a few differed slightly (e.g. some admin spinners used a solid
// ring with a transparent top — the inverse of the faded-ring tones here) and
// were intentionally unified to this style.

const SIZE: Record<string, string> = {
  xs: 'w-3.5 h-3.5 border-2',
  sm: 'w-5 h-5 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-10 h-10 border-2',
  xl: 'w-12 h-12 border-[3px]',
};

const TONE: Record<string, string> = {
  gold: 'border-[#E0B954]/30 border-t-[#E0B954]',
  white: 'border-white/30 border-t-white',
  muted: 'border-white/20 border-t-white/60',
  red: 'border-red-400/30 border-t-red-400',
};

export type SpinnerProps = React.ComponentProps<'div'> & {
  size?: keyof typeof SIZE;
  tone?: keyof typeof TONE;
};

function Spinner({ size = 'md', tone = 'gold', className, ...props }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('rounded-full animate-spin', SIZE[size], TONE[tone], className)}
      {...props}
    />
  );
}

/** Full-viewport route-level loading fallback (used by App.tsx Suspense). */
function RouteSpinner() {
  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

export { Spinner, RouteSpinner };
