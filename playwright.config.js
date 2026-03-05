import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: 15_000,
  retries: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:7823',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'vite preview --port 7823 --base /typehere/',
    url: 'http://localhost:7823/typehere/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
