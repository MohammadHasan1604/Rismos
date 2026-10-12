import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 90 * 1000,
  expect: {
    timeout: 15 * 1000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4028',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'npx next start -p 4028',
    url: 'http://127.0.0.1:4028/api/settings/branding',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
