// Global test setup — runs once before the suite, wires every cross-cutting
// concern. See docs/frontend-testing-guide.md §1.
//
// Order matters: extend assertions → mock auth at the module boundary →
// polyfill jsdom gaps → install the MSW lifecycle + per-test reset chain.
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { authModuleMock, resetMockAuthState } from '@/test-utils/authMocks';
import { resetMockServerState, server } from '@/mocks/node';

// ── Auth: replace the real provider at the module boundary ──────────────────
// The real AuthContext talks to the backend and runs idle-timeout effects.
// Tests want a deterministic, overridable slate (see authMocks). vi.mock is
// hoisted above imports; authModuleMock reads the hoisted mock state.
vi.mock('@/contexts/AuthContext', () => authModuleMock());

// ── jsdom polyfills (centralized; do not patch per-file) ────────────────────
// jsdom ships none of these, yet Radix primitives (Popover/DropdownMenu/Tooltip)
// and assorted layout code call them. Polyfilling once here beats ad-hoc patches
// and silences noisy stderr.
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }

  class StubObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  const g = window as unknown as Record<string, unknown>;
  g.ResizeObserver ??= StubObserver;
  g.IntersectionObserver ??= StubObserver;

  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.scrollIntoView ??= () => {};
  proto.scrollTo ??= () => {};
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};

  const dialogProto = window.HTMLDialogElement?.prototype as unknown as
    | Record<string, unknown>
    | undefined;
  if (dialogProto) {
    dialogProto.showModal ??= () => {};
    dialogProto.show ??= () => {};
    dialogProto.close ??= () => {};
  }
}

// ── MSW lifecycle + per-test isolation ──────────────────────────────────────
beforeAll(() => {
  // An unhandled request is a test failure with the offending URL — not a
  // silent empty response. The load-bearing line of the whole setup.
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers(); // drop per-test server.use(...) overrides
  resetMockServerState(); // reset every in-memory store to its seed
  localStorage.clear();
  resetMockAuthState(); // back to the default signed-in admin
  cleanup(); // unmount React trees
});

afterAll(() => {
  server.close();
});
