import { describe, it, expect } from 'vitest';
import type { Capability } from '../types';
import {
  toPascalCase,
  wildcardCovers,
  keyIsUnderGrant,
  isItemChecked,
  isItemEffectivelyChecked,
  applyToggleGrant,
  applyToggleCatalogItem,
  buildPickerCatalog,
  type CatalogNode,
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

  it('handles multiple underscores and mixed case', () => {
    expect(toPascalCase('foo_bar_baz')).toBe('FooBarBaz');
    expect(toPascalCase('mixedCASE_word')).toBe('MixedcaseWord');
  });
});

describe('wildcardCovers', () => {
  it("'*' covers anything", () => {
    expect(wildcardCovers('*', 'project')).toBe(true);
    expect(wildcardCovers('*', 'anything.at.all')).toBe(true);
    expect(wildcardCovers('*', '')).toBe(true);
  });

  it("'project.*' covers the prefix and nested keys", () => {
    expect(wildcardCovers('project.*', 'project')).toBe(true);
    expect(wildcardCovers('project.*', 'project.pm')).toBe(true);
    expect(wildcardCovers('project.*', 'project.pm.read')).toBe(true);
  });

  it("'project.*' does NOT cover 'projectx'", () => {
    expect(wildcardCovers('project.*', 'projectx')).toBe(false);
  });

  it('a non-wildcard exact grant returns false (it only answers the wildcard question)', () => {
    expect(wildcardCovers('project.read', 'project.read')).toBe(false);
    expect(wildcardCovers('project.read', 'project.write')).toBe(false);
  });
});

describe('keyIsUnderGrant', () => {
  it("'*' covers all", () => {
    expect(keyIsUnderGrant('anything', '*')).toBe(true);
    expect(keyIsUnderGrant('x.y.z', '*')).toBe(true);
  });

  it("'x.*' covers 'x' and 'x.y'", () => {
    expect(keyIsUnderGrant('x', 'x.*')).toBe(true);
    expect(keyIsUnderGrant('x.y', 'x.*')).toBe(true);
    expect(keyIsUnderGrant('x.y.z', 'x.*')).toBe(true);
  });

  it("'x.*' does NOT cover 'xy'", () => {
    expect(keyIsUnderGrant('xy', 'x.*')).toBe(false);
  });

  it('an exact grant matches only itself', () => {
    expect(keyIsUnderGrant('project.read', 'project.read')).toBe(true);
    expect(keyIsUnderGrant('project.write', 'project.read')).toBe(false);
    expect(keyIsUnderGrant('project.read.more', 'project.read')).toBe(false);
  });
});

describe('isItemChecked', () => {
  it("returns true when '*' is present", () => {
    expect(isItemChecked('project.read', ['*'])).toBe(true);
  });

  it('returns true when the exact grant is present', () => {
    expect(isItemChecked('project.read', ['project.read'])).toBe(true);
  });

  it('returns true when a wildcard ancestor is present', () => {
    // grant 'project.pm.*' is checked under grants=['project.*']
    expect(isItemChecked('project.pm.*', ['project.*'])).toBe(true);
    expect(isItemChecked('project.pm', ['project.*'])).toBe(true);
    // the wildcard prefix itself counts too
    expect(isItemChecked('project', ['project.*'])).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(isItemChecked('project.read', [])).toBe(false);
    expect(isItemChecked('project.read', ['admin.read'])).toBe(false);
  });

  it('does NOT count a sibling grant as checked', () => {
    expect(isItemChecked('project.read', ['project.write'])).toBe(false);
  });
});

describe('isItemEffectivelyChecked', () => {
  it('returns true via a direct/exact grant', () => {
    const node: CatalogNode = { grant: 'project.read' };
    expect(isItemEffectivelyChecked(node, ['project.read'])).toBe(true);
  });

  it('returns true via a wildcard ancestor', () => {
    const node: CatalogNode = { grant: 'project.pm' };
    expect(isItemEffectivelyChecked(node, ['project.*'])).toBe(true);
  });

  it('auto-promotes a parent when every child is granted individually', () => {
    const node: CatalogNode = {
      grant: 'project.pm.*',
      children: [{ grant: 'project.pm.a' }, { grant: 'project.pm.b' }],
    };
    expect(isItemEffectivelyChecked(node, ['project.pm.a', 'project.pm.b'])).toBe(true);
  });

  it('does NOT promote a parent when one child is missing', () => {
    const node: CatalogNode = {
      grant: 'project.pm.*',
      children: [{ grant: 'project.pm.a' }, { grant: 'project.pm.b' }],
    };
    expect(isItemEffectivelyChecked(node, ['project.pm.a'])).toBe(false);
  });

  it('returns false for a leaf node with no grant present', () => {
    const node: CatalogNode = { grant: 'project.read' };
    expect(isItemEffectivelyChecked(node, [])).toBe(false);
  });

  it('auto-promotes through nested grandchildren', () => {
    const node: CatalogNode = {
      grant: 'project.*',
      children: [
        {
          grant: 'project.pm.*',
          children: [{ grant: 'project.pm.a' }, { grant: 'project.pm.b' }],
        },
        { grant: 'project.read' },
      ],
    };
    // All leaves granted -> grandchild parent promotes -> top promotes.
    expect(isItemEffectivelyChecked(node, ['project.pm.a', 'project.pm.b', 'project.read'])).toBe(
      true,
    );
    // Drop one grandchild leaf -> promotion fails all the way up.
    expect(isItemEffectivelyChecked(node, ['project.pm.a', 'project.read'])).toBe(false);
  });
});

describe('applyToggleGrant', () => {
  const registry: Capability[] = [
    { key: 'project.read', description: 'read' },
    { key: 'project.write', description: 'write' },
    { key: 'project.delete', description: 'delete' },
    { key: 'admin.read', description: 'admin read' },
  ];

  it('removes a key that is already present (exact)', () => {
    const result = applyToggleGrant(['project.read', 'project.write'], 'project.read', registry);
    expectSameSet(result, ['project.write']);
  });

  it('appends a key that is not present and not covered by a wildcard', () => {
    const result = applyToggleGrant(['admin.read'], 'project.read', registry);
    expectSameSet(result, ['admin.read', 'project.read']);
  });

  it('expands a covering wildcard into all registry keys under it except the toggled key', () => {
    // grants=['project.*'], toggle 'project.read' off.
    const result = applyToggleGrant(['project.*'], 'project.read', registry);
    // Wildcard removed; every registry key under project.* except project.read kept.
    expectSameSet(result, ['project.write', 'project.delete']);
    expect(result).not.toContain('project.*');
    expect(result).not.toContain('project.read');
    expect(result).not.toContain('admin.read'); // not under project.*
  });

  it('preserves non-covering grants when expanding a wildcard', () => {
    const result = applyToggleGrant(['project.*', 'admin.read'], 'project.write', registry);
    expectSameSet(result, ['project.read', 'project.delete', 'admin.read']);
    expect(result).not.toContain('project.*');
    expect(result).not.toContain('project.write');
  });
});

describe('applyToggleCatalogItem', () => {
  it('removes the exact grant when a leaf is currently effectively checked', () => {
    const node: CatalogNode = { grant: 'project.calendar' };
    const result = applyToggleCatalogItem(['project.calendar', 'admin.read'], node);
    expectSameSet(result, ['admin.read']);
  });

  it('adds the grant when a leaf is not checked', () => {
    const node: CatalogNode = { grant: 'project.calendar' };
    const result = applyToggleCatalogItem(['admin.read'], node);
    expectSameSet(result, ['admin.read', 'project.calendar']);
  });

  it('drops redundant explicit sub-caps before adding a wildcard leaf grant', () => {
    // node grant is a wildcard, currently NOT effectively checked (no children
    // on the node, so isItemEffectivelyChecked is false even with sub-caps).
    const node: CatalogNode = { grant: 'project.pm.*' };
    const result = applyToggleCatalogItem(['project.pm', 'project.pm.summary', 'admin.read'], node);
    expectSameSet(result, ['admin.read', 'project.pm.*']);
    expect(result).not.toContain('project.pm');
    expect(result).not.toContain('project.pm.summary');
  });

  it('unchecking a checked wildcard node sweeps the wildcard and all prefixed grants', () => {
    // Node has children that make it effectively checked via promotion.
    const node: CatalogNode = {
      grant: 'project.*',
      children: [{ grant: 'project.read' }, { grant: 'project.write' }],
    };
    const result = applyToggleCatalogItem(['project.read', 'project.write', 'admin.read'], node);
    // Effectively checked -> sweep wildcard + everything under 'project.' prefix.
    expectSameSet(result, ['admin.read']);
  });

  it('checking a wildcard node with explicit sub-caps removes them and adds the wildcard', () => {
    // node grant wildcard, not effectively checked (one child missing).
    const node: CatalogNode = {
      grant: 'project.*',
      children: [{ grant: 'project.read' }, { grant: 'project.write' }],
    };
    const result = applyToggleCatalogItem(['project.read', 'admin.read'], node);
    expectSameSet(result, ['admin.read', 'project.*']);
    expect(result).not.toContain('project.read');
  });
});

describe('buildPickerCatalog', () => {
  it('returns two groups: project and admin', () => {
    const catalog = buildPickerCatalog();
    expect(catalog).toHaveLength(2);
    expect(catalog.map((g) => g.prefix)).toEqual(['project', 'admin']);
  });

  it('admin group has exactly 5 items with the expected grants', () => {
    const catalog = buildPickerCatalog();
    const admin = catalog.find((g) => g.prefix === 'admin')!;
    expect(admin.items).toHaveLength(5);
    expectSameSet(
      admin.items.map((i) => i.grant),
      ['admin.dashboard', 'admin.employees', 'admin.projects', 'admin.users', 'admin.roles'],
    );
  });

  it('project group includes the hand-curated write-side entries', () => {
    const catalog = buildPickerCatalog();
    const project = catalog.find((g) => g.prefix === 'project')!;
    const grants = project.items.map((i) => i.grant);
    expect(grants).toContain('project.tracker_write');
    expect(grants).toContain('project.ai.write');
    expect(grants).toContain('project.create');
    expect(grants).toContain('project.assign_personal_task');
  });

  it('maps an injected projectTabs array into the project group items', () => {
    const fakeTabs = [{ label: 'X', picker: { grant: 'project.x', description: 'd' } }];
    const catalog = buildPickerCatalog(fakeTabs);
    const project = catalog.find((g) => g.prefix === 'project')!;
    const injected = project.items.find((i) => i.grant === 'project.x');
    expect(injected).toBeDefined();
    expect(injected!.label).toBe('X');
    expect(injected!.description).toBe('d');
    // The 4 hand-curated entries are appended after the injected tabs.
    expect(project.items).toHaveLength(5);
  });

  it('maps injected tab children into picker item children', () => {
    const fakeTabs = [
      {
        label: 'Y',
        picker: {
          grant: 'project.y.*',
          description: 'd',
          children: [{ label: 'Sub', grant: 'project.y.sub', description: 'sd' }],
        },
      },
    ];
    const catalog = buildPickerCatalog(fakeTabs);
    const project = catalog.find((g) => g.prefix === 'project')!;
    const injected = project.items.find((i) => i.grant === 'project.y.*')!;
    expect(injected.children).toEqual([
      { label: 'Sub', grant: 'project.y.sub', description: 'sd' },
    ]);
  });
});

describe('edge cases the live catalog masks (pin current behavior)', () => {
  const reg: Capability[] = [
    { key: 'project.read', description: '' },
    { key: 'project.write', description: '' },
  ];

  it('toggles the global "*" grant off to empty', () => {
    expect(applyToggleGrant(['*'], '*', reg)).toEqual([]);
  });

  it('adding "*" simply appends it (does NOT minimize existing non-covered grants)', () => {
    // '*' isn't a covering wildcard of 'project.read' via the expansion path, so the
    // result just appends '*'. Pins today's non-minimizing behavior against a future
    // "collapse redundant grants" change.
    expectSameSet(applyToggleGrant(['project.read'], '*', reg), ['project.read', '*']);
  });

  it('appends to an empty grant set', () => {
    expect(applyToggleGrant([], 'project.read', reg)).toEqual(['project.read']);
  });

  it('unchecking a wildcard-covered key expands to empty when the key is the only matching cap', () => {
    // grants=['project.*'], toggling 'project.read' off expands the wildcard into its
    // sub-caps minus the toggled key; with a registry whose only matching cap IS the
    // toggled key, the expansion collapses to nothing.
    expect(
      applyToggleGrant(['project.*'], 'project.read', [{ key: 'project.read', description: '' }]),
    ).toEqual([]);
  });

  it('uncheck sweeps the full prefix even when "checked" was promoted from a partial child list', () => {
    // The node lists only ONE child. With that child AND an unlisted sibling granted,
    // the node reads as "effectively checked" (its listed child is granted), and
    // unchecking sweeps the entire 'project.' prefix — removing the unlisted sibling
    // too. Documents (does not endorse) the asymmetry between the children-based
    // "checked" predicate and the prefix-based uncheck sweep.
    const node: CatalogNode = { grant: 'project.*', children: [{ grant: 'project.read' }] };
    const grants = ['project.read', 'project.extra'];
    expect(isItemEffectivelyChecked(node, grants)).toBe(true);
    expect(applyToggleCatalogItem(grants, node)).toEqual([]);
  });
});
