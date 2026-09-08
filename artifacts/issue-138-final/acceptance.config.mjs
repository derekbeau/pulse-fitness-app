import { defineConfig } from '@playwright/test';
import base from '../../playwright.config.ts';

if (process.env.PULSE_ACCEPTANCE_LANE !== 'pulse160') {
  throw new Error('Source the assigned pulse160-acceptance-env.sh wrapper first');
}
// Keep the existing harness's networking, fixture DB, readiness URLs and Vite command.
// This worktree has no .env. The API command uses only the explicit synthetic process env.
export default defineConfig(base, {
  testDir: '.',
  testMatch: 'acceptance.spec.mjs',
  retries: 0,
  workers: 1,
  globalSetup: './acceptance-setup.mjs',
  outputDir: './browser-results',
  reporter: [['list']],
  use: { ...base.use, trace: 'on', screenshot: 'on', timezoneId: 'America/Detroit' },
  webServer: base.webServer.map((server, index) => ({
    ...server,
    reuseExistingServer: false,
    ...(index === 0
      ? {
          command: server.command.replace(
            'pnpm --filter api dev',
            'pnpm --filter @pulse/api exec tsx src/index.ts',
          ),
          env: {
            NODE_ENV: 'development',
            HOST: '127.0.0.1',
            JWT_SECRET: 'pulse160-fictional-acceptance-only',
          },
        }
      : {}),
  })),
});
