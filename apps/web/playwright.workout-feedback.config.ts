import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

if (process.env.PULSE_WORKOUT_FEEDBACK_SYNTHETIC !== 'I_ACKNOWLEDGE_SYNTHETIC_FIXTURE_ONLY') {
  throw new Error('Explicit synthetic fixture acknowledgement required.');
}

const apiPort = '3125';
const webPort = '4195';
const databasePath = path.resolve(
  process.env.PULSE_WORKOUT_FEEDBACK_DATABASE ??
    `/tmp/pulse-workout-feedback-150-${process.pid}.db`,
);

export default defineConfig({
  testDir: './e2e',
  testMatch: 'workout-feedback-questions.spec.ts',
  workers: 1,
  retries: 0,
  outputDir: '../../docs/implementation/workout-feedback-questions-evidence/playwright',
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile:
          '../../docs/implementation/workout-feedback-questions-evidence/playwright-results.json',
      },
    ],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `PORT=${apiPort} DATABASE_URL=${databasePath} JWT_SECRET=synthetic-150-jwt pnpm --filter api exec tsx src/index.ts`,
      cwd: path.resolve(__dirname, '../..'),
      reuseExistingServer: false,
      url: `http://127.0.0.1:${apiPort}/health`,
    },
    {
      command: `VITE_API_PORT=${apiPort} pnpm dev --host 127.0.0.1 --port ${webPort}`,
      cwd: __dirname,
      reuseExistingServer: false,
      url: `http://127.0.0.1:${webPort}`,
    },
  ],
});
