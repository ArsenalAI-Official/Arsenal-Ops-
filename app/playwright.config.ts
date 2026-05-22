import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  globalSetup: path.join(__dirname, 'e2e/global-setup.ts'),
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Backend: uvicorn with E2E env vars inline. No wrapper scripts, no
      // .env mutation — env passes directly to the subprocess. `rm -f e2e.db`
      // runs BEFORE uvicorn boots so SQLAlchemy creates a fresh schema each
      // run; wiping in globalSetup would race the backend's open file handle.
      // PYTHON defaults to .venv/bin/python (local dev) but is overridden to
      // `python` in CI where deps live in the system interpreter (see test.yml
      // e2e job).
      command:
        'cd ../backend && rm -f e2e.db && ${PYTHON:-.venv/bin/python} -m uvicorn main:app --port 8000',
      port: 8000,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL: 'sqlite:///./e2e.db',
        SECRET_KEY: 'test-only-secret',
        DEV_AUTH_BYPASS: '1',
        ADMIN_EMAILS: 'admin@e2e.local',
        ENVIRONMENT: 'test',
        // Backend's hardcoded CORS allowlist covers vite dev ports (5173–5175)
        // but not vite preview's 4173; explicitly allow it for E2E.
        CORS_ORIGINS: 'http://localhost:4173',
      },
    },
    {
      command: 'npx vite build && npm run preview',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
