import { classifyNativeFeedback } from '@pulse/shared';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it, vi } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const temporaryDirectories: string[] = [];
const originalDatabaseUrl = process.env.DATABASE_URL;

function prepareDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'pulse-workout-progression-store-'));
  temporaryDirectories.push(directory);
  const databaseUrl = join(directory, 'store.db');
  const sqlite = new Database(databaseUrl);
  sqlite.pragma('foreign_keys = ON');
  migrate(drizzle(sqlite), { migrationsFolder });
  seedWorkout(sqlite);
  sqlite.close();
  process.env.DATABASE_URL = databaseUrl;
  return databaseUrl;
}

function seedWorkout(sqlite: Database.Database) {
  sqlite
    .prepare(
      "INSERT INTO users (id, username, password_hash, weight_unit) VALUES ('user-1', 'user-1', 'hash', 'lbs')",
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO agent_tokens (id, user_id, name, token_hash, created_at)
       VALUES ('agent-token-1', 'user-1', 'Coach agent', 'agent-token-hash-1', 100)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO exercises (
        id, user_id, name, muscle_groups, equipment, category, tracking_type,
        tags, form_cues, related_exercise_ids, created_at, updated_at
      ) VALUES (
        'exercise-1', 'user-1', 'Incline press', '["chest","triceps"]', 'dumbbells',
        'compound', 'weight_reps', '[]', '[]', '[]', 100, 100
      )`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO scheduled_workouts (id, user_id, date, created_at, updated_at)
       VALUES ('scheduled-1', 'user-1', '2026-08-24', 200, 200)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO scheduled_workout_exercises (
        id, scheduled_workout_id, exercise_id, exercise_name_snapshot, tracking_type_snapshot,
        section, order_index, created_at, updated_at
      ) VALUES (
        'scheduled-exercise-1', 'scheduled-1', 'exercise-1', 'Incline press', 'weight_reps',
        'main', 0, 200, 200
      )`,
    )
    .run();
  for (const setNumber of [1, 2]) {
    sqlite
      .prepare(
        `INSERT INTO scheduled_workout_exercise_sets (
          id, scheduled_workout_exercise_id, set_number, reps_min, reps_max, target_weight,
          created_at
        ) VALUES (?, 'scheduled-exercise-1', ?, 8, 10, 20, 200)`,
      )
      .run(`scheduled-set-${setNumber}`, setNumber);
  }
  sqlite
    .prepare(
      `INSERT INTO workout_sessions (
        id, user_id, name, date, status, started_at, completed_at, time_segments,
        created_at, updated_at
      ) VALUES (
        'session-1', 'user-1', 'Upper', '2026-08-20', 'completed', 300, 400, '[]',
        300, 400
      )`,
    )
    .run();
  for (const setNumber of [1, 2]) {
    sqlite
      .prepare(
        `INSERT INTO session_sets (
          id, session_id, exercise_id, order_index, set_number, weight, reps, rpe,
          target_reps_min, target_reps_max, target_weight, source_scheduled_set_id,
          exercise_id_snapshot, exercise_name_snapshot, tracking_type_snapshot,
          completed, skipped, section, created_at
        ) VALUES (?, 'session-1', 'exercise-1', ?, ?, 20, 10, 8,
          8, 10, 20, ?, 'exercise-1', 'Incline press', 'weight_reps',
          1, 0, 'main', 400)`,
      )
      .run(
        `session-set-${setNumber}`,
        setNumber - 1,
        setNumber,
        `source-scheduled-set-${setNumber}`,
      );
  }
  const policy = {
    allowReduction: false,
    contextRequired: false,
    distanceStep: null,
    effortCeiling: 8,
    family: 'double_progression',
    loadIncrement: 5,
    loadIncreasePercent: null,
    lowEffortThreshold: 7,
    repRangeMax: 10,
    repRangeMin: 8,
    secondsStep: null,
    version: 1,
    zoneCeiling: null,
  };
  const configuration = {
    actorId: 'user-1',
    actorLabel: 'You',
    actorType: 'user',
    contextAvailability: 'available',
    contextFacts: [],
    id: 'configuration-1',
    policy,
    priority: true,
    revision: 1,
    scheduledWorkoutExerciseId: 'scheduled-exercise-1',
    scheduledWorkoutId: 'scheduled-1',
    updatedAt: 450,
    userId: 'user-1',
  };
  sqlite
    .prepare(
      `INSERT INTO workout_progression_configurations (
        id, user_id, scheduled_workout_id, scheduled_workout_exercise_id, revision,
        snapshot, actor_type, agent_token_id, actor_label, updated_at
      ) VALUES ('configuration-1', 'user-1', 'scheduled-1', 'scheduled-exercise-1', 1,
        ?, 'user', NULL, 'You', 450)`,
    )
    .run(JSON.stringify(configuration));
}

async function loadStore() {
  vi.resetModules();
  return import('./store.js');
}

afterEach(async () => {
  try {
    const database = await import('../../db/index.js');
    database.sqlite.close();
  } catch {
    // The database module is not loaded in every assertion path.
  }
  vi.resetModules();
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('workout progression store', () => {
  it.each([
    { action: 'accept', both: false },
    { action: 'edit', both: false },
    { action: 'accept', both: true },
    { action: 'edit', both: true },
  ] as const)(
    'keeps a legacy recommendation %j after material canonicalization',
    async ({ action, both }) => {
      const file = prepareDatabase();
      const sql = new Database(file);
      sql.exec('UPDATE scheduled_workout_exercise_sets SET reps=8, reps_min=8, reps_max=8');
      if (both) {
        sql.exec('UPDATE session_sets SET target_reps=8, target_reps_min=8, target_reps_max=8');
        sql.exec(
          "UPDATE workout_progression_configurations SET revision=revision+1, snapshot=json_set(snapshot, '$.revision', 2, '$.policy.family', 'strength_load', '$.policy.loadIncreasePercent', 25)",
        );
      }
      const store = await loadStore();
      const input = { scheduledWorkoutId: 'scheduled-1', userId: 'user-1', generatedAt: 500 };
      const preview = (await store.previewWorkoutProgression(input))?.[0];
      if (!preview) throw new Error('Missing preview');
      expect(preview.confidence).toBe('supported');
      await store.applyWorkoutProgressionAction({
        actor: { id: 'user-1', label: 'You', type: 'user' },
        userId: 'user-1',
        recommendationId: preview.id,
        input: {
          action,
          expectedFingerprint: preview.sourceFingerprint,
          idempotencyKey: `legacy-${action}`,
          editedTargets:
            action === 'edit'
              ? preview.recommendedTargets.map((target) => ({ ...target, weight: 22.5 }))
              : null,
          reason: null,
        },
      });
      expect(await store.getWorkoutProgressionRecommendation('user-1', preview.id)).toMatchObject({
        state: action === 'accept' ? 'accepted' : 'edited',
        staleAt: null,
        evidence: preview.evidence,
      });
      expect((await store.previewWorkoutProgression(input))?.[0]?.id).toBe(preview.id);
      expect(
        sql.prepare('SELECT reps, reps_min, reps_max FROM scheduled_workout_exercise_sets').all(),
      ).toEqual([
        { reps: 8, reps_min: null, reps_max: null },
        { reps: 8, reps_min: null, reps_max: null },
      ]);
      sql.close();
    },
  );

  it.each(['current', 'historical'] as const)(
    'normalizes persisted equal redundancy in %s evidence without rewriting rows',
    async (source) => {
      const file = prepareDatabase();
      const sql = new Database(file);
      if (source === 'current')
        sql.exec('UPDATE scheduled_workout_exercise_sets SET reps=8, reps_min=8, reps_max=8');
      else sql.exec('UPDATE session_sets SET target_reps=8, target_reps_min=8, target_reps_max=8');
      const before = sql
        .prepare(
          source === 'current'
            ? 'SELECT * FROM scheduled_workout_exercise_sets'
            : 'SELECT * FROM session_sets',
        )
        .all();
      const store = await loadStore();
      const input = { scheduledWorkoutId: 'scheduled-1', userId: 'user-1', generatedAt: 500 };
      const first = (await store.previewWorkoutProgression(input))?.[0];
      if (!first) throw new Error('Missing preview');
      expect(first.evidence.diagnostics).toHaveLength(2);
      expect(first.evidence.diagnostics?.every((d) => d.reason === 'REDUNDANT_EXACT_REPS')).toBe(
        true,
      );
      const canonical =
        source === 'current'
          ? first.evidence.priorTargets
          : first.evidence.performance.map((set) => set.prescribed);
      expect(
        canonical.every((set) => set.reps === 8 && set.repsMin === null && set.repsMax === null),
      ).toBe(true);
      expect((await store.previewWorkoutProgression(input))?.[0]).toEqual(first);
      expect(
        sql
          .prepare(
            source === 'current'
              ? 'SELECT * FROM scheduled_workout_exercise_sets'
              : 'SELECT * FROM session_sets',
          )
          .all(),
      ).toEqual(before);
      sql.close();
    },
  );

  it.each(['current', 'historical'] as const)(
    'isolates conflicting %s evidence and blocks material actions',
    async (source) => {
      const file = prepareDatabase();
      const sql = new Database(file);
      sql.exec(
        "INSERT INTO scheduled_workout_exercises (id, scheduled_workout_id, exercise_id, exercise_name_snapshot, tracking_type_snapshot, section, order_index, created_at, updated_at) VALUES ('valid-exercise', 'scheduled-1', 'exercise-1', 'Valid exercise', 'weight_reps', 'main', 1, 200, 200)",
      );
      sql.exec(
        "INSERT INTO scheduled_workout_exercise_sets (id, scheduled_workout_exercise_id, set_number, reps_min, reps_max, target_weight, created_at) VALUES ('valid-set', 'valid-exercise', 1, 8, 10, 20, 200)",
      );
      if (source === 'current')
        sql.exec(
          "UPDATE scheduled_workout_exercise_sets SET reps=8, reps_min=6, reps_max=8 WHERE scheduled_workout_exercise_id='scheduled-exercise-1'",
        );
      else sql.exec('UPDATE session_sets SET target_reps=8, target_reps_min=6, target_reps_max=8');
      const config = sql
        .prepare(
          "SELECT snapshot FROM workout_progression_configurations WHERE id='configuration-1'",
        )
        .get() as { snapshot: string };
      const validConfig = {
        ...JSON.parse(config.snapshot),
        id: 'valid-configuration',
        scheduledWorkoutExerciseId: 'valid-exercise',
      };
      sql
        .prepare(
          "INSERT INTO workout_progression_configurations (id,user_id,scheduled_workout_id,scheduled_workout_exercise_id,revision,snapshot,actor_type,actor_label,updated_at) VALUES ('valid-configuration','user-1','scheduled-1','valid-exercise',1,?,'user','You',450)",
        )
        .run(JSON.stringify(validConfig));
      const before = sql.prepare('SELECT * FROM scheduled_workout_exercise_sets').all();
      const store = await loadStore();
      const results = await store.previewWorkoutProgression({
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
        generatedAt: 500,
      });
      expect(results).toHaveLength(2);
      const invalid = results?.[0];
      const valid = results?.[1];
      if (!invalid || !valid) throw new Error('Missing exercise result');
      expect(invalid).toMatchObject({
        confidence: 'unavailable',
        decision: 'hold',
        reasonCodes: [
          source === 'current' ? 'INVALID_CURRENT_TARGET' : 'INVALID_HISTORICAL_PRESCRIPTION',
        ],
      });
      expect(invalid.evidence.diagnostics?.[0]?.raw).toMatchObject({
        reps: 8,
        repsMin: 6,
        repsMax: 8,
      });
      if (source === 'current')
        expect(valid).toMatchObject({ confidence: 'supported', decision: 'increase' });
      for (const action of ['accept', 'edit'] as const) {
        await expect(
          store.applyWorkoutProgressionAction({
            actor: { id: 'user-1', label: 'You', type: 'user' },
            userId: 'user-1',
            recommendationId: invalid.id,
            input: {
              action,
              expectedFingerprint: invalid.sourceFingerprint,
              idempotencyKey: `invalid-${action}`,
              editedTargets: action === 'edit' ? valid.evidence.priorTargets : null,
              reason: null,
            },
          }),
        ).rejects.toBeInstanceOf(store.WorkoutProgressionInvalidEditError);
      }
      expect(sql.prepare('SELECT * FROM scheduled_workout_exercise_sets').all()).toEqual(before);
      const held = await store.applyWorkoutProgressionAction({
        actor: { id: 'user-1', label: 'You', type: 'user' },
        userId: 'user-1',
        recommendationId: invalid.id,
        input: {
          action: 'hold',
          expectedFingerprint: invalid.sourceFingerprint,
          idempotencyKey: 'invalid-hold',
          editedTargets: null,
          reason: 'Review source prescription',
        },
      });
      expect(held.action).toBe('hold');
      expect(sql.prepare('SELECT * FROM scheduled_workout_exercise_sets').all()).toEqual(before);
      sql.close();
    },
  );

  it('distinguishes no completed history from missing policy and malformed prescriptions', async () => {
    const file = prepareDatabase();
    const sql = new Database(file);
    sql.exec('DELETE FROM session_sets');
    sql.close();
    const store = await loadStore();
    const result = (
      await store.previewWorkoutProgression({ scheduledWorkoutId: 'scheduled-1', userId: 'user-1' })
    )?.[0];
    expect(result).toMatchObject({
      confidence: 'unavailable',
      reasonCodes: ['NO_COMPLETED_HISTORY'],
      evidence: {
        policySource: { type: 'programming_config' },
        performance: [],
        sourceSessionId: null,
      },
    });
  });

  it('fails closed without an explicit programming policy and blocks target application', async () => {
    const databaseUrl = prepareDatabase();
    const lifecycleDb = new Database(databaseUrl);
    lifecycleDb
      .prepare("DELETE FROM workout_progression_configurations WHERE id = 'configuration-1'")
      .run();
    lifecycleDb.close();
    const store = await loadStore();
    const recommendation = (
      await store.previewWorkoutProgression({
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(recommendation).toMatchObject({
      confidence: 'unavailable',
      decision: 'hold',
      evidence: {
        policy: { family: 'unsupported' },
        policySource: { type: 'none' },
      },
      reasonCodes: expect.arrayContaining(['MISSING_POLICY']),
    });
    await expect(
      store.applyWorkoutProgressionAction({
        actor: { id: 'user-1', label: 'You', type: 'user' },
        input: {
          action: 'accept',
          editedTargets: null,
          expectedFingerprint: recommendation?.sourceFingerprint ?? '',
          idempotencyKey: 'missing-policy-accept',
          reason: null,
        },
        recommendationId: recommendation?.id ?? '',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(store.WorkoutProgressionInvalidEditError);
    const verificationDb = new Database(databaseUrl);
    expect(
      verificationDb.prepare('SELECT count(*) AS count FROM workout_progression_actions').get(),
    ).toEqual({ count: 0 });
    verificationDb.close();
  });

  it('previews deterministic evidence, reuses the same fingerprint, and enforces ownership', async () => {
    prepareDatabase();
    const store = await loadStore();

    const first = await store.previewWorkoutProgression({
      effectiveDate: '2026-08-24',
      generatedAt: 500,
      scheduledWorkoutId: 'scheduled-1',
      userId: 'user-1',
    });
    const repeated = await store.previewWorkoutProgression({
      effectiveDate: '2026-08-24',
      generatedAt: 900,
      scheduledWorkoutId: 'scheduled-1',
      userId: 'user-1',
    });

    expect(first).toHaveLength(1);
    expect(first?.[0]).toMatchObject({
      confidence: 'supported',
      decision: 'increase',
      effectiveDate: '2026-08-24',
      state: 'current',
    });
    expect(first?.[0]?.recommendedTargets.map((target) => target.weight)).toEqual([25, 25]);
    expect(first?.[0]?.evidence).toMatchObject({
      context: { availability: 'available', facts: [] },
      performance: [
        {
          reps: 10,
          setId: 'session-set-1',
          sourceScheduledSetId: 'source-scheduled-set-1',
          prescribed: { repsMax: 10, repsMin: 8, setId: 'session-set-1', weight: 20 },
        },
        {
          reps: 10,
          setId: 'session-set-2',
          sourceScheduledSetId: 'source-scheduled-set-2',
          prescribed: { repsMax: 10, repsMin: 8, setId: 'session-set-2', weight: 20 },
        },
      ],
      policySource: { configurationId: 'configuration-1', revision: 1 },
      priority: true,
    });
    expect(repeated?.[0]?.id).toBe(first?.[0]?.id);
    expect(
      await store.previewWorkoutProgression({
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-2',
      }),
    ).toBeUndefined();
  });

  it('marks corrected evidence stale and creates a distinct reproducible replacement', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const first = (
      await store.previewWorkoutProgression({
        effectiveDate: '2026-08-24',
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(first).toBeDefined();

    const correctionDb = new Database(databaseUrl);
    correctionDb.prepare("UPDATE session_sets SET reps = 8 WHERE id = 'session-set-2'").run();
    correctionDb.close();

    await expect(
      store.applyWorkoutProgressionAction({
        actor: { id: 'user-1', label: 'You', type: 'user' },
        input: {
          action: 'accept',
          editedTargets: null,
          expectedFingerprint: first?.sourceFingerprint ?? '',
          idempotencyKey: 'accept-corrected-1',
          reason: null,
        },
        now: 700,
        recommendationId: first?.id ?? '',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(store.WorkoutProgressionStaleError);

    expect(
      await store.getWorkoutProgressionRecommendation('user-1', first?.id ?? ''),
    ).toMatchObject({ state: 'stale' });
    const replacement = (
      await store.previewWorkoutProgression({
        effectiveDate: '2026-08-24',
        generatedAt: 800,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(replacement?.id).not.toBe(first?.id);
    expect(replacement).toMatchObject({ decision: 'hold', state: 'current' });
  });

  it('excludes legacy technique and false pain, then revisions explicit same-construct evidence', async () => {
    const databaseUrl = prepareDatabase();
    const rawDb = new Database(databaseUrl);
    const legacy = {
      energy: 3,
      recovery: 4,
      technique: 2,
      responses: [
        { id: 'session-rpe', label: 'Session RPE', type: 'scale' as const, value: 4 },
        { id: 'pain-discomfort', label: 'Any pain?', type: 'yes_no' as const, value: false },
      ],
    };
    rawDb
      .prepare('UPDATE workout_sessions SET feedback = ? WHERE id = ?')
      .run(JSON.stringify(legacy), 'session-1');
    const store = await loadStore();
    const preview = () =>
      store.previewWorkoutProgression({
        effectiveDate: '2026-08-24',
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      });
    const before = (await preview())?.[0];
    expect(
      before?.evidence.context.facts.filter((fact) => fact.source === 'session_feedback'),
    ).toEqual([]);
    const native = classifyNativeFeedback(
      {
        responses: [
          {
            id: 'technique-explicit',
            label: 'Technique',
            construct: 'technique',
            type: 'scale',
            value: 2,
          },
        ],
      },
      { classifiedAt: '2026-09-08T00:00:00.000Z', actor: { kind: 'user', id: 'user-1' } },
    );
    rawDb
      .prepare('UPDATE workout_sessions SET feedback = ? WHERE id = ?')
      .run(JSON.stringify(native), 'session-1');
    rawDb.close();
    const after = (await preview())?.[0];
    expect(after?.evidence.context.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'session_feedback', type: 'form_failure' }),
      ]),
    );
    expect(after?.sourceFingerprint).not.toBe(before?.sourceFingerprint);
    expect(
      await store.getWorkoutProgressionRecommendation('user-1', before?.id ?? ''),
    ).toMatchObject({ state: 'stale' });
  });

  it('fingerprints raw native RIR provenance and stales prior native RPE evidence', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const nativeRpe = (
      await store.previewWorkoutProgression({
        effectiveDate: '2026-08-24',
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(nativeRpe?.evidence.performance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effortSource: 'native_rpe', rir: null, rpe: 8 }),
      ]),
    );

    const correctionDb = new Database(databaseUrl);
    correctionDb
      .prepare("UPDATE session_sets SET rpe = NULL, rir = 2 WHERE session_id = 'session-1'")
      .run();
    correctionDb.close();

    const nativeRir = (
      await store.previewWorkoutProgression({
        effectiveDate: '2026-08-24',
        generatedAt: 600,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(nativeRir?.sourceFingerprint).not.toBe(nativeRpe?.sourceFingerprint);
    expect(nativeRir?.evidence.performance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effortSource: 'native_rir', rir: 2, rpe: null }),
      ]),
    );
    expect(
      await store.getWorkoutProgressionRecommendation('user-1', nativeRpe?.id ?? ''),
    ).toMatchObject({
      state: 'stale',
    });
  });

  it('applies accepted targets once and returns the same action for an idempotent replay', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const recommendation = (
      await store.previewWorkoutProgression({
        effectiveDate: '2026-08-24',
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(recommendation).toBeDefined();
    const input = {
      action: 'accept' as const,
      editedTargets: null,
      expectedFingerprint: recommendation?.sourceFingerprint ?? '',
      idempotencyKey: 'accept-recommendation-1',
      reason: null,
    };

    const firstAction = await store.applyWorkoutProgressionAction({
      actor: { id: 'agent-token-1', label: 'Coach agent', type: 'agent_token' },
      input,
      now: 600,
      recommendationId: recommendation?.id ?? '',
      userId: 'user-1',
    });
    const replay = await store.applyWorkoutProgressionAction({
      actor: { id: 'agent-token-1', label: 'Coach agent', type: 'agent_token' },
      input,
      now: 900,
      recommendationId: recommendation?.id ?? '',
      userId: 'user-1',
    });

    expect(replay).toEqual(firstAction);
    expect(firstAction.appliedTargets.map((target) => target.weight)).toEqual([25, 25]);
    expect(
      await store.getWorkoutProgressionRecommendation('user-1', recommendation?.id ?? ''),
    ).toMatchObject({ state: 'accepted' });
    expect(
      await store.previewWorkoutProgression({
        generatedAt: 950,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      }),
    ).toEqual([expect.objectContaining({ id: recommendation?.id, state: 'accepted' })]);

    const verificationDb = new Database(databaseUrl);
    expect(
      verificationDb
        .prepare(
          `SELECT set_number AS setNumber, target_weight AS targetWeight
           FROM scheduled_workout_exercise_sets ORDER BY set_number`,
        )
        .all(),
    ).toEqual([
      { setNumber: 1, targetWeight: 25 },
      { setNumber: 2, targetWeight: 25 },
    ]);
    expect(
      verificationDb.prepare('SELECT count(*) AS count FROM workout_progression_actions').get(),
    ).toEqual({ count: 1 });
    verificationDb.close();
  });

  it('stales a decided recommendation after source correction and creates one replacement', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const recommendation = (
      await store.previewWorkoutProgression({
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    await store.applyWorkoutProgressionAction({
      actor: { id: 'user-1', label: 'You', type: 'user' },
      input: {
        action: 'accept',
        editedTargets: null,
        expectedFingerprint: recommendation?.sourceFingerprint ?? '',
        idempotencyKey: 'accepted-before-correction',
        reason: null,
      },
      now: 600,
      recommendationId: recommendation?.id ?? '',
      userId: 'user-1',
    });

    const correctionDb = new Database(databaseUrl);
    correctionDb.prepare("UPDATE session_sets SET reps = 7 WHERE id = 'session-set-2'").run();
    correctionDb.close();

    expect(
      await store.getWorkoutProgressionRecommendation('user-1', recommendation?.id ?? ''),
    ).toMatchObject({ state: 'stale' });
    const replacement = await store.previewWorkoutProgression({
      generatedAt: 700,
      scheduledWorkoutId: 'scheduled-1',
      userId: 'user-1',
    });
    expect(replacement).toEqual([expect.objectContaining({ decision: 'hold', state: 'current' })]);
    expect(replacement?.[0]?.id).not.toBe(recommendation?.id);
  });

  it('rejects changed idempotency payloads and unbounded edits without writes', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const recommendation = (
      await store.previewWorkoutProgression({
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(recommendation).toBeDefined();

    await expect(
      store.applyWorkoutProgressionAction({
        actor: { id: 'user-1', label: 'You', type: 'user' },
        input: {
          action: 'edit',
          editedTargets:
            recommendation?.recommendedTargets.map((target) => ({ ...target, weight: 1_000 })) ??
            [],
          expectedFingerprint: recommendation?.sourceFingerprint ?? '',
          idempotencyKey: 'bounded-edit-1',
          reason: null,
        },
        recommendationId: recommendation?.id ?? '',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(store.WorkoutProgressionInvalidEditError);

    const invalidEdits = [
      recommendation?.recommendedTargets.map((target) => ({ ...target, repsMax: 1_000 })),
      recommendation?.recommendedTargets.map((target) => ({ ...target, repsMin: null })),
      recommendation?.recommendedTargets.map((target) => ({ ...target, weight: null })),
      recommendation?.recommendedTargets.map((target) => ({ ...target, zone: 2 })),
      recommendation?.recommendedTargets.map((target) => ({
        ...target,
        reps: 8,
        repsMax: 10,
        repsMin: 8,
      })),
      recommendation?.recommendedTargets.map((target) => ({ ...target, repsMax: 0 })),
    ];
    for (const [index, editedTargets] of invalidEdits.entries()) {
      await expect(
        store.applyWorkoutProgressionAction({
          actor: { id: 'user-1', label: 'You', type: 'user' },
          input: {
            action: 'edit',
            editedTargets: editedTargets ?? [],
            expectedFingerprint: recommendation?.sourceFingerprint ?? '',
            idempotencyKey: `invalid-edit-${index + 1}`,
            reason: null,
          },
          recommendationId: recommendation?.id ?? '',
          userId: 'user-1',
        }),
      ).rejects.toThrow();
    }

    const verificationDb = new Database(databaseUrl);
    expect(
      verificationDb.prepare('SELECT count(*) AS count FROM workout_progression_actions').get(),
    ).toEqual({ count: 0 });
    expect(
      verificationDb
        .prepare('SELECT max(target_weight) AS weight FROM scheduled_workout_exercise_sets')
        .get(),
    ).toEqual({ weight: 20 });
    verificationDb.close();
  });

  it('uses immutable source prescriptions when the future plan changes', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const first = (
      await store.previewWorkoutProgression({
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];

    const correctionDb = new Database(databaseUrl);
    correctionDb
      .prepare(
        `UPDATE scheduled_workout_exercise_sets
         SET reps_min = 12, reps_max = 15
         WHERE scheduled_workout_exercise_id = 'scheduled-exercise-1'`,
      )
      .run();
    correctionDb.close();

    expect(
      await store.getWorkoutProgressionRecommendation('user-1', first?.id ?? ''),
    ).toMatchObject({ state: 'stale' });
    const replacement = (
      await store.previewWorkoutProgression({
        generatedAt: 600,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(replacement).toMatchObject({ decision: 'increase', state: 'current' });
    expect(replacement?.evidence.performance.map((set) => set.prescribed.repsMax)).toEqual([
      10, 10,
    ]);
    expect(replacement?.evidence.priorTargets.map((target) => target.repsMax)).toEqual([15, 15]);
  });

  it('fingerprints exact scheduled-set identity and keeps policy stable across mutable tags', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const first = (
      await store.previewWorkoutProgression({
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    const correctionDb = new Database(databaseUrl);
    correctionDb
      .prepare(
        `UPDATE exercises
         SET name = 'Renamed incline press', tracking_type = 'reps_only', tags = '["rehab"]'
         WHERE id = 'exercise-1'`,
      )
      .run();
    correctionDb.close();
    expect(
      (
        await store.previewWorkoutProgression({
          generatedAt: 600,
          scheduledWorkoutId: 'scheduled-1',
          userId: 'user-1',
        })
      )?.[0]?.id,
    ).toBe(first?.id);

    const replacementDb = new Database(databaseUrl);
    replacementDb
      .prepare(`DELETE FROM scheduled_workout_exercise_sets WHERE id = 'scheduled-set-1'`)
      .run();
    replacementDb
      .prepare(
        `INSERT INTO scheduled_workout_exercise_sets (
          id, scheduled_workout_exercise_id, set_number, reps_min, reps_max, target_weight,
          created_at
        ) VALUES ('scheduled-set-1-recreated', 'scheduled-exercise-1', 1, 8, 10, 20, 700)`,
      )
      .run();
    replacementDb.close();
    const replacement = (
      await store.previewWorkoutProgression({
        generatedAt: 800,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(replacement?.id).not.toBe(first?.id);
    expect(replacement?.evidence.priorTargets.map((target) => target.setId)).toContain(
      'scheduled-set-1-recreated',
    );
  });

  it('fingerprints scheduled-set reorder, addition, and removal independently', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const preview = (generatedAt: number) =>
      store.previewWorkoutProgression({
        generatedAt,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      });
    const first = (await preview(500))?.[0];
    const mutationDb = new Database(databaseUrl);
    mutationDb
      .prepare(
        "UPDATE scheduled_workout_exercise_sets SET set_number = 3 WHERE id = 'scheduled-set-1'",
      )
      .run();
    mutationDb
      .prepare(
        "UPDATE scheduled_workout_exercise_sets SET set_number = 1 WHERE id = 'scheduled-set-2'",
      )
      .run();
    mutationDb
      .prepare(
        "UPDATE scheduled_workout_exercise_sets SET set_number = 2 WHERE id = 'scheduled-set-1'",
      )
      .run();
    const reordered = (await preview(600))?.[0];
    expect(reordered?.id).not.toBe(first?.id);

    mutationDb
      .prepare(
        `INSERT INTO scheduled_workout_exercise_sets (
          id, scheduled_workout_exercise_id, set_number, reps_min, reps_max, target_weight,
          created_at
        ) VALUES ('scheduled-set-3', 'scheduled-exercise-1', 3, 8, 10, 20, 650)`,
      )
      .run();
    const added = (await preview(700))?.[0];
    expect(added?.id).not.toBe(reordered?.id);

    mutationDb
      .prepare("DELETE FROM scheduled_workout_exercise_sets WHERE id = 'scheduled-set-3'")
      .run();
    mutationDb.close();
    const removed = (await preview(800))?.[0];
    expect(removed?.id).not.toBe(added?.id);
    expect(removed?.sourceFingerprint).toBe(reordered?.sourceFingerprint);
  });

  it('persists adverse context provenance and lets it override progression', async () => {
    prepareDatabase();
    const store = await loadStore();
    const configured = await store.configureWorkoutProgression({
      actor: { id: 'agent-token-1', label: 'Coach agent', type: 'agent_token' },
      input: {
        contextAvailability: 'available',
        contextFacts: [
          {
            detail: 'Pain was reported during the prior session.',
            source: 'programming_config',
            type: 'pain',
          },
        ],
        expectedRevision: 1,
        policy: {
          allowReduction: false,
          contextRequired: true,
          distanceStep: null,
          effortCeiling: 8,
          family: 'double_progression',
          loadIncrement: 5,
          loadIncreasePercent: null,
          lowEffortThreshold: 7,
          repRangeMax: 10,
          repRangeMin: 8,
          secondsStep: null,
          version: 1,
          zoneCeiling: null,
        },
        priority: true,
      },
      now: 550,
      scheduledWorkoutExerciseId: 'scheduled-exercise-1',
      userId: 'user-1',
    });
    expect(configured).toMatchObject({ actorId: 'agent-token-1', revision: 2 });
    expect(
      (
        await store.previewWorkoutProgression({
          generatedAt: 600,
          scheduledWorkoutId: 'scheduled-1',
          userId: 'user-1',
        })
      )?.[0],
    ).toMatchObject({
      decision: 'hold',
      evidence: {
        context: { facts: [{ source: 'programming_config', type: 'pain' }] },
        policySource: { actorId: 'agent-token-1', revision: 2 },
      },
      reasonCodes: ['PAIN_OR_SYMPTOMS'],
    });
  });

  it('binds idempotency replay to the recommendation and authorized actor identity', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const recommendation = (
      await store.previewWorkoutProgression({
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    const actor = { id: 'agent-token-1', label: 'Coach agent', type: 'agent_token' as const };
    const input = {
      action: 'keep' as const,
      editedTargets: null,
      expectedFingerprint: recommendation?.sourceFingerprint ?? '',
      idempotencyKey: 'actor-bound-replay-1',
      reason: null,
    };
    const first = await store.applyWorkoutProgressionAction({
      actor,
      input,
      now: 600,
      recommendationId: recommendation?.id ?? '',
      userId: 'user-1',
    });
    expect(
      await store.applyWorkoutProgressionAction({
        actor: { ...actor, label: 'Renamed coach token' },
        input,
        now: 700,
        recommendationId: recommendation?.id ?? '',
        userId: 'user-1',
      }),
    ).toEqual(first);
    await expect(
      store.applyWorkoutProgressionAction({
        actor: { id: 'agent-token-2', label: 'Other token', type: 'agent_token' },
        input,
        recommendationId: recommendation?.id ?? '',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(store.WorkoutProgressionIdempotencyConflictError);

    const correctionDb = new Database(databaseUrl);
    correctionDb.prepare("UPDATE session_sets SET reps = 9 WHERE id = 'session-set-2'").run();
    correctionDb.close();
    const replacement = (
      await store.previewWorkoutProgression({
        generatedAt: 800,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(replacement?.id).not.toBe(recommendation?.id);
    await expect(
      store.applyWorkoutProgressionAction({
        actor,
        input: { ...input, expectedFingerprint: replacement?.sourceFingerprint ?? '' },
        recommendationId: replacement?.id ?? '',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(store.WorkoutProgressionIdempotencyConflictError);
  });

  it('preserves decided audit evidence across schedule, session, and exercise purge lifecycles', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const recommendation = (
      await store.previewWorkoutProgression({
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    await store.applyWorkoutProgressionAction({
      actor: { id: 'user-1', label: 'You', type: 'user' },
      input: {
        action: 'keep',
        editedTargets: null,
        expectedFingerprint: recommendation?.sourceFingerprint ?? '',
        idempotencyKey: 'lifecycle-audit-keep',
        reason: null,
      },
      now: 600,
      recommendationId: recommendation?.id ?? '',
      userId: 'user-1',
    });

    const lifecycleDb = new Database(databaseUrl);
    lifecycleDb.prepare("DELETE FROM scheduled_workouts WHERE id = 'scheduled-1'").run();
    lifecycleDb.prepare("DELETE FROM workout_sessions WHERE id = 'session-1'").run();
    lifecycleDb.prepare("DELETE FROM exercises WHERE id = 'exercise-1'").run();
    lifecycleDb.close();

    expect(
      await store.getWorkoutProgressionRecommendation('user-1', recommendation?.id ?? ''),
    ).toMatchObject({
      evidence: {
        exerciseId: 'exercise-1',
        exerciseName: 'Incline press',
        sourceSessionId: 'session-1',
      },
      state: 'kept',
    });
    const verificationDb = new Database(databaseUrl);
    expect(verificationDb.pragma('foreign_key_check')).toEqual([]);
    expect(verificationDb.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    verificationDb.close();
  });

  it('supports source-session trash, restore, and purge without losing audit truth', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const recommendation = (
      await store.previewWorkoutProgression({
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(recommendation).toBeDefined();

    const lifecycleDb = new Database(databaseUrl);
    lifecycleDb
      .prepare(
        "UPDATE workout_sessions SET deleted_at = '2026-08-24T12:00:00.000Z' WHERE id = 'session-1'",
      )
      .run();
    expect(
      await store.getWorkoutProgressionRecommendation('user-1', recommendation?.id ?? ''),
    ).toMatchObject({ state: 'stale' });

    lifecycleDb
      .prepare("UPDATE workout_sessions SET deleted_at = NULL WHERE id = 'session-1'")
      .run();
    expect(
      await store.getWorkoutProgressionRecommendation('user-1', recommendation?.id ?? ''),
    ).toMatchObject({
      id: recommendation?.id,
      sourceFingerprint: recommendation?.sourceFingerprint,
      state: 'current',
    });

    await store.applyWorkoutProgressionAction({
      actor: { id: 'user-1', label: 'You', type: 'user' },
      input: {
        action: 'keep',
        editedTargets: null,
        expectedFingerprint: recommendation?.sourceFingerprint ?? '',
        idempotencyKey: 'trash-restore-purge',
        reason: null,
      },
      now: 600,
      recommendationId: recommendation?.id ?? '',
      userId: 'user-1',
    });
    lifecycleDb.prepare("DELETE FROM workout_sessions WHERE id = 'session-1'").run();
    lifecycleDb.close();

    expect(
      await store.getWorkoutProgressionRecommendation('user-1', recommendation?.id ?? ''),
    ).toMatchObject({
      evidence: { sourceSessionId: 'session-1' },
      state: 'kept',
    });
  });

  it('preserves progression snapshots and set identity through normal session updates', async () => {
    const databaseUrl = prepareDatabase();
    const sessionStore = await import('../workout-sessions/store.js');
    await sessionStore.updateWorkoutSession({
      id: 'session-1',
      userId: 'user-1',
      input: {
        completedAt: 500,
        date: '2026-08-20',
        duration: null,
        feedback: null,
        name: 'Upper',
        notes: 'Updated without replacing evidence',
        sets: [1, 2].map((setNumber) => ({
          completed: true,
          distance: null,
          exerciseId: 'exercise-1',
          notes: null,
          orderIndex: setNumber - 1,
          reps: 10,
          rpe: 8,
          section: 'main' as const,
          seconds: null,
          setNumber,
          skipped: false,
          supersetGroup: null,
          targetDistance: 3,
          targetSeconds: 999,
          targetWeight: 999,
          targetWeightMax: null,
          targetWeightMin: null,
          weight: 20,
          zone: null,
        })),
        startedAt: 300,
        status: 'completed',
        templateId: null,
        timeSegments: [],
      },
    });

    const verificationDb = new Database(databaseUrl);
    expect(
      verificationDb
        .prepare(
          `SELECT id, source_scheduled_set_id AS sourceScheduledSetId,
                  exercise_name_snapshot AS exerciseName,
                  tracking_type_snapshot AS trackingType,
                  target_reps_min AS targetRepsMin, target_reps_max AS targetRepsMax,
                  target_weight AS targetWeight, target_seconds AS targetSeconds,
                  target_distance AS targetDistance
           FROM session_sets WHERE session_id = 'session-1' ORDER BY set_number`,
        )
        .all(),
    ).toEqual([
      {
        exerciseName: 'Incline press',
        id: 'session-set-1',
        sourceScheduledSetId: 'source-scheduled-set-1',
        targetDistance: null,
        targetRepsMax: 10,
        targetRepsMin: 8,
        targetSeconds: null,
        targetWeight: 20,
        trackingType: 'weight_reps',
      },
      {
        exerciseName: 'Incline press',
        id: 'session-set-2',
        sourceScheduledSetId: 'source-scheduled-set-2',
        targetDistance: null,
        targetRepsMax: 10,
        targetRepsMin: 8,
        targetSeconds: null,
        targetWeight: 20,
        trackingType: 'weight_reps',
      },
    ]);
    verificationDb.close();

    const progressionStore = await loadStore();
    expect(
      await progressionStore.previewWorkoutProgression({
        generatedAt: 600,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      }),
    ).toEqual([expect.objectContaining({ decision: 'increase', state: 'current' })]);
  });

  it('preserves unmatched 0054 policy provenance while marking priority unavailable', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const current = (
      await store.previewWorkoutProgression({
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(current).toBeDefined();
    if (!current) return;
    const evidenceWithoutPriority = Object.fromEntries(
      Object.entries(current.evidence).filter(([key]) => key !== 'priority'),
    );
    const fingerprint = 'c'.repeat(64);
    const snapshot = {
      ...current,
      evidence: evidenceWithoutPriority,
      id: 'unmatched-0054-recommendation',
      sourceFingerprint: fingerprint,
    };
    const legacyDb = new Database(databaseUrl);
    legacyDb
      .prepare(
        `INSERT INTO workout_progression_recommendations (
          id, user_id, scheduled_workout_id, scheduled_workout_exercise_id, exercise_id,
          source_session_id, policy_family, policy_version, source_fingerprint, effective_date,
          snapshot, generated_at
        ) VALUES ('unmatched-0054-recommendation', 'user-1', 'scheduled-1',
          'scheduled-exercise-1', 'exercise-1', 'session-1', 'double_progression', 1, ?,
          '2026-08-24', ?, 401)`,
      )
      .run(fingerprint, JSON.stringify(snapshot));
    legacyDb.close();

    expect(
      await store.getWorkoutProgressionRecommendation('user-1', 'unmatched-0054-recommendation'),
    ).toMatchObject({
      evidence: {
        policySource: { configurationId: 'configuration-1', revision: 1 },
        priority: null,
      },
      state: 'stale',
    });
  });

  it('enriches pre-0059 effort facts without downgrading 0054 snapshot provenance', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const current = (
      await store.previewWorkoutProgression({
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(current).toBeDefined();
    if (!current) return;

    const legacyPerformance = current.evidence.performance.map((set) => {
      const pre0059Set = { ...set } as Record<string, unknown>;
      delete pre0059Set.effortSource;
      delete pre0059Set.rir;
      return pre0059Set;
    });
    const fingerprint = 'd'.repeat(64);
    const snapshot = {
      ...current,
      evidence: { ...current.evidence, performance: legacyPerformance },
      id: 'pre-0059-recommendation',
      sourceFingerprint: fingerprint,
    };
    const legacyDb = new Database(databaseUrl);
    legacyDb
      .prepare(
        `INSERT INTO workout_progression_recommendations (
          id, user_id, scheduled_workout_id, scheduled_workout_exercise_id, exercise_id,
          source_session_id, policy_family, policy_version, source_fingerprint, effective_date,
          snapshot, generated_at
        ) VALUES ('pre-0059-recommendation', 'user-1', 'scheduled-1',
          'scheduled-exercise-1', 'exercise-1', 'session-1', 'double_progression', 1, ?,
          '2026-08-24', ?, 402)`,
      )
      .run(fingerprint, JSON.stringify(snapshot));
    legacyDb.close();

    const restored = await store.getWorkoutProgressionRecommendation(
      'user-1',
      'pre-0059-recommendation',
    );
    expect(restored).not.toBeNull();
    expect(restored?.evidence.performance).toEqual(
      current.evidence.performance.map((set) => ({
        ...set,
        effortSource: set.rpe === null ? 'none' : 'native_rpe',
        rir: null,
      })),
    );
    expect(restored?.evidence.context).toEqual(current.evidence.context);
    expect(restored?.evidence.policy).toEqual(current.evidence.policy);
    expect(restored?.evidence.policySource).toEqual(current.evidence.policySource);
    expect(restored?.evidence.priority).toEqual(current.evidence.priority);
    expect(restored?.evidence.priorTargets).toEqual(current.evidence.priorTargets);
    expect(restored?.recommendedTargets).toEqual(current.recommendedTargets);
  });

  it('keeps pre-0054 immutable recommendation snapshots readable after upgrade', async () => {
    const databaseUrl = prepareDatabase();
    const store = await loadStore();
    const current = (
      await store.previewWorkoutProgression({
        generatedAt: 500,
        scheduledWorkoutId: 'scheduled-1',
        userId: 'user-1',
      })
    )?.[0];
    expect(current).toBeDefined();
    const legacy = {
      ...current,
      evidence: {
        ...current?.evidence,
        context: undefined,
        performance: current?.evidence.performance.map((set) =>
          Object.fromEntries(
            Object.entries(set).filter(
              ([key]) => key !== 'prescribed' && key !== 'sourceScheduledSetId',
            ),
          ),
        ),
        policy: current
          ? Object.fromEntries(
              Object.entries(current.evidence.policy).filter(([key]) => key !== 'contextRequired'),
            )
          : {},
        policySource: undefined,
        priorTargets: current?.evidence.priorTargets.map((target) =>
          Object.fromEntries(Object.entries(target).filter(([key]) => key !== 'setId')),
        ),
      },
      id: 'legacy-recommendation',
      recommendedTargets: current?.recommendedTargets.map((target) =>
        Object.fromEntries(Object.entries(target).filter(([key]) => key !== 'setId')),
      ),
      sourceFingerprint: 'b'.repeat(64),
    };
    const legacyDb = new Database(databaseUrl);
    legacyDb
      .prepare(
        `INSERT INTO workout_progression_recommendations (
          id, user_id, scheduled_workout_id, scheduled_workout_exercise_id, exercise_id,
          source_session_id, policy_family, policy_version, source_fingerprint, effective_date,
          snapshot, generated_at
        ) VALUES ('legacy-recommendation', 'user-1', 'scheduled-1', 'scheduled-exercise-1',
          'exercise-1', 'session-1', 'double_progression', 1, ?, '2026-08-24', ?, 400)`,
      )
      .run('b'.repeat(64), JSON.stringify(legacy));
    legacyDb.close();

    const parsedLegacy = await store.getWorkoutProgressionRecommendation(
      'user-1',
      'legacy-recommendation',
    );
    expect(parsedLegacy).toMatchObject({
      evidence: {
        context: { availability: 'unavailable', facts: [] },
        policySource: { type: 'none' },
      },
      id: 'legacy-recommendation',
      state: 'stale',
    });
    expect(parsedLegacy?.evidence.performance[0]?.prescribed).toMatchObject({ weight: null });
  });
});
