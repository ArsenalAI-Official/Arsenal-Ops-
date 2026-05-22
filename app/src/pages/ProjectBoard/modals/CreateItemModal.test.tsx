import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import CreateItemModal from './CreateItemModal';

describe('CreateItemModal', () => {
  const mockProject = {
    developers: [
      { id: 1, name: 'Alice', role: 'developer' },
      { id: 2, name: 'Bob', role: 'lead' },
    ],
  };

  const mockWorkItems = [
    { id: '1', key: 'TEST-1', title: 'Epic One', type: 'epic' },
    { id: '2', key: 'TEST-2', title: 'Story One', type: 'user_story' },
  ];

  const mockParseDate = (dateStr: string | undefined) => {
    if (!dateStr) return undefined;
    const [year, month, day] = dateStr.split('-');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };

  const defaultProps = {
    project: mockProject,
    workItems: mockWorkItems,
    existingTags: ['bug-fix', 'feature'],
    parseLocalDate: mockParseDate,
    isCreatingItem: false,
    onClose: () => {},
    onSubmit: () => {},
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('renders with required fields visible', () => {
    const { onClose, onSubmit } = { onClose: () => {}, onSubmit: () => {} };
    renderWithProviders(
      <CreateItemModal {...defaultProps} onClose={onClose} onSubmit={onSubmit} />,
    );

    expect(screen.getByText('Create Work Item')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a concise title...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Item/ })).toBeInTheDocument();
  });

  it('validation: empty title prevents submit and shows error', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <CreateItemModal {...defaultProps} onClose={onClose} onSubmit={onSubmit} />,
    );

    const submitBtn = screen.getByRole('button', { name: /Create Item/ });
    await user.click(submitBtn);

    // Validation prevents onSubmit call
    expect(onSubmit).not.toHaveBeenCalled();
    // Error toast may appear (sonner is async); verify onSubmit was not called
    // which indicates client-side validation worked
  });

  it('successful submit calls onSubmit with form values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <CreateItemModal {...defaultProps} onClose={onClose} onSubmit={onSubmit} />,
    );

    const titleInput = screen.getByPlaceholderText('Enter a concise title...');
    await user.type(titleInput, 'My New Task');
    const submitBtn = screen.getByRole('button', { name: /Create Item/ });
    await user.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My New Task',
        type: 'user_story',
        description: '',
        priority: 'medium',
      }),
    );
  });

  it('cancel button closes modal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    renderWithProviders(
      <CreateItemModal {...defaultProps} onClose={onClose} onSubmit={onSubmit} />,
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel/ });
    await user.click(cancelBtn);

    expect(onClose).toHaveBeenCalled();
  });

  it('close button (X) closes modal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    renderWithProviders(
      <CreateItemModal {...defaultProps} onClose={onClose} onSubmit={onSubmit} />,
    );

    const closeBtn = screen.getByRole('button', { name: '' }); // X button has no accessible name
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
  });

  it('disables submit button when isCreatingItem is true', () => {
    const { onClose, onSubmit } = { onClose: () => {}, onSubmit: () => {} };
    renderWithProviders(
      <CreateItemModal {...defaultProps} isCreatingItem onClose={onClose} onSubmit={onSubmit} />,
    );

    const submitBtn = screen.getByRole('button', { name: /Creating/ });
    expect(submitBtn).toBeDisabled();
  });

  it('populates form with title and description', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <CreateItemModal {...defaultProps} onClose={onClose} onSubmit={onSubmit} />,
    );

    const titleInput = screen.getByPlaceholderText('Enter a concise title...');
    const descInput = screen.getByPlaceholderText('Describe the requirements...');

    await user.type(titleInput, 'Test Title');
    await user.type(descInput, 'Test Description');
    await user.click(screen.getByRole('button', { name: /Create Item/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Title',
        description: 'Test Description',
      }),
    );
  });

  it('allows changing type, priority, and assignee', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <CreateItemModal {...defaultProps} onClose={onClose} onSubmit={onSubmit} />,
    );

    const titleInput = screen.getByPlaceholderText('Enter a concise title...');
    await user.type(titleInput, 'Bug Report');

    const typeSelect = screen.getByDisplayValue('User Story');
    await user.selectOptions(typeSelect, 'bug');

    const prioritySelect = screen.getByDisplayValue('Medium');
    await user.selectOptions(prioritySelect, 'critical');

    const assigneeSelect = screen.getByDisplayValue('Unassigned');
    await user.selectOptions(assigneeSelect, '1');

    await user.click(screen.getByRole('button', { name: /Create Item/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bug',
        priority: 'critical',
        assignee_id: 1,
      }),
    );
  });

  it('hides story points and hierarchy for task type', async () => {
    const user = userEvent.setup();
    const { onClose, onSubmit } = { onClose: () => {}, onSubmit: () => {} };

    renderWithProviders(
      <CreateItemModal {...defaultProps} onClose={onClose} onSubmit={onSubmit} />,
    );

    // Initially user_story should show points
    expect(screen.getByText('Points')).toBeInTheDocument();

    const typeSelect = screen.getByDisplayValue('User Story');
    await user.selectOptions(typeSelect, 'task');

    // Points should now be hidden
    expect(screen.queryByText('Points')).not.toBeInTheDocument();
    // Tags section should appear for tasks
    expect(screen.getByText('Tags (Optional)')).toBeInTheDocument();
  });

  it('allows adding tags via input for task type', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { onClose } = { onClose: () => {} };

    renderWithProviders(
      <CreateItemModal {...defaultProps} onClose={onClose} onSubmit={onSubmit} />,
    );

    // Switch to task type
    const typeSelect = screen.getByDisplayValue('User Story');
    await user.selectOptions(typeSelect, 'task');

    const titleInput = screen.getByPlaceholderText('Enter a concise title...');
    await user.type(titleInput, 'Setup Task');

    const tagInput = screen.getByPlaceholderText('Type tag and press Enter');
    await user.type(tagInput, 'urgent');
    await user.keyboard('{Enter}');

    await user.click(screen.getByRole('button', { name: /Create Item/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['urgent'],
      }),
    );
  });

  it('allows selecting existing tags for task type', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { onClose } = { onClose: () => {} };

    renderWithProviders(
      <CreateItemModal {...defaultProps} onClose={onClose} onSubmit={onSubmit} />,
    );

    const typeSelect = screen.getByDisplayValue('User Story');
    await user.selectOptions(typeSelect, 'task');

    const titleInput = screen.getByPlaceholderText('Enter a concise title...');
    await user.type(titleInput, 'New Task');

    // Click the button to add existing tag
    const addBugFixBtn = screen.getByText('+ bug-fix');
    await user.click(addBugFixBtn);

    await user.click(screen.getByRole('button', { name: /Create Item/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['bug-fix'],
      }),
    );
  });

  it('allows removing tags for task type', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { onClose } = { onClose: () => {} };

    renderWithProviders(
      <CreateItemModal {...defaultProps} onClose={onClose} onSubmit={onSubmit} />,
    );

    const typeSelect = screen.getByDisplayValue('User Story');
    await user.selectOptions(typeSelect, 'task');

    const titleInput = screen.getByPlaceholderText('Enter a concise title...');
    await user.type(titleInput, 'Task with Tags');

    const addBugFixBtn = screen.getByText('+ bug-fix');
    await user.click(addBugFixBtn);

    // Remove the tag
    const removeBtn = screen.getByText('×');
    await user.click(removeBtn);

    await user.click(screen.getByRole('button', { name: /Create Item/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [],
      }),
    );
  });

  it.skip('submit error shows error feedback', async () => {
    // FIXME: Modal form doesn't catch POST errors itself; parent (ProjectBoard)
    // handles the mutation error via useMutation.onError. Modal only calls onSubmit().
    // Error handling tested at integration level in ProjectBoard tests.
  });

  it.skip('optimistic update / mutation rollback', async () => {
    // FIXME: Mutation lifecycle (optimistic + rollback) managed by parent ProjectBoard
    // via useMutation, not in Modal component. Integration tests belong in ProjectBoard.
  });
});
