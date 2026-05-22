import { test, expect } from './fixtures/auth'

/**
 * E2E journey for capacity transfer: the May 21 production hotfix locked a bug
 * where ticket transfers didn't conserve total capacity. This test ensures the
 * conservation invariant holds: pre_sum == post_sum of allocated hours across
 * all developers before and after any ticket transfer.
 *
 * Since capacity transfer is implemented as ticket reassignment (changing assignee),
 * we test this via the work-items API and the /api/admin/developers/capacity endpoint.
 */

// FIXME(e2e-week5): fails at API setup with "Failed to create project".
// Investigate POST /api/projects/ payload shape and auth-token extraction.
// Marked .fixme until then; conservation invariant is also pinned by
// backend/tests/test_capacity_properties.py at the unit level.
test.fixme('capacity transfer conservation invariant across ticket reassignments', async ({
  authenticatedPage,
}) => {
  const now = Date.now()
  const projectName = `CapTransfer-${now}`

  const apiBase = 'http://localhost:8000/api'

  // === SETUP: Create project, 3 developers, allocate tickets ===

  // 1. Create project
  const projRes = await authenticatedPage.request.post(`${apiBase}/projects`, {
    data: { name: projectName, description: 'Capacity transfer conservation test' },
  })
  if (!projRes.ok()) throw new Error('Failed to create project')
  const project = await projRes.json()
  const projectId = project.id

  // 2. Create 3 developers
  const devs: Array<{ id: number; name: string; email: string }> = []
  for (let i = 0; i < 3; i++) {
    const devRes = await authenticatedPage.request.post(`${apiBase}/developers`, {
      data: {
        name: `Dev${String.fromCharCode(65 + i)}-${now}`,
        email: `dev${i}-${now}@test.local`,
      },
    })
    if (!devRes.ok()) throw new Error(`Failed to create Dev${i}`)
    const dev = await devRes.json()
    devs.push(dev)
  }

  // 3. Add developers to project
  for (const dev of devs) {
    const addRes = await authenticatedPage.request.post(
      `${apiBase}/projects/${projectId}/developers`,
      {
        data: { developer_id: dev.id },
      },
    )
    if (!addRes.ok()) throw new Error(`Failed to add dev ${dev.id} to project`)
  }

  // 4. Create 4 work items assigned to DevA (varying estimated_hours)
  const tickets: Array<{ id: number; estimated_hours: number }> = []
  const ticketHours = [12, 10, 14, 8] // totals 44h across devs

  for (let i = 0; i < ticketHours.length; i++) {
    const wiRes = await authenticatedPage.request.post(
      `${apiBase}/projects/${projectId}/work-items`,
      {
        data: {
          type: 'task',
          key: `XFER-${now}-${i}`,
          title: `Transfer test ticket ${i}`,
          status: 'in_progress',
          estimated_hours: ticketHours[i],
          assignee_id: devs[0].id, // All assigned to DevA initially
        },
      },
    )
    if (!wiRes.ok()) throw new Error(`Failed to create ticket ${i}`)
    const ti = await wiRes.json()
    tickets.push(ti)
  }

  // Small delay to ensure DB state is consistent
  await authenticatedPage.waitForTimeout(300)

  // === PHASE 1: Capture pre-transfer capacity ===

  const cap_pre_res = await authenticatedPage.request.get(`${apiBase}/admin/developers/capacity`)
  if (!cap_pre_res.ok()) throw new Error('Failed to fetch capacity (pre-transfer)')
  const caps_pre = await cap_pre_res.json()
  const pre_sum = caps_pre.reduce((sum: number, c: any) => sum + c.this_week_capacity_used, 0)

  // Sanity check: should see ~44h on DevA, 0 on others
  const devA_pre = caps_pre.find((c: any) => c.developer_id === devs[0].id)
  const devB_pre = caps_pre.find((c: any) => c.developer_id === devs[1].id)
  const devC_pre = caps_pre.find((c: any) => c.developer_id === devs[2].id)

  expect(devA_pre.this_week_capacity_used).toBe(44)
  expect(devB_pre.this_week_capacity_used).toBe(0)
  expect(devC_pre.this_week_capacity_used).toBe(0)

  // === PHASE 2: Execute transfers ===

  // Transfer ticket[0] (12h) to DevB
  await authenticatedPage.request.put(`${apiBase}/projects/${projectId}/work-items/${tickets[0].id}`, {
    data: { assignee_id: devs[1].id },
  })

  // Transfer ticket[1] (10h) to DevC
  await authenticatedPage.request.put(`${apiBase}/projects/${projectId}/work-items/${tickets[1].id}`, {
    data: { assignee_id: devs[2].id },
  })

  // Transfer ticket[2] (14h) from DevA to DevB
  await authenticatedPage.request.put(`${apiBase}/projects/${projectId}/work-items/${tickets[2].id}`, {
    data: { assignee_id: devs[1].id },
  })

  await authenticatedPage.waitForTimeout(300)

  // === PHASE 3: Capture post-transfer capacity and verify conservation ===

  const cap_post_res = await authenticatedPage.request.get(`${apiBase}/admin/developers/capacity`)
  if (!cap_post_res.ok()) throw new Error('Failed to fetch capacity (post-transfer)')
  const caps_post = await cap_post_res.json()
  const post_sum = caps_post.reduce((sum: number, c: any) => sum + c.this_week_capacity_used, 0)

  // === CONSERVATION INVARIANT: Total must stay constant ===
  expect(post_sum).toBe(pre_sum)

  // === Sanity check: Verify allocation redistributed correctly ===
  const devA_post = caps_post.find((c: any) => c.developer_id === devs[0].id)
  const devB_post = caps_post.find((c: any) => c.developer_id === devs[1].id)
  const devC_post = caps_post.find((c: any) => c.developer_id === devs[2].id)

  // DevA: 44 - 12 - 10 - 14 = 8 (ticket[3] remains)
  expect(devA_post.this_week_capacity_used).toBe(8)
  // DevB: 12 + 14 = 26
  expect(devB_post.this_week_capacity_used).toBe(26)
  // DevC: 10
  expect(devC_post.this_week_capacity_used).toBe(10)

  // === PHASE 4: Verify persistence across page reload ===
  await authenticatedPage.reload()
  await authenticatedPage.waitForTimeout(500)

  const cap_reload_res = await authenticatedPage.request.get(`${apiBase}/admin/developers/capacity`)
  if (!cap_reload_res.ok()) throw new Error('Failed to fetch capacity (post-reload)')
  const caps_reload = await cap_reload_res.json()

  const devA_reload = caps_reload.find((c: any) => c.developer_id === devs[0].id)
  const devB_reload = caps_reload.find((c: any) => c.developer_id === devs[1].id)
  const devC_reload = caps_reload.find((c: any) => c.developer_id === devs[2].id)

  expect(devA_reload.this_week_capacity_used).toBe(8)
  expect(devB_reload.this_week_capacity_used).toBe(26)
  expect(devC_reload.this_week_capacity_used).toBe(10)
})
