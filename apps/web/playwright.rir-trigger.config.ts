import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

// Dedicated services must already be running against this disposable database.
const database = resolve(__dirname, '../../data/issue-155/browser.db');
if (
  process.env.BASE_URL !== 'http://127.0.0.1:5255' ||
  process.env.API_BASE_URL !== 'http://127.0.0.1:3155' ||
  process.env.E2E_DATABASE_URL !== database
)
  throw new Error('RIR trigger acceptance requires the explicit isolated issue-155 services');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'rir-trigger-shortcuts.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  outputDir: '../../artifacts/issue-155/playwright-results',
  reporter: [['list']],
  use: { baseURL: process.env.BASE_URL, channel: 'chrome', timezoneId: 'America/Detroit' },
});
