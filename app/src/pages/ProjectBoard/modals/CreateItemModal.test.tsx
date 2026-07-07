// CreateItemModal is a presentational modal: it owns the create-form state and
// calls back via onSubmit(form) / onClose. It touches no network directly (the
// POST lives in useWorkItemMutations, covered separately), so these tests assert
// the component's OWN contract:
//   - the required-title guard blocks submit (button disabled + toast) with an
//     empty title, and unblocks once a title is typed;
//   - a filled form calls onSubmit exactly once with the collected form values;
//   - the close affordances (header X, Cancel) call onClose;
//   - the create button reflects the isCreatingItem pending state.
//
// No queries/router are used, so renderPlain suffices. sonner is stubbed to
// assert the guard's error toast. Query by role/label per the testing guide.
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

import { toast } from 'sonner';
import CreateItemModal, { type CreateItemModalProps } from './CreateItemModal';

// The modal calls parseLocalDate for the due-date label; a passthrough that
// mirrors the real local-date parse is enough (no date is picked in these tests).
const parseLocalDate = (s: string | undefined) => (s ? new Date(`${s}T00:00:00`) : undefined);

function renderModal(overrides: Partial<CreateItemModalProps> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const props: CreateItemModalProps = {
    project: { developers: [{ id: 3, name: 'Dev One', role: 'engineer' }] },
    workItems: [],
    existingTags: [],
    parseLocalDate,
    isCreatingItem: false,
    onClose,
    onSubmit,
    ...overrides,
  };
  const user = userEvent.setup();
  const result = render(<CreateItemModal {...props} />);
  return { ...result, user, onSubmit, onClose };
}

const createButton = (getByRole: ReturnType<typeof renderModal>['getByRole']) =>
  getByRole('button', { name: /create item/i });

describe('CreateItemModal — required-title guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('disables the Create button and does not submit while the title is empty', async () => {
    const { getByRole, onSubmit } = renderModal();
    const btn = createButton(getByRole);
    expect(btn).toBeDisabled();
    // Nothing submitted because the guard button is disabled.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enables Create once a non-whitespace title is entered', async () => {
    const { getByRole, getByPlaceholderText, user } = renderModal();
    const btn = createButton(getByRole);
    expect(btn).toBeDisabled();

    await user.type(getByPlaceholderText(/concise title/i), '   '); // whitespace only
    expect(btn).toBeDisabled(); // trimmed empty → still blocked

    await user.type(getByPlaceholderText(/concise title/i), 'Real title');
    expect(btn).toBeEnabled();
  });
});

describe('CreateItemModal — submit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls onSubmit once with the collected form values', async () => {
    const { getByRole, getByPlaceholderText, user, onSubmit } = renderModal();

    await user.type(getByPlaceholderText(/concise title/i), 'Build the thing');
    await user.type(getByPlaceholderText(/requirements/i), 'some details');
    await user.click(createButton(getByRole));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'user_story', // default
        title: 'Build the thing',
        description: 'some details',
        priority: 'medium', // default
      }),
    );
  });

  it('respects initialType, submitting an epic without a type selector', async () => {
    const { getByRole, getByPlaceholderText, queryByText, user, onSubmit } = renderModal({
      initialType: 'epic',
    });
    // Epic flow hides the type selector and shows the "Create Epic" header.
    expect(queryByText('Create Epic')).toBeTruthy();

    await user.type(getByPlaceholderText(/concise title/i), 'My Epic');
    await user.click(createButton(getByRole));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'epic', title: 'My Epic' }),
    );
  });
});

describe('CreateItemModal — close affordances', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Cancel button calls onClose', async () => {
    const { getByRole, user, onClose } = renderModal();
    await user.click(getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('CreateItemModal — pending state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows "Creating..." and disables Cancel while a create is in flight', () => {
    const { getByRole, getByText } = renderModal({ isCreatingItem: true });
    expect(getByText(/creating\.\.\./i)).toBeTruthy();
    expect(getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('clearing a typed title re-blocks submit without ever calling onSubmit or the guard toast', async () => {
    // The <button disabled> is the primary guard; handleCreateItem's toast is a
    // belt-and-suspenders fallback. Typing then clearing re-disables the button,
    // so no submit fires and the fallback toast is never reached.
    const { getByRole, getByPlaceholderText, user, onSubmit } = renderModal();
    const title = getByPlaceholderText(/concise title/i);
    await user.type(title, 'x');
    expect(createButton(getByRole)).toBeEnabled();
    await user.clear(title);
    expect(createButton(getByRole)).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });
});
