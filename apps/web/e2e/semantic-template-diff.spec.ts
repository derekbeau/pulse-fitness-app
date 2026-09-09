import { expect, request, test, type Page, type TestInfo } from '@playwright/test';

import { apiBaseURL } from './test-env';

const scheduledId = '11111111-1111-4111-8111-111111111111';
const authStorageKey = 'pulse-auth-token';

const baseDetail = {
  id: scheduledId,
  userId: 'synthetic-user',
  templateId: 'template-semantic-diff',
  date: '2026-09-09',
  sessionId: null,
  createdAt: 1,
  updatedAt: 2,
  exercises: [
    {
      exerciseId: 'exercise-squat',
      exerciseName: 'Back Squat',
      section: 'main',
      orderIndex: 0,
      programmingNotes: 'Keep two reps in reserve.',
      agentNotes: 'Use the safety arms and stop if the knee feels unstable.',
      agentNotesMeta: {
        author: 'Synthetic Coach',
        generatedAt: '2026-09-09T12:00:00.000Z',
        scheduledDateAtGeneration: '2026-09-09',
        stale: false,
      },
      templateCues: ['Brace before descending'],
      supersetGroup: null,
      tempo: '3010',
      restSeconds: 120,
      sets: [
        {
          setNumber: 1,
          repsMin: null,
          repsMax: null,
          reps: 5,
          targetWeight: 185,
          targetWeightMin: null,
          targetWeightMax: null,
          targetSeconds: null,
          targetDistance: null,
          targetZone: null,
        },
      ],
    },
  ],
  templateDiff: null,
  staleExercises: [],
  templateDeleted: false,
  template: {
    id: 'template-semantic-diff',
    userId: 'synthetic-user',
    name: 'Synthetic Lower Body',
    description: 'Synthetic browser acceptance fixture.',
    tags: [],
    sections: [
      { type: 'warmup', exercises: [] },
      {
        type: 'main',
        exercises: [
          {
            id: 'template-exercise-squat',
            exerciseId: 'exercise-squat',
            exerciseName: 'Back Squat',
            trackingType: 'weight_reps',
            sets: 1,
            repsMin: 5,
            repsMax: 5,
            tempo: '3010',
            restSeconds: 120,
            supersetGroup: null,
            notes: null,
            cues: ['Brace before descending'],
            setTargets: [{ setNumber: 1, targetWeight: 195 }],
            programmingNotes: 'Keep two reps in reserve.',
          },
        ],
      },
      { type: 'cooldown', exercises: [] },
    ],
    createdAt: 1,
    updatedAt: 2,
  },
};

const changedDetail = {
  ...baseDetail,
  templateDiff: {
    status: 'customized',
    summary: 'Customized for this session.',
    provenance: {
      status: 'known',
      scheduledTemplateVersion: 'a'.repeat(64),
      currentTemplateVersion: 'b'.repeat(64),
    },
    differences: [
      {
        exerciseId: 'exercise-squat',
        exerciseName: 'Back Squat',
        field: 'targetWeight',
        label: 'Target weight',
        setNumber: 1,
        scheduledValue: '185',
        templateValue: '195',
        category: 'prescription',
        severity: 'info',
        provenance: 'known',
      },
    ],
  },
};

async function authenticate(page: Page) {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const response = await api.post('/api/v1/auth/register', {
    data: {
      username: `s152-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
      password: 'synthetic-browser-password',
      timeZone: 'America/Detroit',
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = (await response.json()) as { data: { token: string } };
  await api.dispose();
  await page.addInitScript(([key, token]) => window.localStorage.setItem(key, token), [
    authStorageKey,
    payload.data.token,
  ] as const);
}

async function attachReadback(testInfo: TestInfo, name: string, value: unknown) {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: 'application/json',
  });
}

for (const viewport of [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'desktop-1280', width: 1280, height: 900 },
] as const) {
  test(`${viewport.name}: collapsed semantic diff expands from the keyboard and reappears after a real content change`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await authenticate(page);
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => failedRequests.push(request.url()));

    let detail = baseDetail;
    await page.route(`**/api/v1/scheduled-workouts/${scheduledId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: detail }),
      }),
    );
    await page.route('**/api/v1/workout-sessions?status=in-progress%7Cpaused', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
    );
    await page.route('**/api/v1/workout-progression/preview', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { recommendations: [] } }),
      }),
    );

    await page.goto(`/workouts/scheduled/${scheduledId}`);
    await expect(page.getByRole('heading', { name: 'Synthetic Lower Body' })).toBeVisible();
    await expect(page.getByTestId('scheduled-template-diff')).toHaveCount(0);
    await expect(
      page.getByText('Use the safety arms and stop if the knee feels unstable.'),
    ).toBeVisible();

    detail = changedDetail;
    await page.reload();
    const disclosure = page.getByTestId('scheduled-template-diff');
    await expect(disclosure).toBeVisible();
    await expect(disclosure).not.toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeEnabled();

    const summary = disclosure.locator('summary');
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(disclosure).toHaveAttribute('open', '');
    await expect(page.getByText('Back Squat · Target weight · Set 1')).toBeVisible();
    await expect(page.getByText('185', { exact: true })).toBeVisible();
    await expect(page.getByText('195', { exact: true })).toBeVisible();

    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`${viewport.name}-expanded.png`),
    });
    await attachReadback(testInfo, `${viewport.name}-readback`, {
      consoleErrors,
      failedRequests,
      disclosureText: await disclosure.innerText(),
      startEnabled: await page.getByRole('button', { name: 'Start workout' }).isEnabled(),
    });
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
}

test('desktop: detail API failure renders the bounded error state and records the response', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await authenticate(page);
  const responses: Array<{ status: number; url: string }> = [];
  page.on('response', (response) => {
    if (response.url().includes(`/api/v1/scheduled-workouts/${scheduledId}`)) {
      responses.push({ status: response.status(), url: response.url() });
    }
  });
  await page.route(`**/api/v1/scheduled-workouts/${scheduledId}`, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SYNTHETIC_FAILURE', message: 'Synthetic failure' } }),
    }),
  );

  await page.goto(`/workouts/scheduled/${scheduledId}`);
  await expect(page.getByText('Scheduled workout not found.')).toBeVisible();
  expect(responses.length).toBeGreaterThan(0);
  expect(responses.every((response) => response.status === 500)).toBe(true);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('desktop-api-error.png') });
  await attachReadback(testInfo, 'api-error-responses', responses);
});
