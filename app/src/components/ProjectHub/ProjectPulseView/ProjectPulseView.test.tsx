import { describe, it, expect } from 'vitest';
import { DUMMY_PULSE_DATA } from '../pulseData.fixtures';
import { renderPlain } from '@/test-utils/render';
import ProjectPulseView from './ProjectPulseView';

// Render smoke: ProjectPulseView is a pure, prop-driven component that renders
// hand-rolled SVG (no recharts, no canvas), so it mounts cleanly in jsdom.
describe('ProjectPulseView (render smoke)', () => {
  it('renders the seeded pulse without throwing', () => {
    const { getByText, getByRole } = renderPlain(<ProjectPulseView pulse={DUMMY_PULSE_DATA} />);
    // Static header text always present
    expect(getByText('Monthly Burn · Dev + GTM')).toBeInTheDocument();
    // The heading renders as an <h2> (accessible role) with the same text.
    expect(getByRole('heading', { name: 'Monthly Burn · Dev + GTM' })).toBeInTheDocument();
    // Contract-window subtitle is composed of interpolated text nodes; the
    // static suffix is stable regardless of the fixture's month strings.
    expect(getByText(/Read-only · Synced from time tracking & billing/)).toBeInTheDocument();
    // Fixture-derived data assertion: the ProjectHeroCard renders the contract
    // total via fmt$(computeDerived(pulse).contractTotal). From the seeded
    // ledger (210000 + 72000 + 34000 + 48000 - 82500, Product Mgmt/GTM excluded)
    // that is 281500 → "$281,500". Distinct value, appears once in the tree, so
    // it fails if the hero card renders no data.
    expect(getByText('$281,500')).toBeInTheDocument();
  });
});
// Note: the all-zeroed empty-pulse path is covered purely (no render) in
// pulseData.test.ts. A render smoke on buildEmptyPulseData() is intentionally
// skipped here: with zero months the hand-rolled burn/forecast SVGs divide by
// an empty range and emit Infinity/NaN CSS values (noisy but non-throwing).
// That's a real component edge case, not a test bug — flagged, not asserted.
