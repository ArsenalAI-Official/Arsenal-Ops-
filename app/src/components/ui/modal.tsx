import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** String → standard bold header with an X close button. ReactNode → custom
   *  header rendered in the header bar (the X is still appended). Omit → no
   *  header bar (caller renders its own). */
  title?: ReactNode;
  /** Tailwind max-width class for the panel (default `max-w-md`). */
  maxWidthClass?: string;
  /** Extra classes for the panel (e.g. `max-h-[80vh] flex flex-col`). */
  panelClassName?: string;
  /** Click on the backdrop closes (default true). */
  closeOnBackdrop?: boolean;
  children: ReactNode;
}

/**
 * The app's canonical modal scaffold, extracted from ~19 hand-rolled copies of
 * the same `fixed inset-0 bg-black/60 backdrop-blur-sm … rounded-2xl` overlay +
 * panel + close button. For the `z-50` family of those copies adoption is a
 * visual/behavioral no-op. Note the overlay z-index is hardcoded to `z-50`:
 * nested modals that stack above another modal (e.g. AddSubtaskModal's `z-[60]`,
 * the idle-warning's `z-[100]`) must NOT use this component as-is.
 */
export function Modal({
  open,
  onClose,
  title,
  maxWidthClass = 'max-w-md',
  panelClassName,
  closeOnBackdrop = true,
  children,
}: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={cn(
          'bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full shadow-2xl',
          maxWidthClass,
          panelClassName,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title != null && (
          <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
            {typeof title === 'string' ? (
              <h2 className="text-lg font-bold text-white">{title}</h2>
            ) : (
              title
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
