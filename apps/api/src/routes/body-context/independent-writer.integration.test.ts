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
  body?: unknown;
  connectionId?: string;
  error?: string;
  headers?: Record<string, string | string[] | undefined>;
  id?: string;
  journalMode?: string;
  kind: string;
  pid?: number;
  status?: number;
};
type Request = {
  method: 'POST' | 'PATCH';
  payload: Record<string, unknown>;
  url: string;
};

class Worker {
  readonly child: ChildProcess;
  readonly messages: Message[] = [];
  private readonly listeners = new Set<() => void>();
  private stderr = '';
  private exited = false;

  constructor(databasePath: string) {
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
          DATABASE_URL: databasePath,
          JWT_SECRET: 'fictional-body-context-process-secret',
          PULSE_TEST_NOW: '2026-09-19T14:00:00.000Z',
        },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      },
    );
    this.child.stderr?.on('data', (chunk) => (this.stderr += String(chunk)));
    this.child.on('message', (message: Message) => {
      this.messages.push(message);
      for (const listener of this.listeners) listener();
    });
    this.child.on('exit', (code) => {
      this.exited = true;
      this.messages.push({ kind: 'fatal', error: `exit ${code}` });
      for (const listener of this.listeners) listener();
    });
  }

  send(command: object) {
    this.child.send(command);
  }

  wait(kind: string, id?: string): Promise<Message> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const found = this.messages.find(
          (message) => message.kind === kind && (id === undefined || message.id === id),
        );
        if (found) {
          clearTimeout(timer);
          this.listeners.delete(check);
          resolve(found);
        } else if (this.exited || this.messages.some((message) => message.kind === 'fatal')) {
          clearTimeout(timer);
          this.listeners.delete(check);
          reject(new Error(`Worker failed ${JSON.stringify(this.messages)} ${this.stderr}`));
        }
      };
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error(`Worker timeout ${kind}/${id} ${this.stderr}`));
      }, 6_000);
      this.listeners.add(check);
      check();
    });
  }

  async close() {
    if (this.exited) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => this.child.kill('SIGKILL'), 1_000);
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      this.send({ kind: 'close', id: 'close' });
    });
  }
}

let sequence = 0;
let directory = '';
let databasePath = '';
let control: Database.Database;
const workers: Worker[] = [];
const source = {
  class: 'user_observation',
  sourceId: 'fictional-process-conversation',
  sourceLabel: 'Fictional user observation',
  sourceOccurredAt: '2026-09-19T08:15:00.000-04:00',
  uncertainty: 'known',
  freshness: {
    state: 'current',
    asOf: '2026-09-19T08:15:00.000-04:00',
    reasons: [],
  },
};

const sendRequest = (worker: Worker, request: Request, barrier = false) => {
  const id = `body-context-process-${++sequence}`;
  worker.send({ kind: 'request', id, owner: 'owner', barrier, ...request });
  return id;
};
const response = async (worker: Worker, request: Request) => {
  const id = sendRequest(worker, request);
  return worker.wait('response', id);
};
const data = <T>(message: Message) => (message.body as { data: T }).data;
const compete = async (left: Request, right: Request) => {
  const ids = [sendRequest(workers[0], left, true), sendRequest(workers[1], right, true)];
  await Promise.all(workers.map((worker, index) => worker.wait('barrier', ids[index])));
  control.exec('BEGIN IMMEDIATE');
  try {
    workers.forEach((worker, index) => worker.send({ kind: 'release', id: ids[index] }));
    await Promise.all(workers.map((worker, index) => worker.wait('released', ids[index])));
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

describe('body-context writes across independent API processes', () => {
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pulse-body-context-process-'));
    databasePath = join(directory, 'fictional-wal.db');
    control = new Database(databasePath);
    control.pragma('journal_mode = WAL');
    control.pragma('foreign_keys = ON');
    control.pragma('busy_timeout = 5000');
    const db = drizzle(control, { schema });
    migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });
    db.insert(schema.users)
      .values({
        id: 'owner',
        username: 'owner',
        passwordHash: 'fictional',
        preferences: { timeZone: 'America/Detroit' },
      })
      .run();
    db.insert(schema.agentTokens)
      .values({
        id: 'token-owner',
        userId: 'owner',
        name: 'owner-fixture',
        tokenHash: createHash('sha256').update('fictional-owner').digest('hex'),
      })
      .run();
    workers.push(new Worker(databasePath), new Worker(databasePath));
    const online = await Promise.all(workers.map((worker) => worker.wait('online')));
    expect(new Set(online.map((item) => item.pid)).size).toBe(2);
    expect(new Set(online.map((item) => item.connectionId)).size).toBe(2);
    expect(online.map((item) => item.journalMode)).toEqual(['wal', 'wal']);
  });

  afterAll(async () => {
    if (control?.inTransaction) control.exec('ROLLBACK');
    await Promise.all(workers.map((worker) => worker.close()));
    control?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('serializes duplicate flares, stale corrections, competing execution, and stale targets', async () => {
    const concern = await response(workers[0], {
      method: 'POST',
      url: '/api/v1/body-context/concerns',
      payload: {
        label: 'Fictional shoulder concern',
        bodyRegion: 'right shoulder',
        symptomState: 'unknown',
        managementState: 'monitoring',
        source,
        legacyHealthConditionId: null,
        idempotencyKey: 'process-concern-create-178',
      },
    });
    expect(concern.status).toBe(201);
    const concernId = data<{ concern: { id: string } }>(concern).concern.id;
    const flareRequest: Request = {
      method: 'POST',
      url: `/api/v1/body-context/concerns/${concernId}/flares`,
      payload: {
        occurredAt: '2026-09-19T09:00:00.000-04:00',
        localDate: '2026-09-19',
        timeZone: 'America/Detroit',
        observation: 'Fictional partial flare observation',
        source,
        followUpQuestions: [],
        idempotencyKey: 'process-duplicate-flare-178',
      },
    };
    const duplicateFlares = await compete(flareRequest, flareRequest);
    expect(duplicateFlares.map((item) => item.status)).toEqual([201, 201]);
    expect(duplicateFlares[0].body).toEqual(duplicateFlares[1].body);
    expect(control.prepare('select count(*) as count from body_context_flares').get()).toEqual({
      count: 1,
    });
    expect(
      control.prepare('select count(*) as count from body_context_concern_revisions').get(),
    ).toEqual({ count: 2 });

    const corrections = await compete(
      {
        method: 'PATCH',
        url: `/api/v1/body-context/concerns/${concernId}`,
        payload: {
          expectedRevision: 2,
          correctedFields: { label: 'Winning correction A' },
          reason: 'Independent writer A',
          idempotencyKey: 'process-correction-a-178',
        },
      },
      {
        method: 'PATCH',
        url: `/api/v1/body-context/concerns/${concernId}`,
        payload: {
          expectedRevision: 2,
          correctedFields: { label: 'Winning correction B' },
          reason: 'Independent writer B',
          idempotencyKey: 'process-correction-b-178',
        },
      },
    );
    expect(corrections.map((item) => item.status).sort()).toEqual([200, 409]);
    expect(
      control.prepare('select count(*) as count from body_context_concern_revisions').get(),
    ).toEqual({ count: 3 });
    expect(
      control
        .prepare(
          "select count(*) as count from body_context_idempotency_receipts where operation='correct_concern'",
        )
        .get(),
    ).toEqual({ count: 1 });

    const activity = await response(workers[0], {
      method: 'POST',
      url: '/api/v1/activities',
      payload: {
        kind: 'walking',
        name: 'Independent walk',
        goalIds: [],
        structuredWorkoutSessionId: null,
        source: { ...source, capturedAt: '2026-09-19T14:00:00.000Z' },
        idempotencyKey: 'process-activity-178',
      },
    });
    const activityId = data<{ activity: { id: string } }>(activity).activity.id;
    const assignment = await response(workers[0], {
      method: 'POST',
      url: `/api/v1/activities/${activityId}/assignments`,
      payload: {
        plannedLocalDate: '2026-09-22',
        timeZone: 'America/Detroit',
        recurrenceRevisionId: null,
        idempotencyKey: 'process-assignment-178',
      },
    });
    const assignmentId = data<{ id: string }>(assignment).id;
    const proposal = await response(workers[0], {
      method: 'POST',
      url: '/api/v1/plan-change-proposals',
      payload: {
        summary: 'Independently approve one exact walk move.',
        effects: [
          {
            kind: 'activity_assignment_reschedule',
            assignmentId,
            expectedRevision: 1,
            plannedLocalDate: '2026-09-23',
            timeZone: 'America/Detroit',
            reason: 'Exact approved move',
          },
        ],
        sourceReferences: [],
        idempotencyKey: 'process-proposal-178',
      },
    });
    const proposalData = data<{
      currentRevisionId: string;
      id: string;
      targetRevisionFingerprint: string;
    }>(proposal);
    const statement = await response(workers[0], {
      method: 'POST',
      url: `/api/v1/plan-change-proposals/${proposalData.id}/approval-statements`,
      payload: {
        proposalRevisionId: proposalData.currentRevisionId,
        targetRevisionFingerprint: proposalData.targetRevisionFingerprint,
        statement: 'Yes, move this exact walk.',
        sourceId: 'fictional-explicit-approval',
        sourceOccurredAt: '2026-09-19T10:00:00.000-04:00',
        idempotencyKey: 'process-statement-178',
      },
    });
    const approvalRequest: Request = {
      method: 'POST',
      url: `/api/v1/plan-change-proposals/${proposalData.id}/approval`,
      payload: {
        proposalRevisionId: proposalData.currentRevisionId,
        targetRevisionFingerprint: proposalData.targetRevisionFingerprint,
        relayApprovalStatementId: data<{ id: string }>(statement).id,
        idempotencyKey: 'process-approval-178',
      },
    };
    const approvals = await compete(approvalRequest, approvalRequest);
    expect(approvals.map((item) => item.status)).toEqual([200, 200]);
    expect(approvals[0].body).toEqual(approvals[1].body);
    expect(
      control
        .prepare('select revision,planned_local_date as date from activity_assignments where id=?')
        .get(assignmentId),
    ).toEqual({ revision: 2, date: '2026-09-23' });
    expect(
      control
        .prepare(
          'select count(*) as count from activity_assignment_revisions where assignment_id=?',
        )
        .get(assignmentId),
    ).toEqual({ count: 2 });

    const staleProposal = await response(workers[0], {
      method: 'POST',
      url: '/api/v1/plan-change-proposals',
      payload: {
        summary: 'This proposal will become stale.',
        effects: [
          {
            kind: 'activity_assignment_reschedule',
            assignmentId,
            expectedRevision: 2,
            plannedLocalDate: '2026-09-25',
            timeZone: 'America/Detroit',
            reason: 'Stale target proof',
          },
        ],
        sourceReferences: [],
        idempotencyKey: 'process-stale-proposal-178',
      },
    });
    const staleData = data<{
      currentRevisionId: string;
      id: string;
      targetRevisionFingerprint: string;
    }>(staleProposal);
    const staleStatement = await response(workers[0], {
      method: 'POST',
      url: `/api/v1/plan-change-proposals/${staleData.id}/approval-statements`,
      payload: {
        proposalRevisionId: staleData.currentRevisionId,
        targetRevisionFingerprint: staleData.targetRevisionFingerprint,
        statement: 'Yes, to this now-stale proposal.',
        sourceId: 'fictional-stale-approval',
        sourceOccurredAt: '2026-09-19T10:05:00.000-04:00',
        idempotencyKey: 'process-stale-statement-178',
      },
    });
    const directMove = await response(workers[1], {
      method: 'PATCH',
      url: `/api/v1/activity-assignments/${assignmentId}/reschedule`,
      payload: {
        expectedRevision: 2,
        plannedLocalDate: '2026-09-24',
        timeZone: 'America/Detroit',
        reason: 'Routine direct move',
        idempotencyKey: 'process-direct-move-178',
      },
    });
    expect(directMove.status).toBe(200);
    const staleApproval = await response(workers[0], {
      method: 'POST',
      url: `/api/v1/plan-change-proposals/${staleData.id}/approval`,
      payload: {
        proposalRevisionId: staleData.currentRevisionId,
        targetRevisionFingerprint: staleData.targetRevisionFingerprint,
        relayApprovalStatementId: data<{ id: string }>(staleStatement).id,
        idempotencyKey: 'process-stale-approval-178',
      },
    });
    expect(staleApproval.status).toBe(409);
    expect((staleApproval.body as { error: { code: string } }).error.code).toBe('STALE_TARGET');
    expect(
      control
        .prepare('select revision,planned_local_date as date from activity_assignments where id=?')
        .get(assignmentId),
    ).toEqual({ revision: 3, date: '2026-09-24' });
    expect(
      control
        .prepare(
          "select count(*) as count from body_context_idempotency_receipts where idempotency_key='process-stale-approval-178'",
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(control.pragma('foreign_key_check')).toEqual([]);
    expect(control.pragma('integrity_check', { simple: true })).toBe('ok');
  });
});
