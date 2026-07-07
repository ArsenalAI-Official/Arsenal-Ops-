// Render smoke + primary-action payload for ProjectInfoSection — the Overview
// "Project Information" card with an inline edit form. It's self-contained (no
// queries/router; local useState only), so it renders plain and we assert the
// onSave payload directly rather than going through the network.
//
// Two behaviors pinned: (1) the admin edit affordance is gated on
// isCurrentUserAdmin (defense-in-depth — the form + Save disappear if admin is
// false), and (2) clicking Save fires onSave with the edited form fields. The
// edit-mode default seeds editForm from `project` (setEditForm(project)), so an
// unedited Save round-trips the project fields — we edit the name to prove the
// input is wired into the payload.
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { ProjectDetailResponse } from '@/client';
import { renderPlain } from '@/test-utils/render';
import ProjectInfoSection from './ProjectInfoSection';

const project: ProjectDetailResponse = {
  id: 1,
  name: 'Test Project',
  key_prefix: 'TP',
  description: 'A seeded project',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  developers: [],
  github_repo_urls: [],
  github_repo_url: null,
  github_repo_name: null,
  category_id: null,
  category_name: null,
  selected_architecture: null,
  work_item_stats: {
    total: 0,
    by_status: {},
    total_points: 0,
    completed: 0,
    completion_pct: 0,
  },
};

describe('ProjectInfoSection', () => {
  it('renders the read-only card (description + key prefix) without an Edit affordance for non-admins', () => {
    renderPlain(
      <ProjectInfoSection project={project} isCurrentUserAdmin={false} onSave={vi.fn()} />,
    );

    expect(screen.getByRole('heading', { name: /project information/i })).toBeTruthy();
    expect(screen.getByText('A seeded project')).toBeTruthy();
    // key_prefix rendered in the quick-stats card.
    expect(screen.getByText('TP')).toBeTruthy();
    // No edit affordance when not an admin.
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });

  it('shows the Edit button for admins and reveals the form on click', async () => {
    const { user } = renderPlain(
      <ProjectInfoSection project={project} isCurrentUserAdmin onSave={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /edit/i }));

    // Edit mode: the name input is seeded from the project, Save/Cancel appear.
    expect(screen.getByDisplayValue('Test Project')).toBeTruthy();
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('fires onSave with the edited form payload when Save is clicked', async () => {
    const onSave = vi.fn();
    const { user } = renderPlain(
      <ProjectInfoSection project={project} isCurrentUserAdmin onSave={onSave} />,
    );

    await user.click(screen.getByRole('button', { name: /edit/i }));

    const nameInput = screen.getByDisplayValue('Test Project');
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Project');

    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    // Payload is the editForm (seeded from project via setEditForm(project),
    // then patched by the input). Assert the edited field landed.
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ name: 'Renamed Project' });
  });
});
