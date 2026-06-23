import { lazy, Suspense, type ComponentProps } from 'react';
import type { SprintResponse } from '@/client';
import type { WorkItem } from '@/types/workItems';
import ArchitectureEditorWrapper from '../ArchitectureEditorWrapper';
import type { Project } from '../hooks/useBoardData';
// EditSprintModal's file also exports the CompleteSprintConfirm /
// DeleteSprintConfirm confirmation modals as named exports, which must be
// available eagerly. That static import already pulls the file into the main
// bundle, so a separate `lazy(() => import(...))` for EditSprintModal can't
// move it into its own chunk — Rollup would emit a warning and keep it inline.
// Keep EditSprintModal as a static import to match reality (R4).
import EditSprintModal, {
  CompleteSprintConfirm,
  DeleteSprintConfirm,
} from '../modals/EditSprintModal';
// The lazy boundaries below are preserved exactly as they were in the
// orchestrator (R5): each modal/drawer is its own chunk, loaded on demand
// behind its own <Suspense fallback={null}>. Keep the AIPlanningModal import
// path unchanged.
const AIPlanningModal = lazy(() => import('../modals/AIPlanningModal'));
const CreateItemModal = lazy(() => import('../modals/CreateItemModal'));
const CreateSprintModal = lazy(() => import('../modals/CreateSprintModal'));
const ItemDetailDrawer = lazy(() => import('../ItemDetailDrawer'));
import ReviewerPanel from '../ReviewerPanel';

// Prop types are derived from the rendered components so the contract stays
// byte-identical to the inline JSX it replaced — no hand-rolled shapes that
// can drift from the modals' real signatures.
type DrawerProps = ComponentProps<typeof ItemDetailDrawer>;
type CreateItemProps = ComponentProps<typeof CreateItemModal>;
type AIProps = ComponentProps<typeof AIPlanningModal>;
type CreateSprintProps = ComponentProps<typeof CreateSprintModal>;
type EditSprintProps = ComponentProps<typeof EditSprintModal>;
type CompleteConfirmProps = ComponentProps<typeof CompleteSprintConfirm>;
type DeleteConfirmProps = ComponentProps<typeof DeleteSprintConfirm>;
type ReviewerProps = ComponentProps<typeof ReviewerPanel>;
type ArchEditorProps = ComponentProps<typeof ArchitectureEditorWrapper>;

export interface BoardModalsProps {
  // ── Shared data ────────────────────────────────────────────────────────
  // Canonical superset types (the orchestrator passes these) so the same
  // values satisfy both the drawer's narrower WorkItemPanel types and the
  // sprint-confirm / create modals' rich shapes — exactly as inline before.
  selectedItem: WorkItem | null;
  workItems: WorkItem[];
  sprints: SprintResponse[];
  project: Project;
  allDevelopers: DrawerProps['allDevelopers'];
  id: DrawerProps['id'];
  token: DrawerProps['token'];
  navigate: DrawerProps['navigate'];
  parseLocalDate: DrawerProps['parseLocalDate'];
  isSavingEdit: DrawerProps['isSavingEdit'];
  onSaveEdit: DrawerProps['onSaveEdit'];
  onDeleteItem: DrawerProps['onDeleteItem'];
  onStatusChange: DrawerProps['onStatusChange'];
  onLogHours: DrawerProps['onLogHours'];
  isLoggingHours: DrawerProps['isLoggingHours'];
  onMoveToSprint: DrawerProps['onMoveToSprint'];
  onSubmitComment: DrawerProps['onSubmitComment'];
  getNextSprint: DrawerProps['getNextSprint'];

  // ── Create item modal ──────────────────────────────────────────────────
  showCreateForm: boolean;
  createFormType: CreateItemProps['initialType'];
  isCreatingItem: CreateItemProps['isCreatingItem'];
  existingTags: CreateItemProps['existingTags'];
  onCloseCreateForm: CreateItemProps['onClose'];
  onSubmitCreateItem: CreateItemProps['onSubmit'];

  // ── AI planning modal ──────────────────────────────────────────────────
  showAIModal: boolean;
  architectures: AIProps['architectures'];
  setArchitectures: AIProps['setArchitectures'];
  onEditArchitecture: AIProps['onEditArchitecture'];
  startDate: AIProps['startDate'];
  setStartDate: AIProps['setStartDate'];
  endDate: AIProps['endDate'];
  setEndDate: AIProps['setEndDate'];
  onCloseAIModal: AIProps['onClose'];
  onAIPlanningCommitted: AIProps['onCommitted'];
  setIsGenerating: AIProps['setIsGenerating'];

  // ── Create sprint modal ────────────────────────────────────────────────
  showCreateSprintModal: boolean;
  onCloseCreateSprint: CreateSprintProps['onClose'];
  onSubmitCreateSprint: CreateSprintProps['onSubmit'];
  isCreatingSprint: CreateSprintProps['disabled'];

  // ── Edit sprint modal ──────────────────────────────────────────────────
  editingSprint: EditSprintProps['editingSprint'] | null;
  onCloseEditSprint: EditSprintProps['onClose'];
  onSubmitEditSprint: EditSprintProps['onSubmit'];

  // ── Complete / delete sprint confirmations ─────────────────────────────
  completingSprintId: CompleteConfirmProps['sprintId'] | null;
  onCloseCompleteSprint: CompleteConfirmProps['onClose'];
  onConfirmCompleteSprint: CompleteConfirmProps['onConfirm'];
  deletingSprintId: DeleteConfirmProps['sprintId'] | null;
  onCloseDeleteSprint: DeleteConfirmProps['onClose'];
  onConfirmDeleteSprint: DeleteConfirmProps['onConfirm'];

  // ── Reviewer panel ─────────────────────────────────────────────────────
  effectiveShowReviewer: boolean;
  onCloseReviewer: ReviewerProps['onClose'];
  onReviewerTaskUpdate: ReviewerProps['onTaskUpdate'];

  // ── Architecture editor ────────────────────────────────────────────────
  editingArchitecture: ArchEditorProps['architecture'] | null;
  onSaveArchitecture: ArchEditorProps['onSave'];
  onCloseArchitectureEditor: ArchEditorProps['onClose'];
}

/**
 * The board's modal / panel render cluster: the detail drawer, the four
 * lazy-loaded modals, the eagerly-imported edit/complete/delete-sprint modals,
 * the Reviewer slide-in panel, and the Architecture Editor wrapper. Extracted
 * verbatim from the ProjectBoard orchestrator (Commit 11) so the orchestrator
 * stays a thin shell. Behavior-neutral: lazy boundaries (R5) and the
 * EditSprintModal static import (R4) are preserved exactly.
 */
const BoardModals = ({
  selectedItem,
  workItems,
  sprints,
  project,
  allDevelopers,
  id,
  token,
  navigate,
  parseLocalDate,
  isSavingEdit,
  onSaveEdit,
  onDeleteItem,
  onStatusChange,
  onLogHours,
  isLoggingHours,
  onMoveToSprint,
  onSubmitComment,
  getNextSprint,
  showCreateForm,
  createFormType,
  isCreatingItem,
  existingTags,
  onCloseCreateForm,
  onSubmitCreateItem,
  showAIModal,
  architectures,
  setArchitectures,
  onEditArchitecture,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  onCloseAIModal,
  onAIPlanningCommitted,
  setIsGenerating,
  showCreateSprintModal,
  onCloseCreateSprint,
  onSubmitCreateSprint,
  isCreatingSprint,
  editingSprint,
  onCloseEditSprint,
  onSubmitEditSprint,
  completingSprintId,
  onCloseCompleteSprint,
  onConfirmCompleteSprint,
  deletingSprintId,
  onCloseDeleteSprint,
  onConfirmDeleteSprint,
  effectiveShowReviewer,
  onCloseReviewer,
  onReviewerTaskUpdate,
  editingArchitecture,
  onSaveArchitecture,
  onCloseArchitectureEditor,
}: BoardModalsProps) => {
  return (
    <>
      {/* Detail Slide-in Drawer */}
      {selectedItem && (
        <Suspense fallback={null}>
          <ItemDetailDrawer
            key={selectedItem.id}
            selectedItem={selectedItem}
            workItems={workItems}
            sprints={sprints}
            project={project}
            allDevelopers={allDevelopers}
            id={id}
            token={token}
            navigate={navigate}
            parseLocalDate={parseLocalDate}
            isSavingEdit={isSavingEdit}
            onSaveEdit={onSaveEdit}
            onDeleteItem={onDeleteItem}
            onStatusChange={onStatusChange}
            onLogHours={onLogHours}
            isLoggingHours={isLoggingHours}
            onMoveToSprint={onMoveToSprint}
            onSubmitComment={onSubmitComment}
            getNextSprint={getNextSprint}
          />
        </Suspense>
      )}

      {/* Create Item Modal */}
      {showCreateForm && (
        <Suspense fallback={null}>
          <CreateItemModal
            project={project}
            workItems={workItems}
            existingTags={existingTags}
            parseLocalDate={parseLocalDate}
            isCreatingItem={isCreatingItem}
            initialType={createFormType}
            onClose={onCloseCreateForm}
            onSubmit={onSubmitCreateItem}
          />
        </Suspense>
      )}

      {/* AI Planning Modal */}
      {showAIModal && (
        <Suspense fallback={null}>
          <AIPlanningModal
            project={project}
            architectures={architectures}
            setArchitectures={setArchitectures}
            onEditArchitecture={onEditArchitecture}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            onClose={onCloseAIModal}
            onCommitted={onAIPlanningCommitted}
            setIsGenerating={setIsGenerating}
          />
        </Suspense>
      )}

      {/* Create Sprint Modal */}
      {showCreateSprintModal && (
        <Suspense fallback={null}>
          <CreateSprintModal
            parseLocalDate={parseLocalDate}
            onClose={onCloseCreateSprint}
            onSubmit={onSubmitCreateSprint}
            disabled={isCreatingSprint}
          />
        </Suspense>
      )}

      {/* Edit Sprint Modal */}
      {editingSprint && (
        <Suspense fallback={null}>
          <EditSprintModal
            key={editingSprint.id}
            editingSprint={editingSprint}
            parseLocalDate={parseLocalDate}
            onClose={onCloseEditSprint}
            onSubmit={onSubmitEditSprint}
          />
        </Suspense>
      )}

      {/* Complete Sprint Confirmation */}
      {completingSprintId !== null && (
        <CompleteSprintConfirm
          sprintId={completingSprintId}
          sprints={sprints}
          workItems={workItems}
          onClose={onCloseCompleteSprint}
          onConfirm={onConfirmCompleteSprint}
        />
      )}

      {/* Delete Sprint Confirmation */}
      {deletingSprintId !== null && (
        <DeleteSprintConfirm
          sprintId={deletingSprintId}
          sprints={sprints}
          workItems={workItems}
          onClose={onCloseDeleteSprint}
          onConfirm={onConfirmDeleteSprint}
        />
      )}

      {/* Reviewer Panel - slide in from right. Gated on the derived
          `effectiveShowReviewer` so a mid-session cap revocation closes
          the panel even when local `showReviewer` state is still true. */}
      {effectiveShowReviewer && (
        <ReviewerPanel
          workItems={workItems}
          projectId={id!}
          token={token}
          onClose={onCloseReviewer}
          onTaskUpdate={onReviewerTaskUpdate}
        />
      )}

      {/* Architecture Editor Modal */}
      {editingArchitecture && (
        <ArchitectureEditorWrapper
          architecture={editingArchitecture}
          onSave={onSaveArchitecture}
          onClose={onCloseArchitectureEditor}
        />
      )}
    </>
  );
};

export default BoardModals;
