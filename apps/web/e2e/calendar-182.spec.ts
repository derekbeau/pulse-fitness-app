import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, request, test } from '@playwright/test';
import { setAuthenticatedSession } from './auth-session';
import { apiBaseURL } from './test-env';

const source = JSON.stringify({
  class: 'user_observation',
  sourceId: 'fictional-browser-182',
  sourceLabel: 'Fictional browser fixture',
  sourceOccurredAt: '2026-03-08T07:00:00.000Z',
  uncertainty: 'known',
  freshness: { state: 'current', asOf: '2026-03-08T07:00:00.000Z', reasons: [] },
  capturedAt: '2026-03-08T07:00:00.000Z',
  capturedBy: { kind: 'user', id: 'fixture', label: null },
});
const actor = JSON.stringify({ kind: 'user', id: 'fixture', label: null });
const database = process.env.E2E_DATABASE_URL;
function fixtureFile(userId: string) {
  if (!database || !/^pulse-calendar-182-[\w-]+\.db$/u.test(basename(database)))
    throw new Error('Explicit isolated calendar fixture database required');
  const file = resolve(database);
  if (!file.startsWith('/private/tmp/') && !file.startsWith('/tmp/'))
    throw new Error('Fixture database must be in tmp');
  if (realpathSync(file) !== file) throw new Error('Fixture database must not be a symlink');
  if (!/^[\da-f-]{36}$/u.test(userId)) throw new Error('Unexpected fixture owner id');
  return file;
}
function seed(userId: string) {
  const file = fixtureFile(userId);
  const python = `import sqlite3,sys\ndb=sqlite3.connect(sys.argv[1]); u=sys.argv[2]; source=sys.argv[3]; actor=sys.argv[4]\nwith db:\n db.execute("insert into canonical_activities (id,user_id,kind,name,source_json,actor_json,revision,current_revision_id,created_at,updated_at) values ('browser-walk',?,'walking','Fictional walk',?,?,1,'walk-r1','2026-03-08T00:00:00.000Z','2026-03-08T00:00:00.000Z')",(u,source,actor))\n db.execute("insert into activity_assignments (id,user_id,activity_id,planned_local_date,time_zone,revision,current_revision_id,state,created_at,updated_at) values ('browser-plan',?,'browser-walk','2026-03-10','America/Detroit',1,'plan-r1','planned','2026-03-08T00:00:00.000Z','2026-03-08T00:00:00.000Z')",(u,))\n db.execute("insert into activity_executions (id,user_id,activity_id,assignment_id,actual_occurred_at,actual_local_date,time_zone,outcome,source_json,revision,current_revision_id,created_at,updated_at) values ('browser-actual',?,'browser-walk','browser-plan','2026-03-12T23:30:00.000-04:00','2026-03-12','America/Detroit','completed',?,1,'actual-r1','2026-03-13T03:30:00.000Z','2026-03-13T03:30:00.000Z')",(u,source))\n db.execute("insert into scheduled_workouts (id,user_id,date,created_at,updated_at) values ('browser-schedule',?,'2026-03-10',1000,1000)",(u,))\n db.execute("insert into workout_sessions (id,user_id,name,date,status,started_at,completed_at,duration,time_segments,created_at,updated_at) values ('browser-session',?,'Fictional lift','2026-03-12','completed',1000,2000,60,'[]',1000,2000)",(u,))\n db.execute("insert into journal_entries (id,user_id,date,title,type,content,created_by,created_at,updated_at) values ('browser-journal',?,'2026-03-12','Fictional journal','observation','Fixture text','user',1000,1000)",(u,))\n db.execute("insert into nutrition_logs (id,user_id,date,status,status_updated_at,created_at,updated_at) values ('browser-zero',?,'2026-03-12','complete',1000,1000,1000)",(u,))\n db.execute("insert into nutrition_logs (id,user_id,date,status,status_updated_at,created_at,updated_at) values ('browser-meal-log',?,'2026-03-13','partial',1000,1000,1000)",(u,))\n db.execute("insert into meals (id,nutrition_log_id,name,created_at,updated_at) values ('browser-meal','browser-meal-log','Fictional meal',1000,1000)")\n db.execute("insert into meal_items (id,meal_id,name,amount,unit,calories,protein,carbs,fat,created_at) values ('browser-meal-item','browser-meal','Fictional food',1,'serving',640,35,65,24,1000)")\n db.execute("insert into nutrition_targets (id,user_id,calories,protein,carbs,fat,source,macro_calories,effective_date,created_at,updated_at) values ('browser-target',?,2000,100,250,60,'manual',1940,'2026-03-08',1000,1000)",(u,))\n db.execute("insert into nutrition_target_events (id,target_id,user_id,sequence,effective_date,calories,protein,carbs,fat,macro_calories,source,event_type,recorded_at,created_at) values ('browser-event','browser-target',?,1,'2026-03-08',2000,100,250,60,1940,'manual','manual_write',1000,1000)",(u,))\n db.execute("insert into body_context_concerns (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,current_revision_id,created_at,updated_at) values ('browser-concern',?,'Fictional shoulder','shoulder','affirmed','active',?,1,'concern-r1','2026-03-08T00:00:00.000Z','2026-03-08T00:00:00.000Z')",(u,source))\n db.execute("insert into body_context_flares (id,concern_id,user_id,occurred_at,local_date,time_zone,observation,source_json,created_at) values ('browser-flare','browser-concern',?,'2026-03-08T03:30:00.000-04:00','2026-03-08','America/Detroit','Fictional flare',?,'2026-03-08T07:30:00.000Z')",(u,source))\n`;
  execFileSync('python3', ['-c', python, file, userId, source, actor]);
}

function seedConnectedHistory(userId: string) {
  const file = fixtureFile(userId);
  const python = `import sqlite3,sys
db=sqlite3.connect(sys.argv[1]); u=sys.argv[2]; source=sys.argv[3]; actor=sys.argv[4]
with db:
 db.execute("insert into canonical_activities (id,user_id,kind,name,source_json,actor_json,revision,current_revision_id,created_at,updated_at) values ('connected-walk',?,'walking','Fictional connected walk',?,?,1,'connected-walk-r1','2026-03-08T00:00:00.000Z','2026-03-08T00:00:00.000Z')",(u,source,actor))
 db.execute("insert into activity_assignments (id,user_id,activity_id,planned_local_date,time_zone,revision,current_revision_id,state,created_at,updated_at) values ('connected-plan',?,'connected-walk','2026-03-10','America/Detroit',1,'connected-plan-r1','planned','2026-03-08T00:00:00.000Z','2026-03-08T00:00:00.000Z')",(u,))
 db.execute("insert into activity_assignment_revisions (id,assignment_id,user_id,revision,planned_local_date,time_zone,state,actor_json,created_at) values ('connected-plan-r1','connected-plan',?,1,'2026-03-10','America/Detroit','planned',?,'2026-03-08T00:00:00.000Z')",(u,actor))
 db.execute("insert into activity_executions (id,user_id,activity_id,assignment_id,actual_occurred_at,actual_local_date,time_zone,outcome,source_json,revision,current_revision_id,created_at,updated_at) values ('connected-actual',?,'connected-walk','connected-plan','2026-03-12T23:30:00.000-04:00','2026-03-12','America/Detroit','completed',?,1,'connected-actual-r1','2026-03-13T03:30:00.000Z','2026-03-13T03:30:00.000Z')",(u,source))
`;
  execFileSync('python3', ['-c', python, file, userId, source, actor]);
}

test('populated Calendar and workout-only identities on desktop and mobile', async ({ page }) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const username = `calendar182-${Date.now()}`;
  const registration = await api.post('/api/v1/auth/register', {
    data: { username, password: 'fictional-calendar-password', timeZone: 'America/Detroit' },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();
  const { token, user } = (await registration.json()).data as {
    token: string;
    user: { id: string };
  };
  seed(user.id); // Isolated fixture DB injection, not an API bypass claim.
  const calendar = await api.get('/api/v1/calendar?from=2026-03-08&to=2026-03-15', {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(calendar.ok(), await calendar.text()).toBeTruthy();
  const body = (await calendar.json()).data as {
    items: Array<{
      id: string;
      domain: string;
      localDate: string;
      nutrition?: { actual: unknown; target: unknown };
    }>;
  };
  expect(body.items.find((item) => item.id === 'browser-plan')?.localDate).toBe('2026-03-10');
  expect(body.items.find((item) => item.id === 'browser-actual')?.localDate).toBe('2026-03-12');
  expect(
    body.items.find((item) => item.id === 'nutrition-day:2026-03-11')?.nutrition?.actual,
  ).toBeNull();
  expect(body.items.find((item) => item.id === 'browser-zero')?.nutrition?.actual).toBeTruthy();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await setAuthenticatedSession(page, token);
  await page.goto('/calendar', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Calendar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /2026-03-10/ })).toBeVisible();
  await page.getByRole('button', { name: 'Agenda' }).click();
  await expect(page.locator('[data-record-id="browser-plan"]')).toBeVisible();
  await expect(page.locator('[data-record-id="browser-actual"]')).toBeVisible();
  await expect(page.locator('[data-record-id="browser-flare"]')).toBeVisible();
  await expect(page.locator('[data-record-id="browser-journal"]')).toBeVisible();
  await expect(page.locator('[data-record-id="browser-zero"]')).toBeVisible();
  await expect(page.locator('[data-record-id="browser-zero"]')).toContainText(
    'Actual: 0 kcal · 0 g protein · 0 g carbs · 0 g fat',
  );
  await expect(page.locator('[data-record-id="browser-zero"]')).toContainText(
    'Target: 2,000 kcal · 100 g protein · 250 g carbs · 60 g fat',
  );
  await expect(page.locator('[data-record-id="browser-meal-log"]')).toContainText(
    'Actual: 640 kcal · 35 g protein · 65 g carbs · 24 g fat',
  );
  await expect(page.locator('[data-record-id="nutrition-day:2026-03-11"]')).toContainText(
    'Actual: intake unknown',
  );
  await expect(page.locator('[data-record-id="browser-schedule"]')).toHaveAttribute(
    'href',
    '/workouts/scheduled/browser-schedule',
  );
  await expect(page.locator('[data-record-id="browser-session"]')).toHaveAttribute(
    'href',
    '/workouts/session/browser-session',
  );
  await page.screenshot({
    path: test.info().outputPath('calendar-agenda-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Workouts', exact: true }).click();
  await expect(page.locator('[data-record-id="browser-plan"]')).toHaveCount(0);
  await expect(page.locator('[data-record-id="browser-schedule"]')).toBeVisible();
  await page.getByRole('button', { name: 'Planned', exact: true }).click();
  await expect(page.locator('[data-record-id="browser-session"]')).toHaveCount(0);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(
    page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Calendar' }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('calendar-mobile.png'), fullPage: true });
  await page.goto('/workouts?view=calendar', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible();
  await page
    .locator('section[aria-label="Monthly workout calendar"] [aria-label^="Tuesday, March 10"]')
    .click();
  await expect(
    page.locator('#workout-day-details [data-record-id="browser-schedule"]'),
  ).toBeVisible();
  await page
    .locator('section[aria-label="Monthly workout calendar"] [aria-label^="Thursday, March 12"]')
    .click();
  await expect(
    page.locator('#workout-day-details [data-record-id="browser-session"]'),
  ).toBeVisible();
  await expect(page.locator('#workout-day-details [data-record-id="browser-plan"]')).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('workout-calendar-mobile.png'),
    fullPage: true,
  });
  await api.dispose();
  expect(errors).toEqual([]);
});

test('Workouts reschedule and start update the same Calendar identities after reload', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.setFixedTime(new Date('2026-03-11T12:00:00.000Z'));
  const api = await request.newContext({ baseURL: apiBaseURL });
  const registration = await api.post('/api/v1/auth/register', {
    data: {
      username: `cal182-${Date.now()}`,
      password: 'fictional-calendar-password',
      timeZone: 'America/Detroit',
    },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();
  const { token, user } = (await registration.json()).data as {
    token: string;
    user: { id: string };
  };
  seedConnectedHistory(user.id); // Fictional fixture DB only; mutations below use the registered Workouts UI.
  const owner = await request.newContext({
    baseURL: apiBaseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  try {
    const authority = await owner.get('/api/v1/adaptive-nutrition');
    expect(authority.ok(), await authority.text()).toBeTruthy();
    expect(((await authority.json()) as { data: { localDate: string } }).data.localDate).toBe(
      '2026-03-11',
    );
    const exercise = await owner.post('/api/v1/exercises', {
      data: {
        category: 'compound',
        equipment: 'barbell',
        muscleGroups: ['chest'],
        name: 'Fictional Calendar Press',
      },
    });
    expect(exercise.status(), await exercise.text()).toBe(201);
    const exerciseId = ((await exercise.json()) as { data: { id: string } }).data.id;
    const template = await owner.post('/api/v1/workout-templates', {
      data: {
        name: 'Fictional Calendar Lift',
        sections: [
          {
            type: 'main',
            exercises: [{ exerciseId, sets: 1, repsMin: 6, repsMax: 8, restSeconds: 60, cues: [] }],
          },
        ],
      },
    });
    expect(template.status(), await template.text()).toBe(201);
    const templateId = ((await template.json()) as { data: { id: string } }).data.id;
    const createSchedule = async (date: string) => {
      const response = await owner.post('/api/v1/scheduled-workouts', {
        data: { templateId, date },
      });
      expect(response.status(), await response.text()).toBe(201);
      return ((await response.json()) as { data: { id: string } }).data.id;
    };
    const startId = await createSchedule('2026-03-11');
    const moveId = await createSchedule('2026-03-12');
    const read = async () => {
      const response = await owner.get('/api/v1/calendar?from=2026-03-08&to=2026-03-15');
      expect(response.ok(), await response.text()).toBeTruthy();
      return (
        (await response.json()) as {
          data: {
            items: Array<{
              id: string;
              domain: string;
              localDate: string;
              plannedLocalDate?: string | null;
              actualLocalDate?: string | null;
            }>;
          };
        }
      ).data.items;
    };
    const before = await read();
    expect(before.find((item) => item.id === startId)?.localDate).toBe('2026-03-11');
    expect(before.find((item) => item.id === moveId)?.localDate).toBe('2026-03-12');
    const historical = before
      .filter((item) => ['connected-plan', 'connected-actual'].includes(item.id))
      .map(({ id, localDate }) => ({ id, localDate }));
    expect(historical).toEqual([
      { id: 'connected-plan', localDate: '2026-03-10' },
      { id: 'connected-actual', localDate: '2026-03-12' },
    ]);

    await setAuthenticatedSession(page, token);
    await page.goto('/workouts?view=calendar', { waitUntil: 'networkidle' });
    await page
      .locator('section[aria-label="Monthly workout calendar"] [aria-label^="Thursday, March 12"]')
      .click();
    const moving = page.locator(`#workout-day-details [data-record-id="${moveId}"]`);
    await expect(moving).toBeVisible();
    await moving.getByRole('button', { name: 'Reschedule' }).click();
    await page.locator('[role="dialog"] [data-day="2026-03-13"]').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect
      .poll(async () => (await read()).find((item) => item.id === moveId)?.localDate)
      .toBe('2026-03-13');
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Agenda' }).click();
    await expect(
      page.locator(`[data-local-date="2026-03-13"] [data-record-id="${moveId}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-local-date="2026-03-12"] [data-record-id="${moveId}"]`),
    ).toHaveCount(0);

    await page.goto('/workouts?view=calendar', { waitUntil: 'networkidle' });
    await page
      .locator('section[aria-label="Monthly workout calendar"] [aria-label^="Wednesday, March 11"]')
      .click();
    const starting = page.locator(`#workout-day-details [data-record-id="${startId}"]`);
    await expect(starting).toBeVisible();
    await starting.getByRole('button', { name: 'Start' }).click();
    await expect(page).toHaveURL(/\/workouts\/active\?sessionId=/u);
    const sessionId = new URL(page.url()).searchParams.get('sessionId');
    expect(sessionId).toBeTruthy();

    const after = await read();
    expect(after.filter((item) => item.id === startId)).toHaveLength(0);
    expect(after.filter((item) => item.id === sessionId && item.domain === 'workout')).toEqual([
      expect.objectContaining({
        id: sessionId,
        localDate: '2026-03-11',
        plannedLocalDate: '2026-03-11',
        actualLocalDate: '2026-03-11',
      }),
    ]);
    expect(after.filter((item) => item.id === moveId)).toEqual([
      expect.objectContaining({ localDate: '2026-03-13' }),
    ]);
    expect(
      after
        .filter((item) => ['connected-plan', 'connected-actual'].includes(item.id))
        .map(({ id, localDate }) => ({ id, localDate })),
    ).toEqual(historical);

    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Agenda' }).click();
    await expect(page.locator(`[data-record-id="${startId}"]`)).toHaveCount(0);
    await expect(
      page.locator(`[data-local-date="2026-03-11"] [data-record-id="${sessionId}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-local-date="2026-03-13"] [data-record-id="${moveId}"]`),
    ).toBeVisible();
    await expect(page.locator('[data-record-id="connected-plan"]')).toBeVisible();
    await expect(page.locator('[data-record-id="connected-actual"]')).toBeVisible();
  } finally {
    await owner.dispose();
    await api.dispose();
  }
});

test('registered GET HTML fixture opens locally and composes its filters', async ({ page }) => {
  const fixture = pathToFileURL(
    resolve(
      process.cwd(),
      '../../docs/implementation/activity-journal-182-fixtures/calendar-agenda.html',
    ),
  );
  await page.goto(fixture.href);
  await expect(page.getByRole('status')).toContainText('America/Detroit');
  await expect(
    page.locator('article').filter({ hasText: 'activity_assignment:plan' }),
  ).toBeVisible();
  await expect(
    page.locator('article').filter({ hasText: 'activity_execution:actual' }),
  ).toBeVisible();
  await expect(
    page.locator('article').filter({ hasText: 'observation:fixture-flare' }),
  ).toBeVisible();
  await expect(
    page.locator('article').filter({ hasText: 'nutrition_log:fixture-meal-log' }),
  ).toContainText('640 kcal · 35 g protein · 65 g carbs · 24 g fat');
  await page.getByRole('button', { name: 'workout', exact: true }).click();
  await expect(page.locator('article').filter({ hasText: 'activity_assignment:plan' })).toHaveCount(
    0,
  );
  await expect(
    page.locator('article').filter({ hasText: 'scheduled_workout:unstarted' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'planned', exact: true }).click();
  await expect(page.locator('article').filter({ hasText: 'workout_session:session' })).toHaveCount(
    0,
  );
  await expect(
    page.locator('article').filter({ hasText: 'scheduled_workout:unstarted' }),
  ).toBeVisible();
});

test('Calendar renders server error and empty states', async ({ page }) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const registration = await api.post('/api/v1/auth/register', {
    data: {
      username: `calendar-empty-${Date.now()}`,
      password: 'fictional-calendar-password',
      timeZone: 'America/Detroit',
    },
  });
  expect(registration.ok()).toBeTruthy();
  const token = ((await registration.json()) as { data: { token: string } }).data.token;
  await setAuthenticatedSession(page, token);
  await page.goto('/calendar', { waitUntil: 'networkidle' });
  await expect(page.getByText('No records match this range and filters.')).toBeVisible();
  await page.route('**/api/v1/calendar?**', async (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'CALENDAR_READ_LIMIT_EXCEEDED', message: 'Calendar read limit exceeded' },
      }),
    }),
  );
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('alert')).toContainText('CALENDAR_READ_LIMIT_EXCEEDED');
  await page.unroute('**/api/v1/calendar?**');
  await page.route('**/api/v1/calendar?**', async (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'USER_TIME_ZONE_REQUIRED', message: 'Set a valid IANA time zone' },
      }),
    }),
  );
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('alert')).toContainText('Set a valid time zone');
  await page.unroute('**/api/v1/calendar?**');
  await page.route('**/api/v1/calendar?**', async (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
    }),
  );
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/u);
  await api.dispose();
});
