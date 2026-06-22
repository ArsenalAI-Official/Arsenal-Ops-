import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export interface ConfirmOptions {
  title?: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Style the confirm button as a destructive action (red). */
  destructive?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

/** The `confirm` function returned by {@link useConfirm}. Accept this in hooks
 *  that gate a destructive action so the component can own the dialog. */
export type ConfirmFn = (opts?: ConfirmOptions) => Promise<boolean>;

/**
 * Promise-based confirmation dialog — a themed, accessible replacement for the
 * native `window.confirm` that was scattered across ~10 delete handlers. The
 * call site barely changes:
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   // ...render {confirmDialog} once...
 *   const onDelete = async () => {
 *     if (!(await confirm({ title: 'Delete role?', destructive: true }))) return;
 *     deleteMutation.mutate(id);
 *   };
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({ open: false });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      // Re-entrancy guard: if a prior confirm is still pending, resolve it false
      // so its awaiter can't hang forever when overwritten.
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  const confirmDialog = (
    <AlertDialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            {state.title ?? 'Are you sure?'}
          </AlertDialogTitle>
          {/* Always render a description: Radix warns when AlertDialogContent
              has no aria-describedby. Hide it visually when none was provided. */}
          <AlertDialogDescription
            className={cn('text-[#a3a3a3]', state.description == null && 'sr-only')}
          >
            {state.description ?? state.title ?? 'Please confirm this action.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {state.cancelText ?? 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={cn(state.destructive && 'bg-red-600 text-white hover:bg-red-700')}
          >
            {state.confirmText ?? 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, confirmDialog };
}
