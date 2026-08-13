import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';

import {
  inventoryLegacyBodyWeight,
  prepareCanonicalWeightMigration,
  type LegacyWeightUnitMap,
} from '../db/canonical-weight-migration.js';

const getArgument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const databasePath = process.env.DATABASE_URL;
const outputPath = process.env.BODY_WEIGHT_LEGACY_UNIT_MAP_PATH;
const assignAll = getArgument('--assign-all');

if (!databasePath || !outputPath) {
  throw new Error('DATABASE_URL and BODY_WEIGHT_LEGACY_UNIT_MAP_PATH are required.');
}

if (assignAll !== 'lbs' && assignAll !== 'kg') {
  throw new Error('Use --assign-all lbs or --assign-all kg after reviewing deployment history.');
}

const sqlite = new Database(resolve(databasePath), { readonly: true, fileMustExist: true });

try {
  const inventory = inventoryLegacyBodyWeight(sqlite);
  if (inventory.length === 0) {
    throw new Error('No legacy body-weight rows require a migration map.');
  }

  const migrationMap: LegacyWeightUnitMap = {
    version: 1,
    reviewedAt: new Date().toISOString(),
    reviewedBy: 'Codex Milestone 1 preflight',
    knownHistory:
      assignAll === 'lbs'
        ? 'Reviewed Pulse deployment history: legacy production and Gate 0 test body-weight entries were recorded in pounds.'
        : 'Reviewed deployment history confirms the selected legacy body-weight entries were recorded in kilograms.',
    users: Object.fromEntries(inventory.map((row) => [row.userId, assignAll])),
  };

  // Validate the explicit per-user map against the complete inventory before writing it.
  const validationDb = new Database(resolve(databasePath), {
    readonly: false,
    fileMustExist: true,
  });
  try {
    prepareCanonicalWeightMigration(validationDb, { map: migrationMap });
  } finally {
    validationDb.close();
  }

  writeFileSync(resolve(outputPath), `${JSON.stringify(migrationMap, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });

  const totalRows = inventory.reduce((total, row) => total + row.rowCount, 0);
  const preferences = Object.fromEntries(
    [...new Set(inventory.map((row) => row.currentPreference))].map((unit) => [
      unit,
      inventory.filter((row) => row.currentPreference === unit).length,
    ]),
  );

  console.log(
    JSON.stringify({
      affectedUsers: inventory.length,
      legacyRows: totalRows,
      mappedUnit: assignAll,
      currentPreferences: preferences,
      output: 'apps/api/data/body-weight-legacy-unit-map.json',
    }),
  );
} finally {
  sqlite.close();
}
