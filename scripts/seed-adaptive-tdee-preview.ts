#!/usr/bin/env tsx

import { runAdaptiveTdeePreviewSeedCli } from '../apps/api/src/scripts/seed-adaptive-tdee-preview.js';

try {
  await runAdaptiveTdeePreviewSeedCli(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
