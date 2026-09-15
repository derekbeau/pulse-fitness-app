import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { bodyProgressFixtureContract } from './body-progress-fixture-contract';
import { apiBaseURL } from './test-env';

const authTokenStorageKey = 'pulse-auth-token';
const testPassword = 'super-secret-password';
const evidenceRoot =
  process.env.BODY_PROGRESS_EVIDENCE_DIR ??
  path.resolve(process.cwd(), '../../test-results/body-progress-browser-evidence');
const widths = [320, 390, 430, 768, 1280] as const;

type Seed = { token: string; completedId?: string; draftId?: string };

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

async function createUser(api: APIRequestContext, populated: boolean): Promise<Seed> {
  const register = await api.post('/api/v1/auth/register', {
    data: {
      password: testPassword,
      timeZone: bodyProgressFixtureContract.serverTimeZone,
      username: `bp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    },
  });
  expect(register.ok(), await register.text()).toBeTruthy();
  const { data } = (await register.json()) as { data: { token: string } };
  const headers = { authorization: `Bearer ${data.token}` };
  if (!populated) return { token: data.token };

  const preference = await api.patch('/api/v1/body-check-ins/preferences', {
    data: bodyProgressFixtureContract.preference,
    headers,
  });
  expect(preference.ok(), await preference.text()).toBeTruthy();
  for (const checkIn of bodyProgressFixtureContract.completedHistory) {
    const response = await api.post('/api/v1/body-check-ins', { data: checkIn, headers });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  const completed = await api.post('/api/v1/body-check-ins', {
    data: bodyProgressFixtureContract.completed,
    headers,
  });
  expect(completed.ok(), await completed.text()).toBeTruthy();
  const completedPayload = (await completed.json()) as { data: { id: string } };
  for (const weight of bodyProgressFixtureContract.weights) {
    const response = await api.post('/api/v1/weight', { data: weight, headers });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  const draft = await api.post('/api/v1/body-check-ins', {
    data: bodyProgressFixtureContract.draft,
    headers,
  });
  expect(draft.ok(), await draft.text()).toBeTruthy();
  const draftPayload = (await draft.json()) as { data: { id: string } };
  return {
    token: data.token,
    completedId: completedPayload.data.id,
    draftId: draftPayload.data.id,
  };
}

async function authenticate(page: Page, token: string) {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    authTokenStorageKey,
    token,
  ] as const);
}

function monitorPage(page: Page) {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      failures.push(`console ${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (failed) =>
    failures.push(`requestfailed: ${failed.method()} ${failed.url()}`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400)
      failures.push(
        `response ${response.status()}: ${response.request().method()} ${response.url()}`,
      );
  });
  return () => expect(failures, 'console and network failures').toEqual([]);
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    })),
  ).toEqual(
    expect.objectContaining({
      client: await page.evaluate(() => innerWidth),
      scroll: await page.evaluate(() => innerWidth),
    }),
  );
}

async function expectHitAreas(page: Page) {
  const undersized = await page
    .locator('button:visible, a[href]:visible, input:visible, select:visible, textarea:visible')
    .evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        if (getComputedStyle(node).opacity === '0' || node.getAttribute('data-slot') === 'checkbox')
          return [];
        const box = node.getBoundingClientRect();
        return box.width < 44 || box.height < 44
          ? [
              `${node.tagName.toLowerCase()}:${node.getAttribute('aria-label') ?? node.textContent?.trim().slice(0, 30) ?? ''}=${Math.round(box.width)}x${Math.round(box.height)}`,
            ]
          : [];
      }),
    );
  expect(undersized, 'interactive targets smaller than 44px').toEqual([]);
}

test('setup persists to the real server and survives reload', async ({ page }) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const seed = await createUser(api, false);
  await api.dispose();
  await authenticate(page, seed.token);
  await page.goto('/body');
  await expect(page.getByRole('heading', { name: 'Body Progress' })).toBeVisible();
  await expect(page.getByText('Set up Body Progress', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByTestId('body-due-card')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Preferences' })).toBeVisible();
});

test('populated Body Progress acceptance is responsive, accessible, and evidence-bound', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await fs.mkdir(evidenceRoot, { recursive: true });
  const api = await request.newContext({ baseURL: apiBaseURL });
  const seed = await createUser(api, true);
  await api.dispose();
  await authenticate(page, seed.token);
  const assertClean = monitorPage(page);

  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 900 : 1000 });
    await page.goto('/body');
    await expect(page.getByRole('heading', { name: 'Body Progress' })).toBeVisible();
    await expect(page.getByText('Paused for a third waist reading.')).toBeHidden();
    await expect(page.getByText('Added by agent')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Circumference trends' })).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Body Progress circumference chart' }),
    ).toBeVisible();
    await expect(page.getByText('Product Trend Weight · current')).toBeVisible();
    await expect(page.getByText(/Workout exposure is not treated as strength/)).toBeVisible();
    await expectNoOverflow(page);
    await expectHitAreas(page);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
    await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      path: path.join(evidenceRoot, `body-progress-home-${width}.png`),
    });

    await page.goto('/body?check-in=1');
    await expect(
      page.getByRole('img', { name: /NHANES iliac-crest waist landmark diagram/ }),
    ).toBeVisible();
    await expect(page.getByLabel('Reading 1 (cm)').first()).toBeVisible();
    await expectNoOverflow(page);
    await expectHitAreas(page);
    await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      path: path.join(evidenceRoot, `body-progress-guided-${width}.png`),
    });
  }

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/body');
  await page.getByText('View exact chart values and raw readings').click();
  await expect(page.getByText('High variance').first()).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Exact Body Progress chart values and provenance' }),
  ).toContainText('84.2 cm · 84.8 cm');
  await page.getByRole('button', { name: '6M' }).click();
  await expect(page.getByRole('button', { name: '6M' })).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: /Body check-in/ })
    .first()
    .click();
  await expect(page.getByLabel('Selected Body Progress evidence')).toContainText('Body check-in');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/body?check-in=1');
  await expect(page.locator('.body-protocol-tape').first()).toHaveCSS('animation-name', 'none');
  assertClean();
});

test('real draft resume, completion, correction CAS, snooze, skip, and delete flow', async ({
  page,
}) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const seed = await createUser(api, true);
  await api.dispose();
  await authenticate(page, seed.token);

  await page.goto('/body');
  const dueState = await page.getByTestId('body-due-card').getAttribute('data-due-state');
  if (dueState === 'due_today' || dueState === 'overdue') {
    await page.getByRole('button', { name: 'Snooze' }).click();
    const localDate = await page.getByTestId('body-due-card').locator('dd').first().textContent();
    expect(localDate).not.toBeNull();
    if (!localDate) throw new Error('Server local date was not rendered');
    await page.getByLabel('Snooze this prompt until').fill(addDays(localDate, 1));
    await page.getByRole('button', { name: 'Save snooze' }).click();
    await expect(page.getByText('Body check-in is snoozed')).toBeVisible();
    await page.getByRole('button', { name: 'Skip this check-in' }).click();
    await expect(page.getByText('Current check-in skipped')).toBeVisible();
  }

  await page.goto(`/body/check-ins/${seed.draftId}?edit=1`);
  await expect(page.getByText('Resume draft', { exact: true })).toBeVisible();
  await page.getByLabel('Reading 3 (cm)').first().fill('84.7');
  await page.getByRole('button', { name: 'Complete check-in' }).click();
  await expect(page.getByText(/Completed check-in · exact server version 2/)).toBeVisible();

  await page.goto(`/body/check-ins/${seed.completedId}`);
  await page.getByRole('button', { name: 'Correct' }).click();
  await page.getByLabel('Correction reason').fill('Browser acceptance correction');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText(/exact server version 2/)).toBeVisible();

  await page.goto(`/body/check-ins/${seed.completedId}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete check-in' }).click();
  await expect(page).toHaveURL(/\/body$/);
});
