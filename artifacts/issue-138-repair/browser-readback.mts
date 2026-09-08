import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveGate0Config, validateGate0Database } from '../../scripts/dev-gate0-isolated.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const config = resolveGate0Config(root);
validateGate0Database(root, config.databasePath);
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const Database = require('better-sqlite3');
const sqlite = new Database(config.databasePath);
sqlite.pragma('foreign_keys = ON');
const receipt: Record<string, unknown> = { requests: [] };
const calls = receipt.requests as unknown[];
const api = async (path: string, payload?: unknown, owner = 'receipt-owner') => {
  const response = await fetch(`http://127.0.0.1:${config.apiPort}${path}`, {
    method: payload ? 'POST' : 'GET',
    headers: { authorization: `AgentToken fictional-${owner}`, 'content-type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.json();
  calls.push({ path, method: payload ? 'POST' : 'GET', owner, status: response.status, body });
  return { status: response.status, body };
};
const snapshot = () => Object.fromEntries(['foods', 'nutrition_logs', 'meals', 'meal_items'].map((table) => [table, sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
try {
  const preflight = JSON.parse(readFileSync(new URL('./browser-preflight.json', import.meta.url), 'utf8'));
  const beforeContext = snapshot();
  const path = '/api/v1/nutrition/logging-context?date=2026-09-07&q=Receipt%20staple';
  const context = (await api(path)).body.data;
  assert.deepEqual(context, (await api(path)).body.data);
  assert.deepEqual(snapshot(), beforeContext);
  assert.equal(context.promotionCandidates[0].stability, 'review_only');
  assert.equal(context.promotionCandidates[0].occurrenceCount, 2);
  assert.equal(context.promotionCandidates[0].distinctDayCount, 2);
  assert.equal(context.promotionCandidates[0].snapshots.length, 2);
  const properties = (await api('/api/docs/json')).body.paths['/api/v1/nutrition/logging-context'].get.responses['200'].content['application/json'].schema.properties.data.properties;
  const keys = ['aliasVersion','ambiguity','evidence','food','matchedVariant','reason'];
  for (const match of [properties.savedFoodMatches.items, properties.frequentFoods.items, properties.promotionCandidates.items.properties.likelySavedFoodMatch]) assert.deepEqual(Object.keys(match.properties).sort(), keys);
  assert.ok(properties.shorthandExpansions.items.properties.score);
  receipt.openapi = { rankedKeys: keys, shorthandScoreRetained: true };
  const input = { date: '2026-09-07', name: 'Fictional current lunch', returnSummary: true, items: [{ foodName: 'Receipt staple', quantity: 2, unit: 'serving', servingSize: 'one serving', servingGrams: 40, calories: 100, protein: 5, carbs: 10, fat: 4, fiber: 2, sugar: 3, brand: 'Fixture Co', source: 'Fictional label', notes: 'Fictional verified label', verified: true, tags: ['receipt'] }] };
  const created = await api('/api/v1/meals', input);
  assert.equal(created.status, 201);
  assert.equal(created.body.agent.itemOutcomes[0].outcome, 'created');
  const foodId = created.body.data.items[0].foodId;
  const reused = await api('/api/v1/meals', input);
  assert.equal(reused.status, 201);
  assert.equal(reused.body.agent.itemOutcomes[0].outcome, 'reused');
  assert.equal(reused.body.data.items[0].foodId, foodId);
  for (const response of [created, reused]) {
    const item = response.body.data.items[0];
    assert.deepEqual([item.calories,item.protein,item.carbs,item.fat,item.fiber,item.sugar], [200,10,20,8,4,6]);
    assert.ok(!JSON.stringify(response.body.agent).includes('nutrition/2026-09-07/summary'));
  }
  const definition = sqlite.prepare('SELECT * FROM foods WHERE id=?').get(foodId);
  assert.deepEqual([definition.brand,definition.source,definition.notes,definition.serving_grams,definition.verified,definition.tags], ['Fixture Co','Fictional label','Fictional verified label',40,1,'["receipt"]']);
  assert.deepEqual([definition.fiber,definition.sugar,definition.usage_count], [2,3,2]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM foods WHERE user_id='receipt-owner' AND name='Receipt staple'").get().count, 1);
  const links = sqlite.prepare('SELECT * FROM meal_items WHERE food_id=? ORDER BY created_at').all(foodId);
  assert.equal(links.length, 2);
  assert.equal(definition.last_used_at, Math.max(...links.map((item) => item.created_at)));
  const after = (await api(path)).body.data;
  assert.deepEqual(after.savedFoodMatches.map((match) => match.reason), ['exact_normalized','brand_or_tag']);
  for (const match of [...after.savedFoodMatches,...after.frequentFoods,...after.promotionCandidates.map((candidate) => candidate.likelySavedFoodMatch)]) assert.deepEqual(Object.keys(match).sort(), keys);
  assert.equal(after.promotionCandidates[0].reason, 'EXACT_SAVED_MATCH');
  assert.equal(after.promotionCandidates[0].stability, 'review_only');
  const foreign = await api(path, undefined, 'receipt-foreign');
  assert.equal(foreign.status, 200);
  assert.deepEqual(foreign.body.data.savedFoodMatches, []);
  assert.deepEqual(foreign.body.data.promotionCandidates, []);
  const beforeForbidden = snapshot();
  const forbidden = await api('/api/v1/meals', { ...input, items: [{ foodId, name: 'Foreign attempt', amount: 1 }] }, 'receipt-foreign');
  assert.equal(forbidden.status, 422);
  assert.deepEqual(snapshot(), beforeForbidden);
  const history = sqlite.prepare("SELECT * FROM meal_items WHERE id IN ('item-earlier','item-later') ORDER BY id").all();
  assert.deepEqual(history, preflight.historyBefore);
  const beforeFailure = snapshot();
  sqlite.exec("CREATE TRIGGER reject_browser_usage BEFORE UPDATE OF usage_count ON foods BEGIN SELECT RAISE(ABORT, 'fictional receipt failure'); END");
  try {
    const failed = await api('/api/v1/meals', { ...input, items: [{ ...input.items[0], foodName: 'Must roll back' }] });
    assert.equal(failed.status, 500);
    assert.ok(!failed.body.agent);
    assert.deepEqual(snapshot(), beforeFailure);
    receipt.rollback = { forcedFailureStatus: failed.status, unchanged: true, noNewDefinitionOrMealOrItem: true };
  } finally { sqlite.exec('DROP TRIGGER reject_browser_usage'); }
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  receipt.readback = { definition, links, historicalSnapshotsUnchanged: history, reviewOnly: after.promotionCandidates, stableOrder: after.savedFoodMatches.map((match) => ({ id: match.food.id, reason: match.reason, ambiguity: match.ambiguity })), ownerIsolation: true };
  receipt.result = 'PASS';
  console.log('PASS: real HTTP/API/OpenAPI, current create/reuse, categorical ordering, owner isolation, provenance/macros, SQLite usage and unchanged history, induced rollback.');
} catch (error) {
  receipt.result = 'FAIL'; receipt.error = String(error); throw error;
} finally {
  sqlite.close();
  writeFileSync(new URL('./browser-api-sqlite.json', import.meta.url), JSON.stringify(receipt, null, 2)+'\n');
}
