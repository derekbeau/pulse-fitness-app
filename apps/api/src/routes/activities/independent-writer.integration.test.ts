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

type WorkerMessage = {
  kind: string;
  id?: string;
  pid?: number;
  connectionId?: string;
  journalMode?: string;
  busyTimeout?: number;
  status?: number;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  error?: string;
};

type ApiBody<T> = { data: T } | { error: { code: string; details?: unknown; message: string } };

class Worker {
  readonly child: ChildProcess;
  readonly messages: WorkerMessage[] = [];
  private readonly listeners = new Set<() => void>();
  private stderr = '';
  private exited = false;

  constructor(databasePath: string) {
    this.child = fork(
      fileURLToPath(new URL('./__tests__/independent-writer-worker.ts', import.meta.url)),
      [],
      {
        execArgv: ['--import', import.meta.resolve('tsx')],
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'test',
          DATABASE_URL: databasePath,
          JWT_SECRET: 'fictional-activity-process-secret',
        },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      },
    );
    this.child.stderr?.on('data', (chunk) => {
      this.stderr += String(chunk);
    });
    this.child.on('message', (message: WorkerMessage) => {
      this.messages.push(message);
      for (const listener of this.listeners) listener();
    });
    this.child.on('error', (error) => {
      this.messages.push({ kind: 'fatal', error: String(error) });
      for (const listener of this.listeners) listener();
    });
    this.child.on('exit', (code, signal) => {
      this.exited = true;
      this.messages.push({ kind: 'fatal', error: `exit code=${code} signal=${signal}` });
      for (const listener of this.listeners) listener();
    });
  }

  send(command: object) {
    this.child.send(command);
  }

  wait(kind: string, id?: string): Promise<WorkerMessage> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const message = this.messages.find(
          (candidate) => candidate.kind === kind && (id === undefined || candidate.id === id),
        );
        if (message) {
          clearTimeout(timer);
          this.listeners.delete(check);
          resolve(message);
        } else if (this.exited || this.messages.some((candidate) => candidate.kind === 'fatal')) {
          clearTimeout(timer);
          this.listeners.delete(check);
          reject(new Error(`Worker failed: ${JSON.stringify(this.messages)} ${this.stderr}`));
        }
      };
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(
          new Error(
            `Worker ${this.child.pid} timed out waiting for ${kind}/${id}: ${JSON.stringify(this.messages)} ${this.stderr}`,
          ),
        );
      }, 4_000);
      this.listeners.add(check);
      check();
    });
  }

  async close() {
    if (this.exited || !this.child.pid) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => this.child.kill('SIGKILL'), 1_000);
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      if (this.child.connected) this.send({ kind: 'close', id: 'close' });
      else this.child.kill('SIGKILL');
    });
  }
}

type Request = {
  method: 'GET' | 'POST' | 'PATCH';
  url: string;
  payload?: Record<string, unknown>;
  owner?: 'owner' | 'foreign';
};

let sequence = 0;
let directory = '';
let databasePath = '';
let control: Database.Database;
const workers: Worker[] = [];

const source = (label = 'Fictional independently reported activity') => ({
  class: 'user_observation',
  sourceId: 'fictional-concurrency-evidence',
  sourceLabel: label,
  sourceOccurredAt: '2026-09-18T21:15:00.000-04:00',
  capturedAt: '2026-09-19T14:00:00.000Z',
  uncertainty: 'known',
  freshness: {
    state: 'current',
    asOf: '2026-09-18T21:15:00.000-04:00',
    reasons: [],
  },
});

const activityPayload = (idempotencyKey: string, name: string) => ({
  kind: 'physical_therapy',
  name,
  goalIds: [],
  structuredWorkoutSessionId: null,
  source: source(),
  idempotencyKey,
});

const request = (worker: Worker, input: Request, barrier = false) => {
  const id = `activity-process-${++sequence}`;
  worker.send({ kind: 'request', id, barrier, owner: 'owner', ...input });
  return id;
};

const response = async <T>(worker: Worker, input: Request) => {
  const message = await worker.wait('response', request(worker, input));
  return message as WorkerMessage & { body: ApiBody<T> };
};

const data = <T>(message: WorkerMessage) => (message.body as { data: T }).data;
const errorCode = (message: WorkerMessage) =>
  (message.body as { error: { code: string } }).error.code;

const compete = async (left: Request, right: Request) => {
  const ids = [request(workers[0], left, true), request(workers[1], right, true)];
  await Promise.all(workers.map((worker, index) => worker.wait('barrier', ids[index])));
  control.exec('BEGIN IMMEDIATE');
  try {
    workers.forEach((worker, index) => worker.send({ kind: 'release', id: ids[index] }));
    const released = await Promise.all(
      workers.map((worker, index) => worker.wait('released', ids[index])),
    );
    expect(released.map((attempt) => attempt.id)).toEqual(ids);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(
      workers.some((worker, index) =>
        worker.messages.some((message) => message.kind === 'response' && message.id === ids[index]),
      ),
    ).toBe(false);
  } finally {
    control.exec('COMMIT');
  }
  return Promise.all(workers.map((worker, index) => worker.wait('response', ids[index])));
};

const inspect = <T>(read: (sqlite: Database.Database) => T) => {
  const sqlite = new Database(databasePath, { readonly: true });
  try {
    return read(sqlite);
  } finally {
    sqlite.close();
  }
};

const expectHealthyDatabase = () =>
  inspect((sqlite) => {
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
  });

describe('Activity writes across independent API processes', () => {
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pulse-activity-process-'));
    databasePath = join(directory, 'fictional-wal.db');
    control = new Database(databasePath);
    control.pragma('journal_mode = WAL');
    control.pragma('foreign_keys = ON');
    control.pragma('busy_timeout = 5000');
    const db = drizzle(control, { schema });
    migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)) });
    for (const id of ['owner', 'foreign']) {
      db.insert(schema.users).values({ id, username: id, passwordHash: 'fictional' }).run();
      db.insert(schema.agentTokens)
        .values({
          id: `token-${id}`,
          userId: id,
          name: `${id}-fixture`,
          tokenHash: createHash('sha256').update(`fictional-${id}`).digest('hex'),
        })
        .run();
    }
    workers.push(new Worker(databasePath), new Worker(databasePath));
    const online = await Promise.all(workers.map((worker) => worker.wait('online')));
    expect(new Set(online.map((message) => message.pid)).size).toBe(2);
    expect(new Set(online.map((message) => message.connectionId)).size).toBe(2);
    expect(online.every((message) => message.pid !== process.pid)).toBe(true);
    expect(online.map((message) => message.journalMode)).toEqual(['wal', 'wal']);
    expect(online.map((message) => message.busyTimeout)).toEqual([5000, 5000]);
    console.info('Independent Activity writer ownership:', online);
  });

  afterAll(async () => {
    if (control?.inTransaction) control.exec('ROLLBACK');
    await Promise.all(workers.map((worker) => worker.close()));
    control?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('converges same-key creation to one root, revision, receipt, and original result', async () => {
    const payload = activityPayload('independent-create-key-177', 'Independent create race');
    const responses = await compete(
      { method: 'POST', url: '/api/v1/activities', payload },
      { method: 'POST', url: '/api/v1/activities', payload },
    );
    expect(responses.map((item) => item.status)).toEqual([201, 201]);
    expect(responses[1].body).toEqual(responses[0].body);
    expect(responses.map((item) => item.headers?.['idempotent-replay']).sort()).toEqual([
      'true',
      undefined,
    ]);
    const activityId = data<{ activity: { id: string } }>(responses[0]).activity.id;

    const altered = await response(workers[0], {
      method: 'POST',
      url: '/api/v1/activities',
      payload: { ...payload, name: 'Changed semantic payload' },
    });
    expect(altered.status).toBe(409);
    expect(errorCode(altered)).toBe('IDEMPOTENCY_KEY_REUSE');

    inspect((sqlite) => {
      expect(
        sqlite
          .prepare('select count(*) from canonical_activities where id = ?')
          .pluck()
          .get(activityId),
      ).toBe(1);
      expect(
        sqlite
          .prepare('select count(*) from activity_revisions where activity_id = ?')
          .pluck()
          .get(activityId),
      ).toBe(1);
      expect(
        sqlite
          .prepare('select count(*) from activity_idempotency_receipts where idempotency_key = ?')
          .pluck()
          .get('independent-create-key-177'),
      ).toBe(1);
    });
    expectHealthyDatabase();
  });

  it('replays one recurrence materialization without duplicate occurrences', async () => {
    const created = await response<{ activity: { id: string } }>(workers[0], {
      method: 'POST',
      url: '/api/v1/activities',
      payload: activityPayload('materialize-root-177', 'Materialization race'),
    });
    const activityId = data<{ activity: { id: string } }>(created).activity.id;
    const recurrence = await response<{ id: string }>(workers[0], {
      method: 'POST',
      url: `/api/v1/activities/${activityId}/recurrences`,
      payload: {
        effectiveFromLocalDate: '2026-09-21',
        timeZone: 'America/Detroit',
        frequency: 'specific_weekdays',
        interval: 1,
        weekdays: [1, 3],
        assignmentPolicy: 'unassigned_on_or_after_effective_date',
        idempotencyKey: 'materialize-recurrence-177',
      },
    });
    const recurrenceId = data<{ id: string }>(recurrence).id;
    const payload = {
      from: '2026-09-21',
      to: '2026-09-27',
      idempotencyKey: 'independent-materialize-key-177',
    };
    const responses = await compete(
      { method: 'POST', url: `/api/v1/activity-recurrences/${recurrenceId}/materialize`, payload },
      { method: 'POST', url: `/api/v1/activity-recurrences/${recurrenceId}/materialize`, payload },
    );
    expect(responses.map((item) => item.status)).toEqual([200, 200]);
    expect(responses[1].body).toEqual(responses[0].body);
    expect(responses.map((item) => item.headers?.['idempotent-replay']).sort()).toEqual([
      'true',
      undefined,
    ]);
    expect(data<{ created: unknown[] }>(responses[0]).created).toHaveLength(2);

    inspect((sqlite) => {
      expect(
        sqlite
          .prepare('select count(*) from activity_assignments where recurrence_id = ?')
          .pluck()
          .get(recurrenceId),
      ).toBe(2);
      expect(
        sqlite
          .prepare(
            'select count(*) from activity_assignment_revisions where assignment_id in (select id from activity_assignments where recurrence_id = ?)',
          )
          .pluck()
          .get(recurrenceId),
      ).toBe(2);
      expect(
        sqlite
          .prepare('select count(*) from activity_idempotency_receipts where idempotency_key = ?')
          .pluck()
          .get(payload.idempotencyKey),
      ).toBe(1);
    });
    expectHealthyDatabase();
  });

  it('allows exactly one same-revision execution correction and preserves both revisions', async () => {
    const created = await response<{ activity: { id: string } }>(workers[0], {
      method: 'POST',
      url: '/api/v1/activities',
      payload: activityPayload('correction-root-177', 'Correction race'),
    });
    const activityId = data<{ activity: { id: string } }>(created).activity.id;
    const execution = await response<{ id: string }>(workers[0], {
      method: 'POST',
      url: `/api/v1/activities/${activityId}/executions`,
      payload: {
        assignmentId: null,
        actualOccurredAt: '2026-09-22T07:30:00.000-04:00',
        actualLocalDate: '2026-09-22',
        timeZone: 'America/Detroit',
        durationMinutes: 5,
        outcome: 'completed',
        structuredWorkoutSessionId: null,
        source: source('Fictional execution'),
        idempotencyKey: 'correction-execution-177',
      },
    });
    const executionId = data<{ id: string }>(execution).id;
    const responses = await compete(
      {
        method: 'POST',
        url: `/api/v1/activity-executions/${executionId}/corrections`,
        payload: {
          expectedRevision: 1,
          correctedFields: { durationMinutes: 6 },
          reason: 'First independent contender',
          idempotencyKey: 'independent-correction-a-177',
        },
      },
      {
        method: 'POST',
        url: `/api/v1/activity-executions/${executionId}/corrections`,
        payload: {
          expectedRevision: 1,
          correctedFields: { durationMinutes: 7 },
          reason: 'Second independent contender',
          idempotencyKey: 'independent-correction-b-177',
        },
      },
    );
    expect(responses.map((item) => item.status).sort()).toEqual([200, 409]);
    const winner = responses.find((item) => item.status === 200);
    const loser = responses.find((item) => item.status === 409);
    expect(winner).toBeDefined();
    expect(loser).toBeDefined();
    if (!winner || !loser) throw new Error('Correction race did not produce one winner and loser');
    expect(errorCode(loser)).toBe('STALE_REVISION');
    const winningDuration = data<{ durationMinutes: number }>(winner).durationMinutes;

    inspect((sqlite) => {
      expect(
        sqlite
          .prepare(
            'select revision, duration_minutes as durationMinutes from activity_executions where id = ?',
          )
          .get(executionId),
      ).toEqual({ revision: 2, durationMinutes: winningDuration });
      const revisions = sqlite
        .prepare(
          'select revision, snapshot_json as snapshotJson from activity_execution_revisions where execution_id = ? order by revision',
        )
        .all(executionId) as Array<{ revision: number; snapshotJson: string }>;
      expect(revisions.map((revision) => revision.revision)).toEqual([1, 2]);
      expect(JSON.parse(revisions[0].snapshotJson)).toMatchObject({ durationMinutes: 5 });
      expect(JSON.parse(revisions[1].snapshotJson)).toMatchObject({
        durationMinutes: winningDuration,
      });
      expect(
        sqlite
          .prepare(
            "select count(*) from activity_idempotency_receipts where idempotency_key in ('independent-correction-a-177', 'independent-correction-b-177')",
          )
          .pluck()
          .get(),
      ).toBe(1);
    });
    expectHealthyDatabase();
  });

  it('allows exactly one same-revision reschedule and preserves the losing boundary', async () => {
    const created = await response<{ activity: { id: string } }>(workers[0], {
      method: 'POST',
      url: '/api/v1/activities',
      payload: activityPayload('reschedule-root-177', 'Reschedule race'),
    });
    const activityId = data<{ activity: { id: string } }>(created).activity.id;
    const assignment = await response<{ id: string }>(workers[0], {
      method: 'POST',
      url: `/api/v1/activities/${activityId}/assignments`,
      payload: {
        plannedLocalDate: '2026-10-01',
        timeZone: 'America/Detroit',
        recurrenceRevisionId: null,
        idempotencyKey: 'reschedule-assignment-177',
      },
    });
    const assignmentId = data<{ id: string }>(assignment).id;
    const responses = await compete(
      {
        method: 'PATCH',
        url: `/api/v1/activity-assignments/${assignmentId}/reschedule`,
        payload: {
          expectedRevision: 1,
          plannedLocalDate: '2026-10-02',
          timeZone: 'America/Detroit',
          reason: 'First independent contender',
          idempotencyKey: 'independent-reschedule-a-177',
        },
      },
      {
        method: 'PATCH',
        url: `/api/v1/activity-assignments/${assignmentId}/reschedule`,
        payload: {
          expectedRevision: 1,
          plannedLocalDate: '2026-10-03',
          timeZone: 'America/Detroit',
          reason: 'Second independent contender',
          idempotencyKey: 'independent-reschedule-b-177',
        },
      },
    );
    expect(responses.map((item) => item.status).sort()).toEqual([200, 409]);
    const winner = responses.find((item) => item.status === 200);
    const loser = responses.find((item) => item.status === 409);
    expect(winner).toBeDefined();
    expect(loser).toBeDefined();
    if (!winner || !loser) throw new Error('Reschedule race did not produce one winner and loser');
    expect(errorCode(loser)).toBe('STALE_REVISION');
    const winningDate = data<{ plannedLocalDate: string }>(winner).plannedLocalDate;

    inspect((sqlite) => {
      expect(
        sqlite
          .prepare(
            'select revision, planned_local_date as plannedLocalDate from activity_assignments where id = ?',
          )
          .get(assignmentId),
      ).toEqual({ revision: 2, plannedLocalDate: winningDate });
      expect(
        sqlite
          .prepare(
            'select revision, planned_local_date as plannedLocalDate from activity_assignment_revisions where assignment_id = ? order by revision',
          )
          .all(assignmentId),
      ).toEqual([
        { revision: 1, plannedLocalDate: '2026-10-01' },
        { revision: 2, plannedLocalDate: winningDate },
      ]);
      expect(
        sqlite
          .prepare(
            "select count(*) from activity_idempotency_receipts where idempotency_key in ('independent-reschedule-a-177', 'independent-reschedule-b-177')",
          )
          .pluck()
          .get(),
      ).toBe(1);
    });
    expectHealthyDatabase();
  });

  it('keeps foreign recurrence and assignment references opaque and receipt-free', async () => {
    const foreignActivity = await response<{ activity: { id: string } }>(workers[0], {
      method: 'POST',
      url: '/api/v1/activities',
      owner: 'foreign',
      payload: activityPayload('foreign-root-177', 'Foreign activity'),
    });
    const foreignActivityId = data<{ activity: { id: string } }>(foreignActivity).activity.id;
    const foreignRecurrence = await response<{ id: string; revisions: Array<{ id: string }> }>(
      workers[0],
      {
        method: 'POST',
        url: `/api/v1/activities/${foreignActivityId}/recurrences`,
        owner: 'foreign',
        payload: {
          effectiveFromLocalDate: '2026-10-05',
          timeZone: 'America/Detroit',
          frequency: 'weekly',
          interval: 1,
          weekdays: [],
          assignmentPolicy: 'unassigned_on_or_after_effective_date',
          idempotencyKey: 'foreign-recurrence-root-177',
        },
      },
    );
    const foreignRecurrenceData = data<{ id: string; revisions: Array<{ id: string }> }>(
      foreignRecurrence,
    );
    const revise = await response(workers[0], {
      method: 'POST',
      url: `/api/v1/activity-recurrences/${foreignRecurrenceData.id}/revisions`,
      payload: {
        expectedRevisionId: foreignRecurrenceData.revisions[0].id,
        effectiveFromLocalDate: '2026-10-12',
        timeZone: 'America/Detroit',
        frequency: 'weekly',
        interval: 1,
        weekdays: [],
        assignmentPolicy: 'unassigned_on_or_after_effective_date',
        idempotencyKey: 'foreign-recurrence-revise-177',
      },
    });
    const materialize = await response(workers[0], {
      method: 'POST',
      url: `/api/v1/activity-recurrences/${foreignRecurrenceData.id}/materialize`,
      payload: {
        from: '2026-10-05',
        to: '2026-10-12',
        idempotencyKey: 'foreign-recurrence-materialize-177',
      },
    });
    expect([revise.status, materialize.status]).toEqual([404, 404]);

    const foreignAssignment = await response<{ id: string }>(workers[0], {
      method: 'POST',
      url: `/api/v1/activities/${foreignActivityId}/assignments`,
      owner: 'foreign',
      payload: {
        plannedLocalDate: '2026-10-07',
        timeZone: 'America/Detroit',
        recurrenceRevisionId: null,
        idempotencyKey: 'foreign-assignment-root-177',
      },
    });
    const ownerActivity = await response<{ activity: { id: string } }>(workers[0], {
      method: 'POST',
      url: '/api/v1/activities',
      payload: activityPayload('foreign-link-owner-root-177', 'Owner activity'),
    });
    const execution = await response(workers[0], {
      method: 'POST',
      url: `/api/v1/activities/${data<{ activity: { id: string } }>(ownerActivity).activity.id}/executions`,
      payload: {
        assignmentId: data<{ id: string }>(foreignAssignment).id,
        actualOccurredAt: '2026-10-07T08:00:00.000-04:00',
        actualLocalDate: '2026-10-07',
        timeZone: 'America/Detroit',
        durationMinutes: 5,
        outcome: 'completed',
        structuredWorkoutSessionId: null,
        source: source('Foreign assignment probe'),
        idempotencyKey: 'foreign-assignment-execution-177',
      },
    });
    expect(execution.status).toBe(404);
    expect([errorCode(revise), errorCode(materialize), errorCode(execution)]).toEqual([
      'OWNED_LINK_NOT_FOUND',
      'OWNED_LINK_NOT_FOUND',
      'OWNED_LINK_NOT_FOUND',
    ]);
    inspect((sqlite) => {
      expect(
        sqlite
          .prepare(
            "select count(*) from activity_idempotency_receipts where idempotency_key in ('foreign-recurrence-revise-177', 'foreign-recurrence-materialize-177', 'foreign-assignment-execution-177')",
          )
          .pluck()
          .get(),
      ).toBe(0);
    });
    expectHealthyDatabase();
  });
});
