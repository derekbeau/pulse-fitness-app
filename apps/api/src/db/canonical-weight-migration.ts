import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type Database from 'better-sqlite3';
import { convertWeightToKg, isCanonicalBodyWeight, type WeightUnit } from '@pulse/shared';

export const LEGACY_WEIGHT_UNIT_MAP_ENV = 'BODY_WEIGHT_LEGACY_UNIT_MAP_PATH';

export type LegacyWeightUnitMap = {
  version: 1;
  reviewedAt: string;
  reviewedBy: string;
  knownHistory: string;
  users: Record<string, WeightUnit>;
};

export type LegacyWeightInventory = {
  currentPreference: WeightUnit;
  maximumWeight: number;
  minimumWeight: number;
  rowCount: number;
  userId: string;
};

export type CanonicalWeightMigrationPreflight = {
  affectedUsers: number;
  legacyRows: number;
  mapSha256: string | null;
  state: 'already-canonical' | 'fresh-database' | 'legacy-empty' | 'legacy-mapped';
};

const isWeightUnit = (value: unknown): value is WeightUnit => value === 'lbs' || value === 'kg';

const tableExists = (sqlite: Database.Database, tableName: string) =>
  sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
    .get(tableName) !== undefined;

const getBodyWeightColumnNames = (sqlite: Database.Database) =>
  new Set(
    (sqlite.prepare(`PRAGMA table_info('body_weight')`).all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );

const resetTemporaryMigrationMap = (sqlite: Database.Database) => {
  sqlite.exec(`
    DROP TABLE IF EXISTS temp.body_weight_legacy_unit_map;
    CREATE TEMP TABLE body_weight_legacy_unit_map (
      user_id TEXT PRIMARY KEY NOT NULL,
      unit TEXT NOT NULL CHECK (unit IN ('lbs', 'kg'))
    );
  `);
};

export const inventoryLegacyBodyWeight = (sqlite: Database.Database): LegacyWeightInventory[] => {
  if (!tableExists(sqlite, 'body_weight')) {
    return [];
  }

  const columns = getBodyWeightColumnNames(sqlite);
  if (columns.has('weight_kg') || columns.has('unit_at_entry')) {
    return [];
  }

  return sqlite
    .prepare(
      `
        SELECT
          body_weight.user_id AS userId,
          users.weight_unit AS currentPreference,
          count(*) AS rowCount,
          min(body_weight.weight) AS minimumWeight,
          max(body_weight.weight) AS maximumWeight
        FROM body_weight
        INNER JOIN users ON users.id = body_weight.user_id
        GROUP BY body_weight.user_id, users.weight_unit
        ORDER BY body_weight.user_id
      `,
    )
    .all() as LegacyWeightInventory[];
};

export const parseLegacyWeightUnitMap = (value: unknown): LegacyWeightUnitMap => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Legacy weight migration map must be a JSON object.');
  }

  const candidate = value as Partial<LegacyWeightUnitMap>;
  if (
    candidate.version !== 1 ||
    typeof candidate.reviewedAt !== 'string' ||
    candidate.reviewedAt.length === 0 ||
    typeof candidate.reviewedBy !== 'string' ||
    candidate.reviewedBy.length === 0 ||
    typeof candidate.knownHistory !== 'string' ||
    candidate.knownHistory.length === 0 ||
    typeof candidate.users !== 'object' ||
    candidate.users === null ||
    Array.isArray(candidate.users)
  ) {
    throw new Error('Legacy weight migration map is missing required review metadata.');
  }

  for (const [userId, unit] of Object.entries(candidate.users)) {
    if (userId.length === 0 || !isWeightUnit(unit)) {
      throw new Error('Legacy weight migration map contains an invalid user/unit assignment.');
    }
  }

  return candidate as LegacyWeightUnitMap;
};

export const readLegacyWeightUnitMap = (mapPath: string) => {
  const raw = readFileSync(mapPath, 'utf8');
  return {
    map: parseLegacyWeightUnitMap(JSON.parse(raw) as unknown),
    sha256: createHash('sha256').update(raw).digest('hex'),
  };
};

const assertMapMatchesInventory = (
  inventory: LegacyWeightInventory[],
  migrationMap: LegacyWeightUnitMap,
) => {
  const affectedUserIds = new Set(inventory.map((row) => row.userId));
  const mappedUserIds = Object.keys(migrationMap.users);
  const missingUserIds = [...affectedUserIds].filter((userId) => !(userId in migrationMap.users));
  const extraUserIds = mappedUserIds.filter((userId) => !affectedUserIds.has(userId));

  if (missingUserIds.length > 0 || extraUserIds.length > 0) {
    throw new Error(
      `Legacy weight migration map is ambiguous: ${missingUserIds.length} missing and ${extraUserIds.length} unexpected user assignments.`,
    );
  }

  for (const row of inventory) {
    const unit = migrationMap.users[row.userId];
    if (!unit) {
      throw new Error('Legacy weight migration map is missing an affected user.');
    }

    const minimumWeightKg = convertWeightToKg(row.minimumWeight, unit);
    const maximumWeightKg = convertWeightToKg(row.maximumWeight, unit);
    if (!isCanonicalBodyWeight(minimumWeightKg) || !isCanonicalBodyWeight(maximumWeightKg)) {
      throw new Error('Legacy weight migration map produces a weight outside 25-350 kg.');
    }
  }
};

const assertCanonicalTableIntegrity = (sqlite: Database.Database) => {
  const invalidRow = sqlite
    .prepare(
      `
        SELECT id
        FROM body_weight
        WHERE
          weight_kg IS NULL
          OR unit_at_entry NOT IN ('lbs', 'kg')
          OR weight_kg < 25
          OR weight_kg > 350
          OR abs(weight - (weight_kg / 0.45359237)) >= 0.000001
        LIMIT 1
      `,
    )
    .get();

  if (invalidRow !== undefined) {
    throw new Error('Canonical body-weight integrity check failed.');
  }
};

export const prepareCanonicalWeightMigration = (
  sqlite: Database.Database,
  options: { map?: LegacyWeightUnitMap; mapSha256?: string | null } = {},
): CanonicalWeightMigrationPreflight => {
  resetTemporaryMigrationMap(sqlite);

  if (!tableExists(sqlite, 'body_weight')) {
    return {
      affectedUsers: 0,
      legacyRows: 0,
      mapSha256: null,
      state: 'fresh-database',
    };
  }

  const columns = getBodyWeightColumnNames(sqlite);
  const hasWeightKg = columns.has('weight_kg');
  const hasUnitAtEntry = columns.has('unit_at_entry');

  if (hasWeightKg !== hasUnitAtEntry) {
    throw new Error('Body-weight schema is partially canonicalized; refusing migration.');
  }

  if (hasWeightKg) {
    assertCanonicalTableIntegrity(sqlite);
    return {
      affectedUsers: 0,
      legacyRows: 0,
      mapSha256: null,
      state: 'already-canonical',
    };
  }

  const inventory = inventoryLegacyBodyWeight(sqlite);
  const legacyRows = inventory.reduce((total, row) => total + row.rowCount, 0);
  if (inventory.length === 0) {
    return {
      affectedUsers: 0,
      legacyRows: 0,
      mapSha256: null,
      state: 'legacy-empty',
    };
  }

  if (!options.map) {
    throw new Error(
      `Legacy body-weight migration requires an explicit reviewed per-user map for ${inventory.length} affected users.`,
    );
  }

  assertMapMatchesInventory(inventory, options.map);
  const insertMap = sqlite.prepare(
    `INSERT INTO temp.body_weight_legacy_unit_map (user_id, unit) VALUES (?, ?)`,
  );
  const populateMap = sqlite.transaction(() => {
    for (const row of inventory) {
      insertMap.run(row.userId, options.map?.users[row.userId]);
    }
  });
  populateMap.immediate();

  return {
    affectedUsers: inventory.length,
    legacyRows,
    mapSha256: options.mapSha256 ?? null,
    state: 'legacy-mapped',
  };
};

export const prepareCanonicalWeightMigrationFromEnvironment = (
  sqlite: Database.Database,
  environment: NodeJS.ProcessEnv = process.env,
): CanonicalWeightMigrationPreflight => {
  if (!tableExists(sqlite, 'body_weight')) {
    return prepareCanonicalWeightMigration(sqlite);
  }

  const columns = getBodyWeightColumnNames(sqlite);
  if (columns.has('weight_kg') && columns.has('unit_at_entry')) {
    return prepareCanonicalWeightMigration(sqlite);
  }

  const inventory = inventoryLegacyBodyWeight(sqlite);
  if (inventory.length === 0) {
    return prepareCanonicalWeightMigration(sqlite);
  }

  const mapPath = environment[LEGACY_WEIGHT_UNIT_MAP_ENV];
  if (!mapPath) {
    throw new Error(`${LEGACY_WEIGHT_UNIT_MAP_ENV} is required for legacy body-weight migration.`);
  }

  const { map, sha256 } = readLegacyWeightUnitMap(mapPath);
  return prepareCanonicalWeightMigration(sqlite, { map, mapSha256: sha256 });
};
