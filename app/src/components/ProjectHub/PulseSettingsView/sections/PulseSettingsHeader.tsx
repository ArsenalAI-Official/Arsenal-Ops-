import React from 'react';
import { RotateCcw, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface PulseSettingsHeaderProps {
  isSaving: boolean;
  clearStage: 'idle' | 'first' | 'second';
  setClearStage: (stage: 'idle' | 'first' | 'second') => void;
  onReset: () => void;
  onClear: () => void;
}

const PulseSettingsHeader: React.FC<PulseSettingsHeaderProps> = ({
  isSaving,
  clearStage,
  setClearStage,
  onReset,
  onClear,
}) => {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div className="flex items-center gap-2 text-xs text-[#737373]">
          <Settings className="w-3.5 h-3.5" />
          <span>Admin</span>
          <span>›</span>
          <span className="text-[#a3a3a3]">Pulse Settings</span>
        </div>
        <h2 className="text-xl font-semibold text-white mt-1">Pulse data inputs</h2>
        <p className="text-sm text-[#737373] mt-0.5">
          Edit the variables that drive the Pulse view. Saved per project.
        </p>
      </div>
      {/* Why no top save button: F9 consolidated to the sticky bottom bar
       *  to remove the duplicate-handler trap. Audit caption (Last saved
       *  by X) moves alongside it down there. The header only carries
       *  Reset because Reset is destructive and benefits from being far
       *  from the dirty-state Save button. */}
      <div className="flex items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isSaving}
              className="border-[#EF4444]/30 text-[#FCA5A5] hover:bg-[#EF4444]/10 hover:text-[#FCA5A5]"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to dummy data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset Pulse data?</AlertDialogTitle>
              <AlertDialogDescription>
                This overwrites every editorial field — narrative, ledger, risks, milestone
                financials, monthly cost categories — with the dummy fixture. The server-saved blob
                is replaced. There is no undo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onReset}
                className="bg-[#EF4444] text-white hover:bg-[#DC2626]"
              >
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* "Clear all data" — distinct from "Reset to dummy data": the
            latter restores the demo fixture, this wipes to truly empty.
            Two-stage confirmation because the action is irreversible and
            destructive of *all* Pulse editorial content. */}
        <Button
          variant="outline"
          size="sm"
          disabled={isSaving}
          onClick={() => setClearStage('first')}
          className="border-[#EF4444]/30 text-[#FCA5A5] hover:bg-[#EF4444]/10 hover:text-[#FCA5A5]"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear all data
        </Button>

        {/* Stage 1 — first prompt. Confirm advances to stage 2 rather than
            firing the destructive action immediately. */}
        <AlertDialog
          open={clearStage === 'first'}
          onOpenChange={(open) => {
            if (!open) setClearStage('idle');
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all Pulse data?</AlertDialogTitle>
              <AlertDialogDescription>
                This wipes every editorial field on this project's Pulse — narrative, ledger, risks,
                milestones, monthly cost categories, billing inputs — to zero. There is no undo.
                You'll be asked to confirm one more time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  // Don't let the AlertDialogAction close the root — we
                  // want to chain straight into the second prompt.
                  e.preventDefault();
                  setClearStage('second');
                }}
                className="bg-[#EF4444] text-white hover:bg-[#DC2626]"
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Stage 2 — final confirmation. Only this dialog's action button
            actually clears the data. Stronger language so a habitual
            "yes-clicker" still gets a pause. */}
        <AlertDialog
          open={clearStage === 'second'}
          onOpenChange={(open) => {
            if (!open) setClearStage('idle');
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently clears all Pulse data for this project. The server-saved blob will
                be replaced with an empty payload immediately. You will lose every manually-entered
                narrative, ledger row, risk, milestone budget, and billing row.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onClear}
                className="bg-[#EF4444] text-white hover:bg-[#DC2626]"
              >
                Yes, clear all data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default PulseSettingsHeader;
