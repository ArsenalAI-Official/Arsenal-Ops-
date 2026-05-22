import { test, expect } from './fixtures/auth'

test.describe('Comments and mentions', () => {
  let projectId: number
  let workItemId: number

  test.beforeEach(async ({ authenticatedPage }) => {
    // Create a project via API with retry logic
    let projectRes
    let project
    for (let i = 0; i < 3; i++) {
      try {
        projectRes = await authenticatedPage.request.post('http://localhost:8000/api/projects/', {
          data: {
            name: `E2E-Comments-${Date.now()}`,
            description: 'Comments E2E test',
            key_prefix: `COM${Date.now().toString().slice(-4)}`,
            developers: [],
          },
        })
        if (projectRes.ok()) {
          project = await projectRes.json()
          projectId = project.id
          break
        }
      } catch (err) {
        if (i === 2) throw err
      }
    }

    // Create a work item in the project
    let itemRes
    let workItem
    for (let i = 0; i < 3; i++) {
      try {
        itemRes = await authenticatedPage.request.post('http://localhost:8000/api/workitems/', {
          data: {
            project_id: projectId,
            type: 'task',
            title: `Comments Test Item ${Date.now()}`,
            description: 'Testing comments feature',
            status: 'todo',
            priority: 'medium',
          },
        })
        if (itemRes.ok()) {
          workItem = await itemRes.json()
          workItemId = workItem.id
          break
        }
      } catch (err) {
        if (i === 2) throw err
      }
    }
  })

  // FIXME(e2e-week5): work-item card selector `[class*="card"]` doesn't match
  // the actual rendered DOM. Find the real card role/test-id and update.
  test.fixme('Add a comment to a work item', async ({ authenticatedPage }) => {
    // Navigate to the project board
    await authenticatedPage.goto(`/project/${projectId}/board`)
    await authenticatedPage.waitForLoadState('networkidle')

    // Click the work item to open the drawer
    const workItemLocator = authenticatedPage.locator('[class*="card"]').first()
    await expect(workItemLocator).toBeVisible({ timeout: 5000 })
    await workItemLocator.click()

    // Wait for drawer to open
    const commentInput = authenticatedPage.getByPlaceholder(/Add a comment/)
    await expect(commentInput).toBeVisible({ timeout: 5000 })

    // Type a comment with timestamp for uniqueness
    const commentText = `e2e comment ${Date.now()}`
    await commentInput.fill(commentText)

    // Submit the comment by clicking the "Comment" button
    const commentButton = authenticatedPage.getByRole('button', { name: /^Comment$/i })
    await expect(commentButton).toBeEnabled()
    await commentButton.click()

    // Wait for the comment to appear in the list
    await expect(authenticatedPage.getByText(commentText)).toBeVisible({ timeout: 5000 })
  })

  // FIXME(e2e-week5): same card-selector issue blocks drawer open. Also the
  // @mention dropdown autocomplete flow may need explicit handling.
  test.fixme('Add a comment with @mention — mention is parsed', async ({ authenticatedPage }) => {
    // Navigate to the project board
    await authenticatedPage.goto(`/project/${projectId}/board`)
    await authenticatedPage.waitForLoadState('networkidle')

    // Open the work item drawer
    const workItemLocator = authenticatedPage.locator('[class*="card"]').first()
    await expect(workItemLocator).toBeVisible({ timeout: 5000 })
    await workItemLocator.click()

    // Find the comment input
    const commentInput = authenticatedPage.getByPlaceholder(/Add a comment/)
    await expect(commentInput).toBeVisible({ timeout: 5000 })

    // Type a comment with a mention pattern (will use @dev format)
    const commentText = `@dev1 please review this - ${Date.now()}`
    await commentInput.fill(commentText)

    // Submit the comment
    const commentButton = authenticatedPage.getByRole('button', { name: /^Comment$/i })
    await expect(commentButton).toBeEnabled()
    await commentButton.click()

    // Wait for the comment to appear
    await expect(authenticatedPage.getByText(new RegExp(`review this`))).toBeVisible({
      timeout: 5000,
    })
  })

  // FIXME(e2e-week5): same card-selector issue. After fixing the card opener,
  // this should be the cheapest to land — it relies on API-side persistence.
  test.fixme('Persist + reload — comment survives', async ({ authenticatedPage }) => {
    // First, add a comment via API for speed with retry
    let commentRes
    for (let i = 0; i < 3; i++) {
      try {
        commentRes = await authenticatedPage.request.post('http://localhost:8000/api/comments/', {
          data: {
            work_item_id: workItemId,
            content: `persistent comment ${Date.now()}`,
            comment_type: 'comment',
          },
        })
        if (commentRes.ok()) break
      } catch (err) {
        if (i === 2) throw err
      }
    }

    // Navigate to the project board
    await authenticatedPage.goto(`/project/${projectId}/board`)
    await authenticatedPage.waitForLoadState('networkidle')

    // Open the work item drawer
    const workItemLocator = authenticatedPage.locator('[class*="card"]').first()
    await expect(workItemLocator).toBeVisible({ timeout: 5000 })
    await workItemLocator.click()

    // Verify the comment is visible
    const persistentComment = authenticatedPage.getByText(/persistent comment/)
    await expect(persistentComment).toBeVisible({ timeout: 5000 })

    // Reload the page
    await authenticatedPage.reload()
    await authenticatedPage.waitForLoadState('networkidle')

    // Re-open the drawer
    const workItemLocatorAfterReload = authenticatedPage.locator('[class*="card"]').first()
    await expect(workItemLocatorAfterReload).toBeVisible({ timeout: 5000 })
    await workItemLocatorAfterReload.click()

    // Verify the comment still exists after reload
    const persistentCommentAfterReload = authenticatedPage.getByText(/persistent comment/)
    await expect(persistentCommentAfterReload).toBeVisible({ timeout: 5000 })
  })
})
