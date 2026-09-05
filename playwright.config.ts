import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['Desktop Chrome'],
    channel: process.env.PORTAL_TEST_CHROME ? 'chrome' : undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: { command: process.env.PORTAL_TEST_DEV ? 'npm run dev -- --port 4173' : 'npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
