import { describe, it, expect } from 'vitest';
import type { Capability } from '../types';
import {
  toPascalCase,
  wildcardCovers,
  keyIsUnderGrant,
  isGrantHeld,
  isSideEffective,
  isGroupEffective,
  applyToggleGrant,
  applyToggleGroupWildcard,
  applyTogglePickerCheckbox,
  buildPickerCatalog,
  type PickerItem,
  type PickerGroup,
} from './capabilityPicker';

/** Order-independent grant-array comparison. */
const sorted = (arr: string[]) => [...arr].sort();
const expectSameSet = (actual: string[], expected: string[]) =>
  expect(sorted(actual)).toEqual(sorted(expected));

describe('toPascalCase', () => {
  it('converts snake_case to PascalCase', () => {
    expect(toPascalCase('project_manager')).toBe('ProjectManager');
  });

  it('handles a single word (and lowercases its tail)', () => {
    expect(toPascalCase('admin')).toBe('Admin');
    expect(toPascalCase('ADMIN')).toBe('Admin');
  });

  it('returns empty string for empty input', () => {
    expect(toPascalCase('')).toBe('');
  });
});

describe('wildcardCovers / keyIsUnderGrant', () => {
  it('`*` covers everything', () => {
    expect(wildcardCovers('*', 'project.pm')).toBe(true);
    expect(keyIsUnderGrant('anything.here', '*')).toBe(true);
  });

  it('`x.*` covers the prefix and its descendants but not siblings', () => {
    expect(wildcardCovers('project.*', 'project')).toBe(true);
    expect(wildcardCovers('project.*', 'project.pm')).toBe(true);
    expect(wildcardCovers('project.*', 'projectile')).toBe(false);
    expect(wildcardCovers('project.*', 'admin.users')).toBe(false);
  });

  it('a non-wildcard grant covers only the exact key', () => {
    expect(wildcardCovers('project.pm', 'project.pm')).toBe(false); // not a wildcard
    expect(keyIsUnderGrant('project.pm', 'project.pm')).toBe(true);
    expect(keyIsUnderGrant('project.pm.summary', 'project.pm')).toBe(false);
  });
});

describe('isGrantHeld', () => {
  it('true on exact match', () => {
    expect(isGrantHeld('admin.users', ['admin.users'])).toBe(true);
  });

  it('true when the global `*` is held', () => {
    expect(isGrantHeld('admin.users', ['*'])).toBe(true);
  });

  it('true when a wildcard ancestor is held', () => {
    expect(isGrantHeld('admin.users', ['admin.*'])).toBe(true);
    expect(isGrantHeld('project.pm.summary', ['project.*'])).toBe(true);
  });

  it('false for a sibling cap (no auto-coverage across siblings)', () => {
    expect(isGrantHeld('admin.users', ['admin.roles'])).toBe(false);
    expect(isGrantHeld('admin.users_write', ['admin.users'])).toBe(false);
  });
});

// A representative paired row (read + write) with two read-only children.
const overviewItem: PickerItem = {
  label: 'Overview',
  description: 'overview',
  readGrant: 'project.overview.*',
  writeGrant: 'project.overview_write',
  children: [
    { label: 'PRD', description: 'prd', readGrant: 'project.overview.prd' },
    { label: 'Team', description: 'team', readGrant: 'project.overview.team' },
  ],
};

describe('isSideEffective', () => {
  it('direct: the side-grant is held', () => {
    expect(isSideEffective(overviewItem, 'read', ['project.overview.*'])).toBe(true);
    expect(isSideEffective(overviewItem, 'write', ['project.overview_write'])).toBe(true);
  });

  it('false when only the OTHER side is held (childless row, no vacuous promote)', () => {
    const paired: PickerItem = {
      label: 'Users',
      description: 'u',
      readGrant: 'admin.users',
      writeGrant: 'admin.users_write',
    };
    expect(isSideEffective(paired, 'write', ['admin.users'])).toBe(false);
  });

  it('auto-promotes Read when every child Read is held (parent has a readGrant)', () => {
    expect(
      isSideEffective(overviewItem, 'read', ['project.overview.prd', 'project.overview.team']),
    ).toBe(true);
  });

  it('does NOT auto-promote when a child Read is missing', () => {
    expect(isSideEffective(overviewItem, 'read', ['project.overview.prd'])).toBe(false);
  });

  it('false for a side with no grant defined', () => {
    const readOnly: PickerItem = { label: 'X', description: 'x', readGrant: 'project.calendar' };
    expect(isSideEffective(readOnly, 'write', [])).toBe(false);
  });
});

describe('isGroupEffective', () => {
  const group: PickerGroup = {
    prefix: 'admin',
    label: 'Admin',
    wildcard: 'admin.*',
    items: [
      { label: 'Dashboard', description: 'd', readGrant: 'admin.dashboard' },
      {
        label: 'Users',
        description: 'u',
        readGrant: 'admin.users',
        writeGrant: 'admin.users_write',
      },
    ],
  };

  it('true when the group wildcard is held directly', () => {
    expect(isGroupEffective(group, ['admin.*'])).toBe(true);
  });

  it('true when every defined side of every item is held', () => {
    expect(isGroupEffective(group, ['admin.dashboard', 'admin.users', 'admin.users_write'])).toBe(
      true,
    );
  });

  it('false when any defined side is missing', () => {
    expect(isGroupEffective(group, ['admin.dashboard', 'admin.users'])).toBe(false); // users_write missing
  });
});

describe('applyToggleGrant (global * toggle)', () => {
  const registry: Capability[] = [
    { key: 'admin.users', description: '' },
    { key: 'admin.roles', description: '' },
  ];

  it('adds `*` when absent', () => {
    expectSameSet(applyToggleGrant([], '*', registry), ['*']);
  });

  it('removes `*` when present', () => {
    expectSameSet(applyToggleGrant(['*'], '*', registry), []);
  });
});

describe('applyToggleGroupWildcard', () => {
  // Two items so a single granted sub-cap doesn't make the group "effectively
  // held" — that lets us exercise the grant path distinctly from the revoke path.
  const group: PickerGroup = {
    prefix: 'admin',
    label: 'Admin',
    wildcard: 'admin.*',
    items: [
      { label: 'Users', description: 'u', readGrant: 'admin.users' },
      { label: 'Roles', description: 'r', readGrant: 'admin.roles' },
    ],
  };

  it('grants the wildcard and sweeps redundant sub-caps when not fully held', () => {
    // Only admin.users granted → group not effective → toggling GRANTS the wildcard.
    expectSameSet(applyToggleGroupWildcard(['admin.users', 'other'], group), ['admin.*', 'other']);
  });

  it('revokes the wildcard (and everything under it) when held', () => {
    expectSameSet(applyToggleGroupWildcard(['admin.*', 'project.pm'], group), ['project.pm']);
  });
});

describe('applyTogglePickerCheckbox — W→R dependency', () => {
  const pairedRow: PickerItem = {
    label: 'Users',
    description: 'u',
    readGrant: 'admin.users',
    writeGrant: 'admin.users_write',
  };

  it('Read ON adds the read grant', () => {
    expectSameSet(applyTogglePickerCheckbox([], pairedRow, 'read'), ['admin.users']);
  });

  it('Read OFF also clears Write (no edit-without-view)', () => {
    expectSameSet(
      applyTogglePickerCheckbox(['admin.users', 'admin.users_write'], pairedRow, 'read'),
      [],
    );
  });

  it('Write ON also ensures Read', () => {
    expectSameSet(applyTogglePickerCheckbox([], pairedRow, 'write'), [
      'admin.users',
      'admin.users_write',
    ]);
  });

  it('Write OFF leaves Read intact', () => {
    expectSameSet(
      applyTogglePickerCheckbox(['admin.users', 'admin.users_write'], pairedRow, 'write'),
      ['admin.users'],
    );
  });

  it('Read OFF on a parent sweeps child grants too', () => {
    const next = applyTogglePickerCheckbox(
      ['project.overview.*', 'project.overview.prd', 'project.overview_write'],
      overviewItem,
      'read',
    );
    expectSameSet(next, []);
  });
});

describe('buildPickerCatalog', () => {
  const catalog = buildPickerCatalog();

  it('exposes a project group and an admin group', () => {
    expect(catalog.map((g) => g.prefix)).toEqual(['project', 'admin']);
    expect(catalog.find((g) => g.prefix === 'project')!.wildcard).toBe('project.*');
    expect(catalog.find((g) => g.prefix === 'admin')!.wildcard).toBe('admin.*');
  });

  it('admin group carries the read/write split incl. Time Entries (read-only)', () => {
    const admin = catalog.find((g) => g.prefix === 'admin')!;
    const byLabel = Object.fromEntries(admin.items.map((i) => [i.label, i]));
    expect(byLabel['Users']).toMatchObject({
      readGrant: 'admin.users',
      writeGrant: 'admin.users_write',
    });
    expect(byLabel['Time Entries']).toMatchObject({ readGrant: 'admin.time_entries' });
    expect(byLabel['Time Entries']!.writeGrant).toBeUndefined();
  });

  it('project group includes the hand-added Project Board row (read + write)', () => {
    const project = catalog.find((g) => g.prefix === 'project')!;
    const board = project.items.find((i) => i.label === 'Project Board');
    expect(board).toMatchObject({
      readGrant: 'project.board',
      writeGrant: 'project.tracker_write',
    });
  });

  it('write-only project actions expose only a writeGrant', () => {
    const project = catalog.find((g) => g.prefix === 'project')!;
    const ai = project.items.find((i) => i.label === 'AI Generators')!;
    expect(ai.writeGrant).toBe('project.ai.write');
    expect(ai.readGrant).toBeUndefined();
  });
});
