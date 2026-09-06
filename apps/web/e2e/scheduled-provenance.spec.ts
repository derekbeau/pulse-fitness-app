import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test, request, type APIRequestContext } from '@playwright/test';
import type { ScheduledWorkoutDetail, WorkoutSession } from '@pulse/shared';

const apiURL = process.env.API_BASE_URL ?? '';
const database = process.env.E2E_DATABASE_URL ?? '';
const now = '2026-09-07T03:59:00Z'; // Detroit Sep 6; browser and UTC already Sep 7.
const day = '2026-09-06';

async function call<T>(
  api: APIRequestContext,
  method: string,
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await api.fetch(`/api/v1/${path}`, { method, data });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBeTruthy();
  return (await response.json()).data as T;
}

function readDatabase(scheduleId: string, sessionId: string) {
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `
import json, sqlite3, sys
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
queries={
 'session': ('select * from workout_sessions where id=?',sys.argv[3]),
 'schedule': ('select * from scheduled_workouts where id=?',sys.argv[2]),
 'sets': ('select * from session_sets where session_id=? order by source_scheduled_set_id',sys.argv[3]),
 'source': ('select s.*, e.exercise_id, e.section, e.order_index, e.superset_group, e.exercise_name_snapshot, e.tracking_type_snapshot from scheduled_workout_exercise_sets s join scheduled_workout_exercises e on e.id=s.scheduled_workout_exercise_id where e.scheduled_workout_id=? order by s.id',sys.argv[2])}
print(json.dumps({k:[dict(r) for r in c.execute(q,(v,))] for k,(q,v) in queries.items()}))
`,
        database,
        scheduleId,
        sessionId,
      ],
      { encoding: 'utf8' },
    ),
  );
}

for (const scenario of [
  { surface: 'list', identical: false, early: false, mobile: false },
  { surface: 'calendar', identical: false, early: false, mobile: false },
  { surface: 'dashboard', identical: false, early: false, mobile: false },
  { surface: 'detail', identical: false, early: true, mobile: false },
  { surface: 'list', identical: true, early: false, mobile: true },
] as const) {
  test(`${scenario.surface}: ${scenario.identical ? 'identical visible 20-set' : 'structural divergence'}${scenario.early ? ' early' : ''}${scenario.mobile ? ' mobile' : ''}`, async ({
    page,
  }, testInfo) => {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (process.env.TESTED_CODE_SHA) expect(sha).toBe(process.env.TESTED_CODE_SHA);
    const unauth = await request.newContext({ baseURL: apiURL });
    const registered = await call<{ token: string }>(unauth, 'POST', 'auth/register', {
      username: `p134-${Date.now()}`,
      password: 'disposable-test-password',
      timeZone: 'America/Detroit',
    });
    await unauth.dispose();
    const api = await request.newContext({
      baseURL: apiURL,
      extraHTTPHeaders: { Authorization: `Bearer ${registered.token}` },
    });
    try {
      const authority = await call<{ localDate: string; timeZone: string }>(
        api,
        'GET',
        'adaptive-nutrition',
      );
      expect(authority).toMatchObject({ localDate: day, timeZone: 'America/Detroit' });
      const ids: string[] = [];
      for (const name of ['Leg Extension', 'Leg Curl', 'Hip Flexion', 'Dead Bug', 'Removed Row']) {
        ids.push(
          (
            await call<{ id: string }>(api, 'POST', 'exercises', {
              name,
              category: 'isolation',
              muscleGroups: ['legs'],
              equipment: 'cable',
              trackingType: 'weight_reps',
            })
          ).id,
        );
      }
      const templateName = `Snapshot ${scenario.surface}`;
      const sections = [
        {
          type: 'main',
          exercises: ids.slice(0, 4).map((exerciseId) => ({
            exerciseId,
            sets: 5,
            repsMin: 8,
            repsMax: 8,
            tempo: '2111',
            restSeconds: 60,
            cues: [],
          })),
        },
      ];
      const template = await call<{ id: string }>(api, 'POST', 'workout-templates', {
        name: templateName,
        sections,
        tags: [],
      });
      let schedule = await call<ScheduledWorkoutDetail>(api, 'POST', 'scheduled-workouts', {
        templateId: template.id,
        date: scenario.early ? '2026-09-07' : day,
      });
      if (!scenario.identical) {
        schedule = await call(api, 'PATCH', `scheduled-workouts/${schedule.id}/exercise-swap`, {
          fromExerciseId: ids[0],
          toExerciseId: ids[4],
          preserveSets: true,
        });
        schedule = await call(api, 'PATCH', `scheduled-workouts/${schedule.id}/exercise-swap`, {
          fromExerciseId: ids[3],
          toExerciseId: null,
        });
        schedule = await call(api, 'PATCH', `scheduled-workouts/${schedule.id}/reorder`, {
          order: [ids[2], ids[4], ids[1]],
        });
        schedule = await call(api, 'PATCH', `scheduled-workouts/${schedule.id}/exercise-sets`, {
          exerciseId: ids[1],
          sets: [
            { setNumber: 5, remove: true },
            { setNumber: 1, reps: null, repsMin: null, repsMax: null, targetWeight: null },
            { setNumber: 6, reps: 9, targetWeight: 42 },
          ],
        });
      }
      schedule = await call(api, 'PATCH', `scheduled-workouts/${schedule.id}/exercises`, {
        updates: schedule.exercises.map((exercise, i) => ({
          exerciseId: exercise.exerciseId,
          programmingNotes: i === 0 ? null : `Programming recovery gate ${i}`,
          tempo: i === 0 ? null : '3110',
          restSeconds: i === 0 ? null : 75,
          supersetGroup: i < 2 ? 'pair-a' : null,
        })),
      });
      const agent = await call<{ token: string }>(api, 'POST', 'agent-tokens', {
        name: 'Disposable proof',
      });
      const agentApi = await request.newContext({
        baseURL: apiURL,
        extraHTTPHeaders: { Authorization: `AgentToken ${agent.token}` },
      });
      schedule = await call(agentApi, 'PATCH', `scheduled-workouts/${schedule.id}/exercise-notes`, {
        notes: schedule.exercises.map((exercise, i) => ({
          exerciseId: exercise.exerciseId,
          agentNotes: i === 0 ? null : `Fictional coaching ${i}`,
        })),
      });
      await agentApi.dispose();
      if (!scenario.identical) {
        await call(api, 'PUT', `workout-templates/${template.id}`, {
          name: templateName,
          tags: [],
          sections: [
            {
              type: 'main',
              exercises: [
                {
                  exerciseId: ids[3],
                  sets: 12,
                  repsMin: 15,
                  repsMax: 20,
                  tempo: '9999',
                  restSeconds: 180,
                  cues: [],
                },
              ],
            },
            {
              type: 'supplemental',
              exercises: [{ exerciseId: ids[0], sets: 2, repsMin: 10, repsMax: 10, cues: [] }],
            },
          ],
        });
      }
      schedule = await call(api, 'GET', `scheduled-workouts/${schedule.id}`);
      if (scenario.mobile) await page.setViewportSize({ width: 375, height: 812 });
      await page.clock.setFixedTime(new Date(now));
      await page.addInitScript(
        (token) => localStorage.setItem('pulse-auth-token', token),
        registered.token,
      );
      await page.goto(`/workouts/scheduled/${schedule.id}`);
      await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('scheduled-detail.png'), fullPage: true });
      const captured: unknown[] = [];
      page.on('request', (req) => {
        if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/v1/workout-sessions')
          captured.push(req.postDataJSON());
      });
      if (scenario.surface === 'list') {
        await page.goto('/workouts?view=list');
        await page.getByRole('button', { name: 'Start', exact: true }).click();
      } else if (scenario.surface === 'calendar') {
        await page.goto('/workouts?view=calendar');
        await page.getByRole('button', { name: 'Start', exact: true }).click();
      } else {
        if (scenario.surface === 'dashboard') {
          await page.goto('/');
          await page.locator(`a[href*="/workouts/scheduled/${schedule.id}"]`).first().click();
        }
        await page.getByRole('button', { name: 'Start workout', exact: true }).click();
        if (scenario.early)
          await page.getByRole('button', { name: 'Start now', exact: true }).click();
      }
      await expect(page).toHaveURL(/sessionId=/);
      const sessionId = new URL(page.url()).searchParams.get('sessionId') ?? '';
      const session = await call<WorkoutSession>(api, 'GET', `workout-sessions/${sessionId}`);
      const linked = await call<ScheduledWorkoutDetail>(
        api,
        'GET',
        `scheduled-workouts/${schedule.id}`,
      );
      expect(session.scheduledWorkoutId).toBe(schedule.id);
      expect(linked.sessionId).toBe(session.id);
      expect(session.date).toBe(schedule.date);
      expect(captured).toHaveLength(1);
      expect(captured[0]).toMatchObject({ scheduledWorkoutId: schedule.id, date: day });
      expect(captured[0]).not.toHaveProperty('templateId');
      expect(captured[0]).not.toHaveProperty('sets');
      expect(session.sets).toHaveLength(
        schedule.exercises.reduce((n, ex) => n + ex.sets.length, 0),
      );
      if (scenario.identical) expect(session.sets).toHaveLength(20);
      for (const exercise of schedule.exercises) {
        const actual = session.exercises?.find(
          (row) => row.exerciseId === exercise.exerciseId && row.section === exercise.section,
        );
        expect(actual).toMatchObject({
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName,
          section: exercise.section,
          orderIndex: exercise.orderIndex,
          programmingNotes: exercise.programmingNotes,
          agentNotes: exercise.agentNotes,
          agentNotesMeta: exercise.agentNotesMeta,
          supersetGroup: exercise.supersetGroup,
          tempo: exercise.tempo,
          restSeconds: exercise.restSeconds,
        });
        for (const set of exercise.sets) {
          expect(actual?.sets.find((row) => row.setNumber === set.setNumber)).toMatchObject({
            targetReps: set.reps,
            targetRepsMin: set.repsMin,
            targetRepsMax: set.repsMax,
            targetWeight: set.targetWeight,
            targetWeightMin: set.targetWeightMin,
            targetWeightMax: set.targetWeightMax,
            targetSeconds: set.targetSeconds,
            targetDistance: set.targetDistance,
            targetZone: set.targetZone,
          });
        }
      }
      const db = readDatabase(schedule.id, session.id);
      expect(db.session[0].scheduled_workout_id).toBe(schedule.id);
      expect(db.schedule[0].session_id).toBe(session.id);
      expect(db.sets).toHaveLength(db.source.length);
      for (const source of db.source) {
        const row = db.sets.find(
          (set: { source_scheduled_set_id: string }) => set.source_scheduled_set_id === source.id,
        );
        expect(row).toMatchObject({
          source_scheduled_set_id: source.id,
          exercise_id_snapshot: source.exercise_id,
          exercise_name_snapshot: source.exercise_name_snapshot,
          tracking_type_snapshot: source.tracking_type_snapshot,
          set_number: source.set_number,
          section: source.section,
          order_index: source.order_index,
          superset_group: source.superset_group,
          target_reps: source.reps,
          target_reps_min: source.reps_min,
          target_reps_max: source.reps_max,
          target_weight: source.target_weight,
          target_weight_min: source.target_weight_min,
          target_weight_max: source.target_weight_max,
          target_seconds: source.target_seconds,
          target_distance: source.target_distance,
          target_zone: source.target_zone,
        });
      }
      for (const exercise of schedule.exercises) {
        const key = `${exercise.section}::${exercise.exerciseId}`;
        expect(JSON.parse(db.session[0].exercise_programming_notes)[key]).toBe(
          exercise.programmingNotes,
        );
        expect(JSON.parse(db.session[0].exercise_agent_notes)[key]).toBe(exercise.agentNotes);
        expect(JSON.parse(db.session[0].exercise_agent_notes_meta)[key]).toEqual(
          exercise.agentNotesMeta,
        );
        expect(JSON.parse(db.session[0].exercise_prescriptions)[key]).toMatchObject({
          tempo: exercise.tempo,
          restSeconds: exercise.restSeconds,
        });
        const source = db.source.find(
          (row: { exercise_id: string }) => row.exercise_id === exercise.exerciseId,
        );
        expect(
          session.exercises?.find((row) => row.exerciseId === exercise.exerciseId)
            ?.sourceScheduledExerciseId,
        ).toBe(source.scheduled_workout_exercise_id);
      }
      const initialSessions = await call<Array<{ id: string }>>(
        api,
        'GET',
        `workout-sessions?from=${day}&to=2026-09-07`,
      );
      expect(initialSessions.map((row) => row.id)).toEqual([session.id]);
      await page.reload();
      await expect(page.getByRole('heading', { name: templateName, exact: true })).toBeVisible();
      expect(await call(api, 'GET', `workout-sessions/${sessionId}`)).toEqual(session);
      await page.screenshot({ path: testInfo.outputPath('active-refreshed.png'), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const restarts: unknown[] = [];
      if (scenario.surface === 'list' && !scenario.identical) {
        let previousSessionId = session.id;
        const normalize = (value: WorkoutSession) => ({
          date: value.date,
          scheduledWorkoutId: value.scheduledWorkoutId,
          exercises: value.exercises?.map((exercise) => ({
            ...exercise,
            sets: exercise.sets.map((set) =>
              Object.fromEntries(
                Object.entries(set).filter(([key]) => key !== 'id' && key !== 'createdAt'),
              ),
            ),
          })),
        });
        for (const surface of ['calendar', 'dashboard', 'detail']) {
          await call(api, 'POST', `workout-sessions/${previousSessionId}/cancel`);
          if (surface === 'calendar') {
            await page.goto('/workouts?view=calendar');
            await page.getByRole('button', { name: 'Start', exact: true }).click();
          } else {
            if (surface === 'dashboard') {
              await page.goto('/');
              await page.locator(`a[href*="/workouts/scheduled/${schedule.id}"]`).first().click();
            } else await page.goto(`/workouts/scheduled/${schedule.id}`);
            await page.getByRole('button', { name: 'Start workout', exact: true }).click();
          }
          await expect(page).toHaveURL(/sessionId=/);
          const nextId = new URL(page.url()).searchParams.get('sessionId') ?? '';
          const next = await call<WorkoutSession>(api, 'GET', `workout-sessions/${nextId}`);
          expect(normalize(next)).toEqual(normalize(session));
          const nextDb = readDatabase(schedule.id, nextId);
          expect(nextDb.schedule[0].session_id).toBe(nextId);
          expect(nextDb.session[0].scheduled_workout_id).toBe(schedule.id);
          expect(
            nextDb.sets.map(
              (set: { source_scheduled_set_id: string }) => set.source_scheduled_set_id,
            ),
          ).toEqual(
            db.sets.map((set: { source_scheduled_set_id: string }) => set.source_scheduled_set_id),
          );
          await page.reload();
          await page.screenshot({
            path: testInfo.outputPath(`same-schedule-${surface}.png`),
            fullPage: true,
          });
          restarts.push({ surface, session: next, db: nextDb });
          previousSessionId = nextId;
        }
      }
      if (scenario.identical) {
        await call(api, 'POST', `workout-sessions/${session.id}/cancel`);
        await page.goto(`/workouts/template/${template.id}`);
        await page.getByRole('button', { name: 'Start Workout', exact: true }).click();
        await page.getByRole('button', { name: 'Create another anyway', exact: true }).click();
        await expect(page).toHaveURL(/sessionId=/);
        const duplicateId = new URL(page.url()).searchParams.get('sessionId') ?? '';
        const duplicate = await call<WorkoutSession>(api, 'GET', `workout-sessions/${duplicateId}`);
        expect(duplicate.scheduledWorkoutId ?? null).toBeNull();
        expect(
          (await call<ScheduledWorkoutDetail>(api, 'GET', `scheduled-workouts/${schedule.id}`))
            .sessionId,
        ).toBeNull();
        const duplicateDb = readDatabase(schedule.id, duplicateId);
        expect(duplicateDb.session[0].scheduled_workout_id).toBeNull();
        expect(duplicateDb.schedule[0].session_id).toBeNull();
        expect(
          duplicateDb.sets.every(
            (set: { source_scheduled_set_id: string | null }) =>
              set.source_scheduled_set_id === null,
          ),
        ).toBe(true);
        restarts.push({ independentDuplicate: duplicate, db: duplicateDb });
      }
      writeFileSync(
        testInfo.outputPath('readback.json'),
        JSON.stringify({ sha, scenario, captured, schedule, session, db, restarts }, null, 2),
      );
    } finally {
      await api.dispose();
    }
  });
}
