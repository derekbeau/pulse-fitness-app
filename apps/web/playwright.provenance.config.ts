import { defineConfig, devices } from '@playwright/test';

// Run only against explicitly supplied disposable local services.
if (!process.env.BASE_URL || !process.env.API_BASE_URL || !process.env.E2E_DATABASE_URL) {
  throw new Error('Provenance acceptance requires explicit isolated web/API URLs and database');
}
export default defineConfig({
  testDir: './e2e',
  testMatch: 'scheduled-provenance.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: process.env.PROVENANCE_OUTPUT_DIR ?? '/private/tmp/pulse-pr134-evidence/browser',
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    baseURL: process.env.BASE_URL,
    timezoneId: 'Pacific/Kiritimati',
    trace: 'on',
    screenshot: 'on',
  },
});
