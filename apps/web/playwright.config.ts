import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const apiBaseURL = process.env.API_BASE_URL || 'http://127.0.0.1:3001';
const e2eDatabasePath =
  process.env.E2E_DATABASE_URL || path.resolve(__dirname, '../../data/pulse-e2e.db');

export default defineConfig({
  testDir: './e2e',
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: [
    {
      command: `DATABASE_URL=${e2eDatabasePath} pnpm --filter api dev`,
      cwd: path.resolve(__dirname, '../..'),
      reuseExistingServer: !process.env.CI,
      url: `${apiBaseURL}/health`,
    },
    {
      command: 'pnpm dev --host 127.0.0.1 --port 4173',
      cwd: __dirname,
      reuseExistingServer: !process.env.CI,
      url: baseURL,
    },
  ],
});
