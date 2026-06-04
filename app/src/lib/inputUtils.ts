import type { KeyboardEvent } from 'react';

/**
 * Parse an input value to a non-negative integer.
 * Empty / non-numeric → 0. Negative → 0.
 */
export const clampNonNegInt = (raw: string | number | null | undefined): number => {
  if (raw === '' || raw == null) return 0;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return 0;
  return Math.max(0, Math.trunc(n));
};

/**
 * Block keys that would let a user type a negative number or scientific
 * notation into a `type="number"` input. Pair with `min="0"` and an
 * `onChange` that also clamps the parsed value (defence in depth — paste
 * still bypasses this).
 */
export const blockNegativeKey = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') {
    e.preventDefault();
  }
};
