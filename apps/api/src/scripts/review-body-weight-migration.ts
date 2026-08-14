import { resolve } from 'node:path';

import Database from 'better-sqlite3';

import {
  inventoryLegacyBodyWeight,
  prepareCanonicalWeightMigration,
  type LegacyWeightUnitMap,
  writeLegacyWeightUnitMap,
} from '../db/canonical-weight-migration.js';

const getArgument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const databasePath = process.env.DATABASE_URL;
const outputPath = process.env.BODY_WEIGHT_LEGACY_UNIT_MAP_PATH;
const assignAll = getArgument('--assign-all');
const reviewedBy = getArgument('--reviewed-by');
const knownHistory = getArgument('--known-history');

if (!databasePath || !outputPath) {
  throw new Error('DATABASE_URL and BODY_WEIGHT_LEGACY_UNIT_MAP_PATH are required.');
}

if (assignAll !== 'lbs' && assignAll !== 'kg') {
  throw new Error('Use --assign-all lbs or --assign-all kg after reviewing deployment history.');
}

if (!reviewedBy?.trim() || !knownHistory?.trim()) {
  throw new Error('--reviewed-by and --known-history are required review provenance.');
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
    reviewedBy: reviewedBy.trim(),
    knownHistory: knownHistory.trim(),
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

  writeLegacyWeightUnitMap(resolve(outputPath), migrationMap);

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
