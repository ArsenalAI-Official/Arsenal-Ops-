import { FullConfig } from '@playwright/test'

/**
 * Runs once before all tests:
 * 1. Wipe the e2e.db SQLite file so every run starts with a clean schema.
 *    (Playwright's `webServer` starts uvicorn after globalSetup runs, so the
 *    backend will create fresh tables on boot.)
 * 2. Wait for the backend to be reachable (dev-login probe).
 *
 * The admin user is auto-bootstrapped by the backend from ADMIN_EMAILS on
 * first startup — see backend/main.py — so no seed step is required here.
 */
async function globalSetup(_config: FullConfig) {
  // DB wipe happens in the backend webServer command (`rm -f e2e.db && uvicorn …`)
  // BEFORE uvicorn boots — wiping here would race SQLAlchemy's open file handle.
  // This setup just waits for backend readiness.
  let backendReady = false
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const res = await fetch('http://localhost:8000/api/auth/dev-login/available')
      if (res.ok) {
        backendReady = true
        break
      }
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }

  if (!backendReady) {
    // Soft-fail: webServer is about to start the backend anyway; the canary
    // will retry. We log so the failure mode is visible.
    console.warn('[global-setup] Backend not yet reachable; relying on webServer to bring it up.')
  }
}

export default globalSetup
