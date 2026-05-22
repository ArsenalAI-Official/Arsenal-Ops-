import { test, expect } from './fixtures/auth'

/**
 * Canary: proves the E2E rig works end-to-end.
 *
 * Verifies:
 *   1. Backend's dev-login endpoint issues a token (via authenticatedPage fixture).
 *   2. `addInitScript` injects the token+user into localStorage before React mounts.
 *   3. AuthContext's /api/auth/me + /me/capabilities calls succeed (CORS open for :4173).
 *   4. The authenticated app renders — NOT the login gate.
 */
test('authenticated user lands on the app, not the login screen', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/')
  await authenticatedPage.waitForLoadState('networkidle')

  // The login screen renders "Sign in with your Google account" prominently.
  // If we're authenticated, that text MUST NOT be visible.
  await expect(authenticatedPage.getByText(/Sign in with (your Google account|Google)/i)).toHaveCount(0)

  // URL must be the app root, not redirected to /login or similar.
  expect(authenticatedPage.url()).toMatch(/^http:\/\/localhost:4173\/?(\?.*)?$/)
})
