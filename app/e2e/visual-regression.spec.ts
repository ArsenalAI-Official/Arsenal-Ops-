import { test, expect } from './fixtures/auth'
import { Page } from '@playwright/test'

/**
 * Visual Regression Tests — Playwright-based screenshot comparisons.
 *
 * Baseline workflow:
 *   1. First run: `npm run e2e -- visual-regression --update-snapshots`
 *      Generates baseline images under `app/e2e/visual-regression.spec.ts-snapshots/`
 *   2. Subsequent runs: `npm run e2e -- visual-regression`
 *      Diffs captured images against baselines. Fails if > 5% pixel difference.
 *   3. On PR, CI uploads diff images on failure via `actions/upload-artifact@v4`.
 *
 * Baseline images are committed to the repo and serve as the canonical
 * "correct" layout. Design/layout regressions are caught automatically.
 *
 * Configuration:
 *   - maxDiffPixelRatio: 0.05 (5% threshold; avoids brittle failures from
 *     font rendering / antialiasing differences across runs/machines).
 *   - fullPage: true (capture entire scrollable area).
 *   - Animations + transitions are disabled via CSS injection.
 *   - Dynamic content (timestamps, status text) is normalized before snapshot.
 */

/**
 * Helper: normalize animations and dynamic content before taking a screenshot.
 */
async function normalizeForSnapshot(page: Page) {
  // Disable all animations and transitions
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  })

  // Normalize timestamps to a fixed value (avoid dynamic dates breaking snapshots)
  await page.evaluate(() => {
    document.querySelectorAll('time, [data-testid="timestamp"]').forEach((el) => {
      el.textContent = '2026-01-01'
    })
  })

  // Wait for network to settle
  await page.waitForLoadState('networkidle')
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot 1: Login page (unauthenticated)
 *
 * Route: /
 * Auth: None (plain page fixture)
 * Validates: Login UI layout, sign-in buttons, error states
 */
test('visual: login page (unauthenticated landing)', async ({ page }) => {
  // Use plain page (not authenticatedPage) to test the login screen
  await page.goto('/')
  await normalizeForSnapshot(page)

  // Mask the "Sign in with Google" button area to avoid dynamic SDK state
  await expect(page).toHaveScreenshot('login-page.png', {
    maxDiffPixelRatio: 0.05,
    fullPage: true,
  })
})

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot 2: Projects landing page (empty state)
 *
 * Route: /
 * Auth: Authenticated dev@local
 * Validates: Empty projects list, header, My Tasks widget, QuickNotes
 * Dynamic content masked: timestamps in My Tasks, CreatedBy dates
 */
test('visual: projects page (empty state)', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/')
  await normalizeForSnapshot(authenticatedPage)

  // Mask dynamic dates in the My Tasks section if visible
  await authenticatedPage.evaluate(() => {
    document.querySelectorAll('[data-testid="task-due-date"]').forEach((el) => {
      el.textContent = '2026-01-15'
    })
  })

  await expect(authenticatedPage).toHaveScreenshot('projects-empty.png', {
    maxDiffPixelRatio: 0.05,
    fullPage: true,
  })
})

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot 3: Projects page with seeded project
 *
 * Route: /
 * Auth: Authenticated dev@local
 * Setup: Seed a project via POST /api/projects/
 * Validates: Projects box with one card, navigation, layout with content
 */
test('visual: projects page with one seeded project', async ({ authenticatedPage }) => {
  // First, navigate to a page to ensure the page context is ready
  // (the authenticatedPage fixture's addInitScript will set up the token)
  await authenticatedPage.goto('/')
  await authenticatedPage.waitForLoadState('networkidle')

  // Now get the token from localStorage (it was set by addInitScript during navigation)
  const token = await authenticatedPage.evaluate(() => localStorage.getItem('token'))

  if (!token) {
    throw new Error('Auth token not found in localStorage')
  }

  // Seed a project via API with auth header
  const seedRes = await authenticatedPage.request.post('http://localhost:8000/api/projects/', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      name: 'Snapshot Project',
      description: 'Test project for visual regression',
      github_repo_url: '',
    },
  })

  if (!seedRes.ok()) {
    throw new Error(`Failed to seed project: ${seedRes.status()}`)
  }

  // Reload to see the seeded project
  await authenticatedPage.reload()
  await normalizeForSnapshot(authenticatedPage)

  // Mask any dynamic project metadata (created_at, developer_count if shown)
  await authenticatedPage.evaluate(() => {
    document.querySelectorAll('[data-testid="project-created-at"]').forEach((el) => {
      el.textContent = '2026-01-01'
    })
  })

  await expect(authenticatedPage).toHaveScreenshot('projects-with-one.png', {
    maxDiffPixelRatio: 0.05,
    fullPage: true,
  })
})

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot 4: Project board (empty)
 *
 * Route: /project/:id/board
 * Auth: Authenticated dev@local
 * Setup: Seed a project, then navigate to its board
 * Validates: Empty kanban board, header, column layout, controls
 */
test('visual: project board (empty state)', async ({ authenticatedPage }) => {
  // First, navigate to a page to ensure the page context is ready
  // (the authenticatedPage fixture's addInitScript will set up the token)
  await authenticatedPage.goto('/')
  await authenticatedPage.waitForLoadState('networkidle')

  // Now get the token from localStorage (it was set by addInitScript during navigation)
  const token = await authenticatedPage.evaluate(() => localStorage.getItem('token'))

  if (!token) {
    throw new Error('Auth token not found in localStorage')
  }

  // Seed a project
  const seedRes = await authenticatedPage.request.post('http://localhost:8000/api/projects/', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      name: 'Board Test Project',
      description: 'Project for board visual regression',
      github_repo_url: '',
    },
  })

  if (!seedRes.ok()) {
    throw new Error(`Failed to seed project for board: ${seedRes.status()}`)
  }

  const projectData = await seedRes.json()
  const projectId = projectData.id

  // Navigate to the project board
  await authenticatedPage.goto(`/project/${projectId}/board`)
  await normalizeForSnapshot(authenticatedPage)

  await expect(authenticatedPage).toHaveScreenshot('project-board-empty.png', {
    maxDiffPixelRatio: 0.05,
    fullPage: true,
  })
})

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot 5: Admin dashboard (default tab)
 *
 * Route: /admin
 * Auth: Authenticated dev@local (admin role via DEV_AUTH_BYPASS)
 * Validates: Dashboard tab (default), stats cards, layout
 * Dynamic content masked: counts, timestamps
 */
test('visual: admin dashboard (default tab)', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/admin')
  await normalizeForSnapshot(authenticatedPage)

  // Mask any dynamic stat counters (total_employees, total_projects, etc.)
  await authenticatedPage.evaluate(() => {
    document.querySelectorAll('[data-testid="stat-value"]').forEach((el) => {
      el.textContent = '0'
    })
  })

  await expect(authenticatedPage).toHaveScreenshot('admin-dashboard.png', {
    maxDiffPixelRatio: 0.05,
    fullPage: true,
  })
})

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot 6: Personal tasks page (empty)
 *
 * Route: /personal-tasks
 * Auth: Authenticated dev@local
 * Validates: Empty tasks list, header, action buttons, layout
 */
test('visual: personal tasks page (empty state)', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/personal-tasks')
  await normalizeForSnapshot(authenticatedPage)

  await expect(authenticatedPage).toHaveScreenshot('personal-tasks-empty.png', {
    maxDiffPixelRatio: 0.05,
    fullPage: true,
  })
})
