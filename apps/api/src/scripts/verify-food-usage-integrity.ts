/** Isolated acceptance readback. Never accepts an existing database or external server. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const fixtureDir = mkdtempSync(join(tmpdir(), 'pulse-food-integrity-acceptance-'));
process.env.DATABASE_URL = join(fixtureDir, 'fictional.db');
process.env.JWT_SECRET = 'isolated-fictional-fixture-signing-key';
process.env.NODE_ENV = 'test';
const [{ db, sqlite }, { buildServer }, schema] = await Promise.all([
  import('../db/index.js'),
  import('../index.js'),
  import('../db/schema/index.js'),
]);
migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
db.insert(schema.users)
  .values({
    id: 'fixture-owner',
    username: 'fictional-integrity-owner',
    passwordHash: 'unused-fixture',
  })
  .run();
const foodId = '11111111-1111-4111-8111-111111111111';
db.insert(schema.foods)
  .values({
    id: foodId,
    userId: 'fixture-owner',
    name: 'Fictional oats',
    calories: 100,
    protein: 10,
    carbs: 10,
    fat: 5,
  })
  .run();
const app = buildServer();
let report: object = {};
app.get('/integrity-readback', async (_request, reply) =>
  reply
    .type('text/html')
    .send(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Food usage integrity — isolated acceptance</title><style>body{font:18px system-ui;max-width:960px;margin:40px auto;background:#102027;color:#edf6f5}h1{color:#8ee6bd}pre{white-space:pre-wrap;background:#18363d;padding:24px;border-radius:12px}</style><h1>Food usage integrity: PASS</h1><p>Disposable fictional SQLite fixture. No production connection.</p><pre>${JSON.stringify(report, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></html>`,
    ),
);
await app.ready();
const headers = {
  authorization: `Bearer ${app.jwt.sign({ sub: 'fixture-owner', type: 'session', iss: 'pulse-api' }, { expiresIn: '1h' })}`,
};
const item = {
  foodId,
  name: 'Fictional oats',
  amount: 1,
  unit: 'serving',
  calories: 100,
  protein: 10,
  carbs: 10,
  fat: 5,
};
const receipts: object[] = [];
for (const url of ['/api/v1/meals', '/api/v1/nutrition/2026-03-20/meals']) {
  const response = await app.inject({
    method: 'POST',
    url,
    headers,
    payload: {
      ...(url === '/api/v1/meals' ? { date: '2026-03-20' } : {}),
      name: 'Fictional meal',
      items: [item, item],
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  receipts.push({
    method: 'POST',
    url,
    status: response.statusCode,
    linkedItems: response.json().data.items.length,
  });
}
const trashed = await app.inject({ method: 'DELETE', url: `/api/v1/foods/${foodId}`, headers });
assert.equal(trashed.statusCode, 200, trashed.body);
const before = sqlite.serialize();
const preview = await app.inject({
  method: 'POST',
  url: '/api/v1/admin/reconcile-food-usage',
  headers,
});
assert.equal(preview.statusCode, 200, preview.body);
assert.deepEqual(sqlite.serialize(), before);
assert.equal(preview.json().data.rows[0].projected.usageCount, 4);
const invariantSql = `SELECT f.id,f.deleted_at,f.usage_count,f.last_used_at,
 (SELECT COUNT(*) FROM meal_items i JOIN meals m ON m.id=i.meal_id JOIN nutrition_logs n ON n.id=m.nutrition_log_id WHERE i.food_id=f.id AND n.user_id=f.user_id) expected_count,
 (SELECT MAX(i.created_at) FROM meal_items i JOIN meals m ON m.id=i.meal_id JOIN nutrition_logs n ON n.id=m.nutrition_log_id WHERE i.food_id=f.id AND n.user_id=f.user_id) expected_time
 FROM foods f WHERE f.user_id='fixture-owner' ORDER BY f.id`;
const invariantRows = sqlite.prepare(invariantSql).all() as {
  usage_count: number;
  last_used_at: number | null;
  expected_count: number;
  expected_time: number | null;
}[];
for (const row of invariantRows) {
  assert.equal(row.usage_count, row.expected_count);
  assert.equal(row.last_used_at, row.expected_time);
}
const quickCheck = sqlite.pragma('quick_check');
const foreignKeyCheck = sqlite.pragma('foreign_key_check');
assert.deepEqual(quickCheck, [{ quick_check: 'ok' }]);
assert.deepEqual(foreignKeyCheck, []);
report = {
  result: 'PASS',
  fixture: 'temporary fictional SQLite',
  receipts,
  trashStatus: trashed.statusCode,
  dryRun: preview.json().data,
  dryRunDatabaseSha256: createHash('sha256').update(before).digest('hex'),
  dryRunByteIdentical: true,
  invariantSql,
  invariantRows,
  quickCheck,
  foreignKeyCheck,
};
writeFileSync(join(fixtureDir, 'readback.json'), JSON.stringify(report, null, 2) + '\n');
const address = await app.listen({ host: '127.0.0.1', port: 0 });
console.log(
  JSON.stringify(
    {
      address: `${address}/integrity-readback`,
      reportPath: join(fixtureDir, 'readback.json'),
      report,
    },
    null,
    2,
  ),
);
const close = async () => {
  await app.close();
  sqlite.close();
  rmSync(fixtureDir, { recursive: true, force: true });
  process.exit(0);
};
process.once('SIGINT', () => {
  void close();
});
process.once('SIGTERM', () => {
  void close();
});
