import { fileURLToPath } from 'node:url';

import { sqlite } from '../db/index.js';
import { assertDatabaseIntegrity } from '../db/integrity.js';
import { migratePulseDatabase } from '../db/migrate.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

assertDatabaseIntegrity(sqlite, 'migration preflight');
const result = migratePulseDatabase(sqlite, { migrationsFolder });
assertDatabaseIntegrity(sqlite, 'migration postflight');
console.log(JSON.stringify(result));
sqlite.close();
