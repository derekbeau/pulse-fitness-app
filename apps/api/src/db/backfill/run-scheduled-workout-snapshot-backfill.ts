import { backfillScheduledWorkoutSnapshots } from './scheduled-workout-snapshots.js';
import { db, sqlite } from '../index.js';

const run = async () => {
  try {
    await backfillScheduledWorkoutSnapshots({ database: db });
  } finally {
    sqlite.close();
  }
};

void run();
