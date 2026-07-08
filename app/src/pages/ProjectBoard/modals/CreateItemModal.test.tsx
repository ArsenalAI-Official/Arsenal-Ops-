import { describe, it, expect, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderPlain } from '@/test-utils/render';
import CreateItemModal, { type CreateItemModalProps } from './CreateItemModal';

const baseProps = (): CreateItemModalProps => ({
  project: { developers: [] },
  workItems: [],
  existingTags: [],
  parseLocalDate: () => undefined,
  isCreatingItem: false,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
});

describe('CreateItemModal', () => {
  it('[21] empty-title submit shows an inline error and does not submit', () => {
    const props = baseProps();
    const { getByRole, getByText, queryByText } = renderPlain(<CreateItemModal {...props} />);

    expect(queryByText('Title is required')).toBeNull();
    fireEvent.click(getByRole('button', { name: /Create Item/ }));

    expect(getByText('Title is required')).toBeTruthy();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('[21] typing a title clears the inline error', () => {
    const props = baseProps();
    const { getByRole, queryByText, getByPlaceholderText } = renderPlain(
      <CreateItemModal {...props} />,
    );
    fireEvent.click(getByRole('button', { name: /Create Item/ }));
    expect(queryByText('Title is required')).toBeTruthy();

    fireEvent.change(getByPlaceholderText('Enter a concise title...'), {
      target: { value: 'Build the thing' },
    });
    expect(queryByText('Title is required')).toBeNull();
  });

  it('[22] epic type labels the submit button "Create Epic"', () => {
    const { getByRole, queryByRole } = renderPlain(
      <CreateItemModal {...baseProps()} initialType="epic" />,
    );
    expect(getByRole('button', { name: /Create Epic/ })).toBeTruthy();
    expect(queryByRole('button', { name: /Create Item/ })).toBeNull();
  });

  it('[23] Points field is hidden for epics but shown for user stories', () => {
    const epic = renderPlain(<CreateItemModal {...baseProps()} initialType="epic" />);
    expect(epic.queryByText('Points')).toBeNull();

    const story = renderPlain(<CreateItemModal {...baseProps()} initialType="user_story" />);
    expect(story.getByText('Points')).toBeTruthy();
  });

  it('[23] epics carry no story points (default 0, not 3) so no phantom hours are seeded', () => {
    const props = baseProps();
    const { getByRole, getByPlaceholderText } = renderPlain(
      <CreateItemModal {...props} initialType="epic" />,
    );
    fireEvent.change(getByPlaceholderText('Enter a concise title...'), {
      target: { value: 'Auth epic' },
    });
    fireEvent.click(getByRole('button', { name: /Create Epic/ }));

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'epic', story_points: 0 }),
    );
  });

  it('a valid title submits the form (happy path)', () => {
    const props = baseProps();
    const { getByRole, getByPlaceholderText } = renderPlain(<CreateItemModal {...props} />);
    fireEvent.change(getByPlaceholderText('Enter a concise title...'), {
      target: { value: 'Build the thing' },
    });
    fireEvent.click(getByRole('button', { name: /Create Item/ }));

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Build the thing' }),
    );
  });

  // Ported from main's suite: coverage this component's own contract still owes.
  it('the Cancel button calls onClose', () => {
    const props = baseProps();
    const { getByRole } = renderPlain(<CreateItemModal {...props} />);
    fireEvent.click(getByRole('button', { name: /Cancel/ }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('reflects the isCreatingItem pending state: "Creating..." and a disabled Cancel', () => {
    const { getByText, getByRole } = renderPlain(
      <CreateItemModal {...baseProps()} isCreatingItem />,
    );
    expect(getByText(/Creating\.\.\./)).toBeTruthy();
    expect(getByRole('button', { name: /Cancel/ })).toBeDisabled();
  });
});
