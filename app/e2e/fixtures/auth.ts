import { test as base, Page } from '@playwright/test'

type AuthFixtures = {
  authenticatedPage: Page
}

/**
 * `authenticatedPage` provisions a page that is already authenticated as the
 * dev admin user (`dev@local`) before any navigation happens.
 *
 * Flow:
 *   1. POST /api/auth/dev-login (requires backend DEV_AUTH_BYPASS=1) → token + user.
 *   2. Inject the token + user into localStorage via `addInitScript` so the
 *      AuthContext on first React render finds them. This avoids the race
 *      where `page.goto('/') → set localStorage → reload` lets AuthContext
 *      see an empty token, fire /me with no auth, log out, then read the
 *      token after reload too late.
 *   3. Yield the page. Tests then call `page.goto('/')` (or any path) and
 *      the app renders authenticated content immediately.
 */
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    const res = await page.request.post('http://localhost:8000/api/auth/dev-login')
    if (!res.ok()) {
      throw new Error(
        `dev-login failed with status ${res.status()}. Ensure backend has DEV_AUTH_BYPASS=1.`,
      )
    }
    const { access_token, user } = await res.json()

    await page.addInitScript(
      ({ token, userData }) => {
        localStorage.setItem('token', token)
        localStorage.setItem('user', JSON.stringify(userData))
      },
      { token: access_token, userData: user },
    )

    // `use` here is Playwright's fixture API, not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page)
  },
})

export { expect } from '@playwright/test'
