import { describe, it, expect } from 'vitest';
import { getHealthMeta } from './health';

describe('getHealthMeta', () => {
  it('returns Healthy at the >=80 boundary', () => {
    expect(getHealthMeta(80).label).toBe('Healthy');
    expect(getHealthMeta(100).label).toBe('Healthy');
    expect(getHealthMeta(80).color).toBe('#34D399');
  });

  it('returns At Risk in the 60–79 band', () => {
    expect(getHealthMeta(79).label).toBe('At Risk');
    expect(getHealthMeta(60).label).toBe('At Risk');
    expect(getHealthMeta(60).color).toBe('#FBBF24');
  });

  it('returns Critical below 60', () => {
    expect(getHealthMeta(59).label).toBe('Critical');
    expect(getHealthMeta(0).label).toBe('Critical');
    expect(getHealthMeta(0).color).toBe('#EF4444');
  });

  it('keeps border/bg colors aligned with the score band', () => {
    const meta = getHealthMeta(90);
    expect(meta.borderColor).toContain('#34D399');
    expect(meta.bgColor).toContain('#34D399');
  });
});
