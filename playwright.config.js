import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // sequential — tests share a local server and clear IDB between runs
  timeout: 15_000,      // per-test timeout
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

  // Start the static server if not already running
  webServer: {
    command: 'python3 -m http.server 7823',
    url: 'http://localhost:7823',
    reuseExistingServer: true,
    timeout: 5000,
  },
});
