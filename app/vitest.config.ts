import path from 'path';
import { defineConfig } from 'vitest/config';

// Vitest config for the frontend test suite. See docs/frontend-testing-guide.md
// for the architecture this implements (MSW at the wire, generated-type
// fixtures, total per-test isolation).
//
// jsdom is the DEFAULT environment so component/hook tests mount without a
// per-file `// @vitest-environment` pragma. Pure-logic unit tests run fine
// under jsdom too; the cost is negligible at this suite size.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Pin the API base URL the mock server answers on so it matches the app's
    // runtime config byte-for-byte (src/config/api.ts reads VITE_API_URL).
    // A drifting host (127.0.0.1 vs localhost) silently breaks MSW interception.
    env: {
      VITE_API_URL: 'http://localhost:8000',
    },
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    // Bound CI parallelism; leave local unconstrained.
    maxWorkers: process.env.CI ? 2 : undefined,
    // Reset mock fns and restore spies between tests so nothing carries over.
    mockReset: true,
    restoreMocks: true,
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/mocks/**',
        'src/test-utils/**',
        'src/test/**',
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/client/**', // generated from the backend OpenAPI snapshot
        'src/main.tsx',
        'src/setupTests.ts',
        'src/vite-env.d.ts',
      ],
    },
  },
});
