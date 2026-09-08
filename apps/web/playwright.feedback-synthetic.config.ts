import { defineConfig } from '@playwright/test';
if (process.env.PULSE_FEEDBACK_SYNTHETIC !== 'I_ACKNOWLEDGE_SYNTHETIC_FIXTURE_ONLY')
  throw new Error(
    'Explicit synthetic fixture acknowledgement required. This config never starts a server.',
  );
export default defineConfig({
  testDir: './e2e',
  testMatch: 'feedback-provenance.spec.ts',
  workers: 1,
  retries: 0,
  outputDir: `../../docs/implementation/feedback-provenance-evidence/playwright-${Date.now()}`,
  use: { baseURL: 'http://127.0.0.1:5289', trace: 'retain-on-failure' },
});
