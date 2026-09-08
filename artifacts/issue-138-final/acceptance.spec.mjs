import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { setAuthenticatedSession } from '../../apps/web/e2e/auth-session.ts';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const Database = require('better-sqlite3');
const keys = ['aliasVersion', 'ambiguity', 'evidence', 'food', 'matchedVariant', 'reason'];

test('ranked reuse: real browser, API, OpenAPI, isolated SQLite and rollback', async ({
  page,
  request,
}, testInfo) => {
  const ownership = JSON.parse(
    readFileSync(new URL('./browser-ownership.json', import.meta.url), 'utf8'),
  );
  assert.equal(process.env.E2E_DATABASE_URL, ownership.database);
  const sqlite = new Database(ownership.database, { fileMustExist: true });
  sqlite.pragma('foreign_keys = ON');
  const receipt = {
    runId: ownership.runId,
    head: ownership.head,
    requests: [],
    console: [],
    network: [],
    pageErrors: [],
    failedRequests: [],
  };
  const save = (name, data) =>
    writeFileSync(new URL(name, import.meta.url), JSON.stringify(data, null, 2) + '\n');
  page.on('console', (message) =>
    receipt.console.push({ type: message.type(), text: message.text() }),
  );
  page.on('pageerror', (error) => receipt.pageErrors.push(error.message));
  page.on('requestfailed', (req) =>
    receipt.failedRequests.push({ method: req.method(), url: req.url(), failure: req.failure() }),
  );
  page.on('response', (response) => {
    if (response.url().includes('/api/'))
      receipt.network.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
      });
  });
  const snapshot = () =>
    Object.fromEntries(
      ['foods', 'nutrition_logs', 'meals', 'meal_items'].map((table) => [
        table,
        sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
      ]),
    );
  const owners = {};
  try {
    assert.equal(
      sqlite.prepare('SELECT count(*) AS n FROM users').get().n,
      0,
      'fresh synthetic DB',
    );
    for (const label of ['owner', 'foreign']) {
      const registration = await request.post('/api/v1/auth/register', {
        data: {
          username: `pulse160-${label}`,
          password: 'fictional-receipt-only',
          name: `Fictional ${label}`,
          timeZone: 'America/Detroit',
        },
      });
      assert.equal(registration.status(), 201, await registration.text());
      const session = (await registration.json()).data;
      const createdToken = await request.post('/api/v1/agent-tokens', {
        data: { name: 'Fictional acceptance' },
        headers: { authorization: `Bearer ${session.token}` },
      });
      assert.equal(createdToken.status(), 201, await createdToken.text());
      owners[label] = {
        id: session.user.id,
        jwt: session.token,
        agent: (await createdToken.json()).data.token,
      };
    }
    const macros = [100, 5, 10, 4];
    sqlite.transaction(() => {
      for (const [id, date, calories, amount] of [
        ['earlier', '2026-09-01', 100, 1],
        ['later', '2026-09-06', 150, 2],
      ]) {
        sqlite
          .prepare('INSERT INTO nutrition_logs(id,user_id,date,notes) VALUES (?,?,?,?)')
          .run(`log-${id}`, owners.owner.id, date, 'Historical note: preserve exactly');
        sqlite
          .prepare('INSERT INTO meals(id,nutrition_log_id,name) VALUES (?,?,?)')
          .run(`meal-${id}`, `log-${id}`, 'Travel bowl');
        sqlite
          .prepare(
            'INSERT INTO meal_items(id,meal_id,name,amount,unit,calories,protein,carbs,fat,fiber,sugar) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            `item-${id}`,
            `meal-${id}`,
            'Receipt staple',
            amount,
            'serving',
            calories,
            5,
            10,
            4,
            2,
            3,
          );
      }
      sqlite
        .prepare(
          'INSERT INTO foods(id,user_id,name,serving_size,calories,protein,carbs,fat,tags) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .run(
          'secondary',
          owners.owner.id,
          'Secondary choice',
          'serving',
          ...macros,
          '["receipt staple"]',
        );
      sqlite
        .prepare(
          'INSERT INTO foods(id,user_id,name,serving_size,calories,protein,carbs,fat) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(
          'foreign-secret',
          owners.foreign.id,
          'Foreign private staple',
          'serving',
          999,
          5,
          10,
          4,
        );
    })();
    const historyBefore = snapshot();
    receipt.historyBefore = historyBefore;
    await setAuthenticatedSession(page, owners.owner.jwt);
    const api = async (
      path,
      payload,
      owner = 'owner',
      browser = true,
      method = payload ? 'POST' : 'GET',
      auth = 'agent',
    ) => {
      const authorization =
        auth === 'jwt' ? `Bearer ${owners[owner].jwt}` : `AgentToken ${owners[owner].agent}`;
      let response;
      if (browser) {
        response = await page.evaluate(
          async ({ path, payload, authorization, method }) => {
            const result = await fetch(path, {
              method,
              headers: { authorization, 'content-type': 'application/json' },
              ...(payload ? { body: JSON.stringify(payload) } : {}),
            });
            return { status: result.status, body: await result.json() };
          },
          { path, payload, authorization, method },
        );
      } else {
        const result = await request.fetch(path, {
          method,
          headers: { authorization },
          ...(payload ? { data: payload } : {}),
        });
        response = { status: result.status(), body: await result.json() };
      }
      receipt.requests.push({
        path,
        method,
        owner,
        auth,
        transport: browser
          ? 'browser fetch through Vite proxy'
          : 'Playwright API through Vite proxy',
        payload,
        ...response,
      });
      return response;
    };
    const contextPath = '/api/v1/nutrition/logging-context?date=2026-09-07&q=Receipt%20staple';
    const beforeContext = snapshot();
    const context = (await api(contextPath)).body.data;
    assert.deepEqual(context, (await api(contextPath)).body.data);
    assert.deepEqual(
      context,
      (await api(contextPath, undefined, 'owner', true, 'GET', 'jwt')).body.data,
    );
    assert.deepEqual(
      snapshot(),
      beforeContext,
      'read-only context leaves all domain rows unchanged',
    );
    assert.equal(context.promotionCandidates[0].stability, 'review_only');
    assert.equal(context.promotionCandidates[0].occurrenceCount, 2);
    assert.equal(context.promotionCandidates[0].distinctDayCount, 2);
    assert.equal(context.promotionCandidates[0].snapshots.length, 2);
    const openapi = (await api('/api/docs/json')).body;
    save('./browser-openapi.json', openapi);
    const properties =
      openapi.paths['/api/v1/nutrition/logging-context'].get.responses['200'].content[
        'application/json'
      ].schema.properties.data.properties;
    for (const match of [
      properties.savedFoodMatches.items,
      properties.frequentFoods.items,
      properties.promotionCandidates.items.properties.likelySavedFoodMatch,
    ])
      assert.deepEqual(Object.keys(match.properties).sort(), keys);
    assert.ok(properties.shorthandExpansions.items.properties.score);
    receipt.openapi = { rankedKeys: keys, shorthandScoreRetained: true };
    const input = {
      date: '2026-09-07',
      name: 'Fictional current lunch',
      returnSummary: true,
      items: [
        {
          foodName: 'Receipt staple',
          quantity: 2,
          unit: 'serving',
          servingSize: 'one serving',
          servingGrams: 40,
          calories: 100,
          protein: 5,
          carbs: 10,
          fat: 4,
          fiber: 2,
          sugar: 3,
          brand: 'Fixture Co',
          source: 'Fictional label',
          notes: 'Fictional verified label',
          verified: true,
          tags: ['receipt'],
        },
      ],
    };
    const created = await api('/api/v1/meals', input);
    assert.equal(created.status, 201, JSON.stringify(created));
    assert.equal(created.body.agent.itemOutcomes[0].outcome, 'created');
    const foodId = created.body.data.items[0].foodId;
    const reused = await api('/api/v1/meals', input);
    assert.equal(reused.status, 201);
    assert.equal(reused.body.agent.itemOutcomes[0].outcome, 'reused');
    assert.equal(reused.body.data.items[0].foodId, foodId);
    for (const response of [created, reused]) {
      const item = response.body.data.items[0];
      assert.deepEqual(
        [item.calories, item.protein, item.carbs, item.fat, item.fiber, item.sugar],
        [200, 10, 20, 8, 4, 6],
      );
      assert.ok(response.body.data.summary, 'returnSummary embeds the summary');
      assert.doesNotMatch(
        [...response.body.agent.hints, ...response.body.agent.suggestedActions].join(' '),
        /summary/i,
      );
    }
    const definition = sqlite.prepare('SELECT * FROM foods WHERE id=?').get(foodId);
    assert.deepEqual(
      [
        definition.brand,
        definition.source,
        definition.notes,
        definition.serving_grams,
        definition.verified,
        definition.tags,
      ],
      ['Fixture Co', 'Fictional label', 'Fictional verified label', 40, 1, '["receipt"]'],
    );
    assert.deepEqual([definition.fiber, definition.sugar, definition.usage_count], [2, 3, 2]);
    assert.equal(
      sqlite
        .prepare('SELECT COUNT(*) AS count FROM foods WHERE user_id=? AND name=?')
        .get(owners.owner.id, 'Receipt staple').count,
      1,
    );
    const links = sqlite
      .prepare('SELECT * FROM meal_items WHERE food_id=? ORDER BY created_at')
      .all(foodId);
    assert.equal(links.length, 2);
    assert.equal(definition.last_used_at, Math.max(...links.map((item) => item.created_at)));
    const after = (await api(contextPath)).body.data;
    assert.deepEqual(
      after.savedFoodMatches.map((match) => match.reason),
      ['exact_normalized', 'brand_or_tag'],
    );
    for (const match of [
      ...after.savedFoodMatches,
      ...after.frequentFoods,
      ...after.promotionCandidates.map((candidate) => candidate.likelySavedFoodMatch),
    ])
      assert.deepEqual(Object.keys(match).sort(), keys);
    assert.equal(after.promotionCandidates[0].reason, 'EXACT_SAVED_MATCH');
    assert.equal(after.promotionCandidates[0].stability, 'review_only');
    const foreign = await api(contextPath, undefined, 'foreign');
    assert.equal(foreign.status, 200);
    assert.deepEqual(foreign.body.data.savedFoodMatches, []);
    assert.deepEqual(foreign.body.data.promotionCandidates, []);
    const beforeForbidden = snapshot();
    const forbidden = await api(
      '/api/v1/meals',
      { ...input, items: [{ foodId, name: 'Foreign attempt', amount: 1 }] },
      'foreign',
      false,
    );
    assert.equal(forbidden.status, 422);
    assert.deepEqual(snapshot(), beforeForbidden);
    const currentItemsBeforeDefinitionEdit = snapshot().meal_items;
    const edited = await api(
      `/api/v1/foods/${foodId}`,
      { calories: 777 },
      'owner',
      true,
      'PATCH',
      'jwt',
    );
    assert.equal(edited.status, 200);
    assert.deepEqual(
      snapshot().meal_items,
      currentItemsBeforeDefinitionEdit,
      'definition changes preserve all meal snapshots',
    );
    assert.deepEqual(
      sqlite
        .prepare("SELECT * FROM meal_items WHERE id IN ('item-earlier','item-later') ORDER BY id")
        .all(),
      historyBefore.meal_items,
    );
    assert.deepEqual(
      sqlite
        .prepare("SELECT * FROM nutrition_logs WHERE id IN ('log-earlier','log-later') ORDER BY id")
        .all(),
      historyBefore.nutrition_logs,
      'historical notes/log rows preserved',
    );
    const beforeFailure = snapshot();
    sqlite.exec(
      "CREATE TRIGGER reject_browser_usage BEFORE UPDATE OF usage_count ON foods BEGIN SELECT RAISE(ABORT, 'fictional receipt failure'); END",
    );
    try {
      const failed = await api(
        '/api/v1/meals',
        { ...input, items: [{ ...input.items[0], foodName: 'Must roll back' }] },
        'owner',
        false,
      );
      assert.equal(failed.status, 500);
      assert.ok(!failed.body.agent);
      assert.deepEqual(snapshot(), beforeFailure);
      receipt.rollback = {
        forcedFailureStatus: failed.status,
        unchanged: true,
        noNewDefinitionOrMealOrItem: true,
      };
    } finally {
      sqlite.exec('DROP TRIGGER reject_browser_usage');
    }
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(sqlite.pragma('quick_check', { simple: true }), 'ok');
    receipt.readback = {
      definitionBeforeEdit: definition,
      links,
      reviewOnly: after.promotionCandidates,
      stableOrder: after.savedFoodMatches.map((match) => ({
        id: match.food.id,
        reason: match.reason,
        ambiguity: match.ambiguity,
      })),
      ownerIsolation: true,
      unchangedHistory: true,
      finalSnapshot: snapshot(),
    };
    await page.goto('/nutrition?view=log&date=2026-09-07');
    await expect(page.getByRole('heading', { level: 1, name: 'Nutrition' })).toBeVisible();
    await expect(page.getByText('Fictional current lunch', { exact: true })).toHaveCount(2);
    await expect(page.getByText('Receipt staple', { exact: true })).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath('nutrition-receipt.png'), fullPage: true });
    assert.deepEqual(receipt.pageErrors, []);
    assert.deepEqual(receipt.failedRequests, []);
    assert.deepEqual(
      receipt.console.filter((entry) => ['warning', 'error'].includes(entry.type)),
      [],
    );
    assert.deepEqual(
      receipt.network.filter((entry) => entry.status >= 400),
      [],
    );
    receipt.result = 'PASS';
  } catch (error) {
    receipt.result = 'FAIL';
    receipt.error = String(error);
    throw error;
  } finally {
    sqlite.close();
    save('./browser-api-sqlite.json', receipt);
  }
});
