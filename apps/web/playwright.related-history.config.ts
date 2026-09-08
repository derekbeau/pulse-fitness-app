import { defineConfig } from '@playwright/test';
import {
  RELATED_HISTORY_API,
  RELATED_HISTORY_DATABASE,
  RELATED_HISTORY_WEB,
} from './e2e/related-history-fixture';

if (
  process.env.BASE_URL !== RELATED_HISTORY_WEB ||
  process.env.API_BASE_URL !== RELATED_HISTORY_API ||
  process.env.VITE_API_PROXY_TARGET !== RELATED_HISTORY_API ||
  process.env.E2E_DATABASE_URL !== RELATED_HISTORY_DATABASE
) {
  throw new Error('Related-history acceptance requires explicit isolated issue-154 services');
}
export default defineConfig({
  testDir: './e2e',
  testMatch: 'related-history-visibility.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  outputDir: '../../artifacts/issue-154/playwright-results',
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL,
    timezoneId: 'America/Detroit',
    screenshot: 'only-on-failure',
  },
});
