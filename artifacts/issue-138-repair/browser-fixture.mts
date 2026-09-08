// Fictional browser receipt only. Refuses to replace an existing Gate 0 database.
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveGate0Config, validateGate0Database, createGate0Environment } from '../../scripts/dev-gate0-isolated.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const config = resolveGate0Config(root);
if (existsSync(config.databasePath)) throw new Error('Refusing to overwrite an existing Gate 0 fixture');
const env = createGate0Environment({}, config);
Object.assign(process.env, env, { NODE_ENV: 'test', JWT_SECRET: 'fictional-browser-only', API_URL: `http://127.0.0.1:${config.apiPort}` });
const { db, sqlite } = await import('../../apps/api/src/db/index.ts');
validateGate0Database(root, config.databasePath);
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
migrate(db, { migrationsFolder: resolve(root, 'apps/api/drizzle') });
const { users, agentTokens, nutritionLogs, meals, mealItems, foods } = await import('../../apps/api/src/db/schema/index.ts');
const macros = { calories: 100, protein: 5, carbs: 10, fat: 4 };
for (const id of ['receipt-owner', 'receipt-foreign']) {
  db.insert(users).values({ id, username: id, passwordHash: 'fictional-only', preferences: { timeZone: 'America/Detroit' } }).run();
  db.insert(agentTokens).values({ id: `token-${id}`, userId: id, name: 'fixture', tokenHash: createHash('sha256').update(`fictional-${id}`).digest('hex') }).run();
}
for (const [id, date, calories, amount] of [['earlier', '2026-09-01', 100, 1], ['later', '2026-09-06', 150, 2]] as const) {
  db.insert(nutritionLogs).values({ id: `log-${id}`, userId: 'receipt-owner', date, notes: 'Historical note: preserve exactly' }).run();
  db.insert(meals).values({ id: `meal-${id}`, nutritionLogId: `log-${id}`, name: 'Travel bowl' }).run();
  db.insert(mealItems).values({ id: `item-${id}`, mealId: `meal-${id}`, name: 'Receipt staple', amount, unit: 'serving', ...macros, calories, fiber: 2, sugar: 3 }).run();
}
db.insert(foods).values({ id: 'secondary', userId: 'receipt-owner', name: 'Secondary choice', tags: ['receipt staple'], servingSize: 'serving', ...macros }).run();
db.insert(foods).values({ id: 'foreign-secret', userId: 'receipt-foreign', name: 'Foreign private staple', servingSize: 'serving', ...macros, calories: 999 }).run();
const historyBefore = sqlite.prepare("SELECT * FROM meal_items WHERE id IN ('item-earlier','item-later') ORDER BY id").all();
writeFileSync(new URL('./browser-preflight.json', import.meta.url), JSON.stringify({
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(),
  status: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }),
  database: config.databasePath, url: `http://127.0.0.1:${config.apiPort}/api/docs`, historyBefore,
}, null, 2)+'\n');
const app = (await import('../../apps/api/src/index.ts')).buildServer();
await app.listen({ host: '127.0.0.1', port: config.apiPort });
console.log(`Fictional Gate 0 API ready on http://127.0.0.1:${config.apiPort}/api/docs`);
let closed = false;
const close = async () => {
  if (closed) return;
  closed = true;
  await app.close(); sqlite.close();
  for (const suffix of ['', '-wal', '-shm']) rmSync(config.databasePath+suffix, { force: true });
  console.log('Fictional Gate 0 server stopped; created database/WAL/SHM removed.');
};
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
