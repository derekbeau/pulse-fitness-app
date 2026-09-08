import { fork, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../db/schema/index.js';

type Message = {
  kind: string;
  id?: string;
  pid?: number;
  apiReady?: boolean;
  elapsedMs?: number;
  sinceForkMs?: number;
  code?: string;
  attempt?: number;
  attempts?: number;
  status?: number;
  busyTimeout?: number;
  body?: {
    data: { items: Array<{ id: string; foodId: string }>; savedFoodMatches?: unknown[] };
    agent?: { itemOutcomes: Array<{ outcome: string }> };
  };
};
class Worker {
  child: ChildProcess;
  messages: Message[] = [];
  stderr = '';
  exited = false;
  listeners = new Set<() => void>();
  constructor(databasePath: string) {
    const forkStarted = performance.now();
    this.child = fork(
      fileURLToPath(new URL('./__tests__/food-reuse-worker.ts', import.meta.url)),
      [],
      {
        execArgv: ['--import', import.meta.resolve('tsx')],
        // No inherited credentials or env files. Each child opens this one fictional DB.
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'test',
          DATABASE_URL: databasePath,
          JWT_SECRET: 'fictional-process-secret',
        },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      },
    );
    this.child.stderr?.on('data', (chunk) => {
      this.stderr += String(chunk);
    });
    this.child.on('message', (message: Message) => {
      this.messages.push({ ...message, sinceForkMs: performance.now() - forkStarted });
      for (const listener of this.listeners) listener();
    });
    this.child.on('error', (error) => {
      this.messages.push({ kind: 'fatal' });
      this.stderr += String(error);
      for (const listener of this.listeners) listener();
    });
    this.child.on('exit', (code, signal) => {
      this.exited = true;
      this.messages.push({ kind: 'fatal' });
      this.stderr += `Child exited: code=${code} signal=${signal}`;
      for (const listener of this.listeners) listener();
    });
  }
  send(command: object) {
    this.child.send(command);
  }
  wait(kind: string, id?: string): Promise<Message> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(
          new Error(
            `Worker ${this.child.pid} timeout waiting ${kind}/${id}: ${JSON.stringify(this.messages)} ${this.stderr}`,
          ),
        );
      }, 5000);
      const check = () => {
        const message = this.messages.find(
          (m) => m.kind === kind && (id === undefined || m.id === id),
        );
        if (message) {
          clearTimeout(timer);
          this.listeners.delete(check);
          resolve(message);
        } else if (this.exited || this.messages.some((m) => m.kind === 'fatal')) {
          clearTimeout(timer);
          this.listeners.delete(check);
          reject(new Error(`Worker failed: ${JSON.stringify(this.messages)} ${this.stderr}`));
        }
      };
      this.listeners.add(check);
      check();
    });
  }
  async close() {
    if (this.exited || !this.child.pid) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => this.child.kill('SIGKILL'), 1000);
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      if (this.child.connected) this.send({ kind: 'close' });
      else this.child.kill('SIGKILL');
    });
  }
}
const macros = { calories: 100, protein: 5, carbs: 10, fat: 4 };
let sqlite: Database.Database;
let directory: string;
const workers: Worker[] = [];
const snapshot = () =>
  Object.fromEntries(
    ['foods', 'nutrition_logs', 'meals', 'meal_items'].map((table) => [
      table,
      sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
    ]),
  );
const usage = () =>
  expect(
    sqlite
      .prepare(
        `SELECT f.id FROM foods f WHERE f.usage_count != (SELECT COUNT(*) FROM meal_items i JOIN meals m ON m.id=i.meal_id JOIN nutrition_logs n ON n.id=m.nutrition_log_id WHERE i.food_id=f.id AND n.user_id=f.user_id) OR f.last_used_at IS NOT (SELECT MAX(i.created_at) FROM meal_items i JOIN meals m ON m.id=i.meal_id JOIN nutrition_logs n ON n.id=m.nutrition_log_id WHERE i.food_id=f.id AND n.user_id=f.user_id)`,
      )
      .all(),
  ).toEqual([]);
let sequence = 0;
const request = (
  worker: Worker,
  url: string,
  payload?: Record<string, unknown>,
  owner = 'owner',
  barrier = false,
) => {
  const id = `request-${++sequence}`;
  worker.send({ kind: 'request', id, url, payload, owner, barrier });
  return id;
};
const payload = (name: string) => ({
  date: '2026-09-07',
  name: 'Fictional lunch',
  items: [{ foodName: name, quantity: 1, ...macros }],
});

describe('independent API processes serialize owner-local food creation', () => {
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pulse-food-process-'));
    const databasePath = join(directory, 'fictional.db');
    sqlite = new Database(databasePath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)) });
    for (const id of ['owner', 'foreign']) {
      db.insert(schema.users)
        .values({
          id,
          username: id,
          passwordHash: 'fictional',
          preferences: { timeZone: 'America/Detroit' },
        })
        .run();
      db.insert(schema.agentTokens)
        .values({
          id: `token-${id}`,
          userId: id,
          name: 'fixture',
          tokenHash: createHash('sha256').update(`fictional-${id}`).digest('hex'),
        })
        .run();
    }
    db.insert(schema.nutritionLogs)
      .values({ id: 'history-log', userId: 'owner', date: '2026-09-01' })
      .run();
    db.insert(schema.meals)
      .values({ id: 'target', nutritionLogId: 'history-log', name: 'Historical ad hoc' })
      .run();
    db.insert(schema.mealItems)
      .values({
        id: 'historical-item',
        mealId: 'target',
        name: 'Concurrent preferred',
        amount: 1,
        unit: 'serving',
        ...macros,
      })
      .run();
    workers.push(new Worker(databasePath), new Worker(databasePath));
    const online = await Promise.all(workers.map((worker) => worker.wait('online')));
    expect(new Set(online.map((message) => message.pid)).size).toBe(2);
    expect(online.every((message) => message.pid !== process.pid)).toBe(true);
    expect(online.every((message) => message.apiReady === true)).toBe(true);
    console.info(
      'Independent worker startup phases:',
      workers.map((worker) => worker.messages),
    );
  });
  afterAll(async () => {
    if (sqlite?.inTransaction) sqlite.exec('ROLLBACK');
    await Promise.all(workers.map((worker) => worker.close()));
    sqlite?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  it.each(['preferred', 'date', 'append'] as const)(
    'rechecks after actual busy contention on %s, replays safely and isolates owners',
    async (surface) => {
      const name = `Concurrent ${surface}`;
      const url =
        surface === 'preferred'
          ? '/api/v1/meals'
          : surface === 'date'
            ? '/api/v1/nutrition/2026-09-07/meals'
            : '/api/v1/meals/target/items';
      const historic = sqlite.prepare("SELECT * FROM meal_items WHERE id='historical-item'").get();
      const ids = workers.map((worker) => request(worker, url, payload(name), 'owner', true));
      // Both independent API instances have finished auth/normalization/planning, before writes.
      await Promise.all(workers.map((worker, index) => worker.wait('barrier', ids[index])));
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        workers.forEach((worker, index) => worker.send({ kind: 'release', id: ids[index] }));
        const busy = await Promise.all(
          workers.map((worker, index) => worker.wait('attemptError', ids[index])),
        );
        expect(busy.map((message) => message.code)).toEqual(['SQLITE_BUSY', 'SQLITE_BUSY']);
        expect(busy.map((message) => message.attempt)).toEqual([1, 1]);
      } finally {
        sqlite.exec('COMMIT');
      }
      const responses = await Promise.all(
        workers.map((worker, index) => worker.wait('response', ids[index])),
      );
      expect(responses.map((r) => r.status)).toEqual([
        surface === 'append' ? 200 : 201,
        surface === 'append' ? 200 : 201,
      ]);
      expect(responses.map((r) => r.body?.agent?.itemOutcomes.at(-1)?.outcome).sort()).toEqual([
        'created',
        'reused',
      ]);
      for (const response of responses) {
        expect(response.attempts).toBeGreaterThanOrEqual(2);
        expect(response.attempts).toBeLessThanOrEqual(4);
        expect(response.busyTimeout).toBe(5000);
      }
      const definitions = sqlite
        .prepare('SELECT * FROM foods WHERE name=? AND user_id=? AND deleted_at IS NULL')
        .all(name, 'owner') as Array<{ id: string; usage_count: number }>;
      expect(definitions).toHaveLength(1);
      const foodId = definitions[0].id;
      expect(definitions[0].usage_count).toBe(2);
      expect(responses.map((r) => r.body?.data.items.at(-1)?.foodId)).toEqual([foodId, foodId]);
      const replay = await workers[0].wait('response', request(workers[0], url, payload(name)));
      expect(replay.status).toBe(surface === 'append' ? 200 : 201);
      expect(replay.body?.agent?.itemOutcomes.at(-1)?.outcome).toBe('reused');
      expect(
        sqlite
          .prepare('SELECT COUNT(*) AS count FROM foods WHERE name=? AND user_id=?')
          .get(name, 'owner'),
      ).toEqual({ count: 1 });
      expect(
        sqlite.prepare('SELECT usage_count AS count FROM foods WHERE id=?').get(foodId),
      ).toEqual({ count: 3 });
      const beforeForeign = snapshot();
      const forbidden = await workers[1].wait(
        'response',
        request(
          workers[1],
          '/api/v1/meals',
          { ...payload(name), items: [{ foodId, name, amount: 1 }] },
          'foreign',
        ),
      );
      expect(forbidden.status).toBe(422);
      expect(snapshot()).toEqual(beforeForeign);
      const hidden = await workers[1].wait(
        'response',
        request(
          workers[1],
          `/api/v1/nutrition/logging-context?date=2026-09-07&q=${encodeURIComponent(name)}`,
          undefined,
          'foreign',
        ),
      );
      expect(hidden.status).toBe(200);
      expect(hidden.body?.data.savedFoodMatches).toEqual([]);
      if (surface === 'append') {
        const forbiddenAppend = await workers[1].wait(
          'response',
          request(workers[1], url, payload(name), 'foreign'),
        );
        expect(forbiddenAppend.status).toBe(404);
        expect(snapshot()).toEqual(beforeForeign);
      }
      const foreign = await workers[1].wait(
        'response',
        request(workers[1], '/api/v1/meals', payload(name), 'foreign'),
      );
      expect(foreign.status).toBe(201);
      expect(foreign.body?.agent?.itemOutcomes[0].outcome).toBe('created');
      expect(foreign.body?.data.items[0].foodId).not.toBe(foodId);
      expect(
        sqlite.prepare('SELECT usage_count AS count FROM foods WHERE id=?').get(foodId),
      ).toEqual({ count: 3 });
      expect(sqlite.prepare("SELECT * FROM meal_items WHERE id='historical-item'").get()).toEqual(
        historic,
      );
      usage();
    },
  );
  it('bounds exhausted locks at four attempts and rolls back without publishing outcomes', async () => {
    const before = snapshot();
    const id = request(workers[0], '/api/v1/meals', payload('Exhausted lock'), 'owner', true);
    await workers[0].wait('barrier', id);
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      workers[0].send({ kind: 'release', id });
      const response = await workers[0].wait('response', id);
      expect(response.status).toBe(500);
      expect(response.attempts).toBe(4);
      expect(response.busyTimeout).toBe(5000);
      expect(
        workers[0].messages
          .filter((m) => m.kind === 'attemptError' && m.id === id)
          .map((m) => m.code),
      ).toEqual(Array(4).fill('SQLITE_BUSY'));
      expect(response.body).not.toHaveProperty('agent.itemOutcomes');
    } finally {
      sqlite.exec('COMMIT');
    }
    expect(snapshot()).toEqual(before);
    usage();
  });
  it.each(['preferred', 'date', 'append'] as const)(
    'keeps legacy duplicates fail-closed and rolls back planned creation after usage failure on %s',
    async (surface) => {
      const db = drizzle(sqlite, { schema });
      const name = `Legacy ${surface}`;
      for (const suffix of ['a', 'b'])
        db.insert(schema.foods)
          .values({
            id: `${surface}-${suffix}`,
            userId: 'owner',
            name,
            servingSize: 'serving',
            ...macros,
          })
          .run();
      const url =
        surface === 'preferred'
          ? '/api/v1/meals'
          : surface === 'date'
            ? '/api/v1/nutrition/2026-09-07/meals'
            : '/api/v1/meals/target/items';
      const before = snapshot();
      const ambiguous = await workers[0].wait('response', request(workers[0], url, payload(name)));
      expect(ambiguous.status).toBe(422);
      expect(snapshot()).toEqual(before);
      // Duplicates committed after staging must also be re-read and fail closed.
      const raceName = `Late duplicate ${surface}`;
      const staged = request(workers[0], url, payload(raceName), 'owner', true);
      await workers[0].wait('barrier', staged);
      for (const suffix of ['a', 'b'])
        db.insert(schema.foods)
          .values({
            id: `late-${surface}-${suffix}`,
            userId: 'owner',
            name: raceName,
            servingSize: 'serving',
            ...macros,
          })
          .run();
      const afterDuplicates = snapshot();
      workers[0].send({ kind: 'release', id: staged });
      const lateConflict = await workers[0].wait('response', staged);
      expect(lateConflict.status).toBe(422);
      expect(lateConflict.body).toMatchObject({ error: { code: 'UNRESOLVED_FOODS' } });
      expect(snapshot()).toEqual(afterDuplicates);
      sqlite.exec(
        "CREATE TRIGGER reject_process_usage BEFORE UPDATE OF usage_count ON foods BEGIN SELECT RAISE(ABORT, 'forced usage persistence failure'); END",
      );
      try {
        const failed = await workers[0].wait(
          'response',
          request(workers[0], url, payload(`Rollback ${surface}`)),
        );
        expect(failed.status).toBe(500);
        expect(failed.attempts).toBe(1); // Non-lock errors must not retry.
        expect(failed.body).not.toHaveProperty('agent.itemOutcomes');
        expect(snapshot()).toEqual(afterDuplicates);
      } finally {
        sqlite.exec('DROP TRIGGER reject_process_usage');
      }
      usage();
    },
  );
});
