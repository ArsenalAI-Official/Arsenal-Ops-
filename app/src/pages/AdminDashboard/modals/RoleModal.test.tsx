// UI-level coverage for the role editor modal. RoleModal is a fully controlled
// presentational component — the request lives in useRolesAdmin.handleSaveRole
// (covered in ../hooks/useRolesAdmin.mutations.test.ts). Here we pin the modal's
// own contract: the submit button is guarded on a non-empty name, field edits
// call setRoleForm, submit invokes handleSaveRole, and a system role locks its
// name input. These are the affordances a regression in the modal would break
// before any request is ever attempted.
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderPlain } from '@/test-utils/render';
import RoleModal from './RoleModal';

// Minimal picker-helper stubs — the modal only calls these for display; the
// grant logic itself is unit-tested in ../lib/capabilityPicker.test.ts.
function baseProps() {
  return {
    open: true,
    onClose: vi.fn(),
    editingRole: null,
    roleForm: { name: '', description: '', capability_keys: [] as string[] },
    setRoleForm: vi.fn(),
    isSavingRole: false,
    pickerCatalog: [],
    toggleGrant: vi.fn(),
    toggleGroupWildcard: vi.fn(),
    togglePickerCheckbox: vi.fn(),
    isGrantHeld: () => false,
    isSideEffective: () => false,
    isGroupEffective: () => false,
    toPascalCase: (s: string) => s,
    handleSaveRole: vi.fn(),
  };
}

describe('RoleModal', () => {
  it('renders nothing when closed', () => {
    const { container } = renderPlain(<RoleModal {...baseProps()} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('disables the Create button while the name is empty', () => {
    renderPlain(<RoleModal {...baseProps()} />);
    expect(screen.getByRole('button', { name: /Create Role/i })).toBeDisabled();
  });

  it('enables Create once a non-empty name is present', () => {
    renderPlain(
      <RoleModal
        {...baseProps()}
        roleForm={{ name: 'qa_lead', description: '', capability_keys: [] }}
      />,
    );
    expect(screen.getByRole('button', { name: /Create Role/i })).toBeEnabled();
  });

  it('editing the name field calls setRoleForm', async () => {
    const props = baseProps();
    const user = userEvent.setup();
    renderPlain(<RoleModal {...props} />);

    await user.type(screen.getByPlaceholderText(/qa_lead, finance_viewer/i), 'q');
    expect(props.setRoleForm).toHaveBeenCalled();
  });

  it('clicking Create invokes handleSaveRole', async () => {
    const props = baseProps();
    props.roleForm = { name: 'qa_lead', description: '', capability_keys: [] };
    const user = userEvent.setup();
    renderPlain(<RoleModal {...props} />);

    await user.click(screen.getByRole('button', { name: /Create Role/i }));
    expect(props.handleSaveRole).toHaveBeenCalledTimes(1);
  });

  it('shows "Update Role" and locks the name input for a system role', () => {
    const props = baseProps();
    renderPlain(
      <RoleModal
        {...props}
        editingRole={{
          id: 1,
          name: 'admin',
          description: 'Full access',
          is_system: true,
          capability_keys: ['*'],
        }}
        roleForm={{ name: 'admin', description: 'Full access', capability_keys: ['*'] }}
      />,
    );

    expect(screen.getByRole('button', { name: /Update Role/i })).toBeTruthy();
    // System role → name input disabled (locked); the helper note is shown.
    expect(screen.getByPlaceholderText(/qa_lead, finance_viewer/i)).toBeDisabled();
    expect(screen.getByText(/name is locked/i)).toBeTruthy();
  });

  it('shows a saving state and blocks Cancel while a save is in flight', () => {
    const props = baseProps();
    props.roleForm = { name: 'qa_lead', description: '', capability_keys: [] };
    renderPlain(<RoleModal {...props} isSavingRole />);

    expect(screen.getByRole('button', { name: /Saving/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Cancel$/i })).toBeDisabled();
  });
});
