#!/usr/bin/env tsx

import { runAdaptiveTdeeBacktestCli } from '../apps/api/src/scripts/backtest-adaptive-tdee.js';

try {
  runAdaptiveTdeeBacktestCli(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
