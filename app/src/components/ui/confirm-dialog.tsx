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
          {state.description != null && (
            <AlertDialogDescription className="text-[#a3a3a3]">
              {state.description}
            </AlertDialogDescription>
          )}
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
