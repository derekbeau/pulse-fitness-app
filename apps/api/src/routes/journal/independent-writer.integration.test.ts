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
  body?: { data?: Record<string, unknown>; error?: { code: string } };
  id?: string;
  kind: string;
  status?: number;
  error?: string;
};
type Request = { url: string; payload: Record<string, unknown> };
class Worker {
  readonly child: ChildProcess;
  readonly messages: Message[] = [];
  private readonly listeners = new Set<() => void>();
  constructor(path: string) {
    this.child = fork(
      fileURLToPath(
        new URL('../activities/__tests__/independent-writer-worker.ts', import.meta.url),
      ),
      [],
      {
        execArgv: ['--import', import.meta.resolve('tsx')],
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'test',
          DATABASE_URL: path,
          JWT_SECRET: 'daily-check-in-process-secret',
          PULSE_TEST_NOW: '2026-09-20T04:30:00.000Z',
        },
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      },
    );
    this.child.on('message', (m: Message) => {
      this.messages.push(m);
      this.listeners.forEach((l) => l());
    });
  }
  send(command: object) {
    this.child.send(command);
  }
  wait(kind: string, id?: string) {
    return new Promise<Message>((resolve, reject) => {
      const check = () => {
        const value = this.messages.find((m) => m.kind === kind && (!id || m.id === id));
        if (value) {
          clearTimeout(timer);
          this.listeners.delete(check);
          resolve(value);
        }
      };
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error(`Timed out waiting for ${kind}`));
      }, 6000);
      this.listeners.add(check);
      check();
    });
  }
  async close() {
    this.send({ kind: 'close', id: 'close' });
    await new Promise<void>((resolve) => this.child.once('exit', () => resolve()));
  }
}
let directory = '';
let databasePath = '';
let control: Database.Database;
const workers: Worker[] = [];
let sequence = 0;
const source = {
  class: 'user_observation',
  sourceId: 'daily-process-source',
  sourceLabel: 'Fictional process source',
  sourceOccurredAt: '2026-09-20T00:15:00.000Z',
  uncertainty: 'known',
  freshness: { state: 'current', asOf: '2026-09-20T00:15:00.000Z', reasons: [] },
};
const request = (worker: Worker, value: Request, barrier = false) => {
  const id = `daily-${++sequence}`;
  worker.send({
    kind: 'request',
    id,
    owner: 'owner',
    method: 'POST',
    barrier,
    url: value.url,
    payload: value.payload,
  });
  return id;
};
const compete = async (left: Request, right: Request) => {
  const ids = [request(workers[0], left, true), request(workers[1], right, true)];
  await Promise.all(ids.map((id, index) => workers[index].wait('barrier', id)));
  control.exec('BEGIN IMMEDIATE');
  try {
    ids.forEach((id, index) => workers[index].send({ kind: 'release', id }));
    await Promise.all(ids.map((id, index) => workers[index].wait('released', id)));
  } finally {
    control.exec('COMMIT');
  }
  return Promise.all(ids.map((id, index) => workers[index].wait('response', id)));
};
describe('Journal writes across independent API processes', () => {
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pulse-journal-process-'));
    databasePath = join(directory, 'wal.db');
    control = new Database(databasePath);
    control.pragma('journal_mode=WAL');
    control.pragma('foreign_keys=ON');
    control.pragma('busy_timeout=5000');
    const db = drizzle(control, { schema });
    migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)) });
    db.insert(schema.users)
      .values({
        id: 'owner',
        username: 'owner',
        passwordHash: 'x',
        preferences: { timeZone: 'America/Detroit' },
      })
      .run();
    db.insert(schema.agentTokens)
      .values({
        id: 'token',
        userId: 'owner',
        name: 'worker',
        tokenHash: createHash('sha256').update('fictional-owner').digest('hex'),
      })
      .run();
    control
      .prepare(
        "insert into body_context_concerns (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,current_revision_id,created_at,updated_at) values ('concern','owner','Shoulder','shoulder','affirmed','active',?,1,'concern-r1','2026-09-20T00:00:00.000Z','2026-09-20T00:00:00.000Z')",
      )
      .run(
        JSON.stringify({
          ...source,
          capturedAt: '2026-09-20T00:00:00.000Z',
          capturedBy: { kind: 'agent_token', id: 'token', label: 'worker' },
        }),
      );
    workers.push(new Worker(databasePath), new Worker(databasePath));
    await Promise.all(workers.map((w) => w.wait('online')));
  });
  afterAll(async () => {
    await Promise.all(workers.map((w) => w.close()));
    control.close();
    rmSync(directory, { recursive: true, force: true });
  });
  it('serializes duplicate creates and competing corrections with no partial receipts', async () => {
    const payload = {
      localDate: '2026-09-19',
      title: 'Shoulder after walking',
      content: 'Shoulder felt tight for thirty minutes after walking.',
      category: 'health',
      sourceReferences: [{ kind: 'body_concern', id: 'concern', revisionId: 'concern-r1' }],
      source,
      idempotencyKey: 'journal-process-create',
    };
    const create: Request = { url: '/api/v1/journal', payload };
    const created = await compete(create, create);
    expect(created.map((r) => r.status)).toEqual([201, 201]);
    expect(control.prepare('select count(*) count from journal_observations').get()).toEqual({
      count: 1,
    });
    expect(
      control.prepare('select count(*) count from journal_observation_revisions').get(),
    ).toEqual({ count: 1 });
    const observation = created[0].body?.data?.observation as Record<string, unknown>;
    const id = String(observation.id);
    const revisionId = String(observation.currentRevisionId);
    const correction: Request = {
      url: `/api/v1/journal/${id}/corrections`,
      payload: {
        expectedRevisionId: revisionId,
        correctedFields: { content: 'Shoulder felt tight for twenty minutes after walking.' },
        reason: 'Fictional clarification',
        idempotencyKey: 'journal-process-correction-a',
      },
    };
    const corrected = await compete(correction, {
      ...correction,
      payload: { ...correction.payload, idempotencyKey: 'journal-process-correction-b' },
    });
    expect(corrected.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(corrected.find((r) => r.status === 409)?.body?.error?.code).toBe('STALE_REVISION');
    expect(
      control.prepare('select count(*) count from journal_observation_revisions').get(),
    ).toEqual({ count: 2 });
    expect(
      control
        .prepare(
          'select operation,count(*) count from journal_idempotency_receipts group by operation order by operation',
        )
        .all(),
    ).toEqual([
      { operation: 'correct', count: 1 },
      { operation: 'create', count: 1 },
    ]);
    const revisions = control
      .prepare(
        'select id,prior_revision_id,snapshot_json from journal_observation_revisions order by revision',
      )
      .all() as Array<{ id: string; prior_revision_id: string | null; snapshot_json: string }>;
    expect(revisions[0]?.prior_revision_id).toBeNull();
    expect(revisions[1]?.prior_revision_id).toBe(revisions[0]?.id);
    expect(JSON.parse(revisions[0]?.snapshot_json ?? '{}').content).toBe(payload.content);
  });
});
