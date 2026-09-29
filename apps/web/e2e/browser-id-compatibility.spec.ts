import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, request, test } from '@playwright/test';

import { bodyProgressFixtureContract } from './body-progress-fixture-contract';
import { apiBaseURL } from './test-env';

const evidenceRoot =
  process.env.UUID_COMPAT_EVIDENCE_DIR ??
  path.resolve(process.cwd(), '../../test-results/browser-id-compatibility');

async function disableRandomUuid(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', {
      configurable: true,
      value: undefined,
    });
  });
}

test('missing randomUUID preserves Body retry identity and Activity actions', async ({ page }) => {
  test.setTimeout(90_000);
  await fs.mkdir(evidenceRoot, { recursive: true });
  const errors: string[] = [];
  const expectedNetworkErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)'))
      expectedNetworkErrors.push(message.text());
    else errors.push(`console: ${message.text()}`);
  });

  const api = await request.newContext({ baseURL: apiBaseURL });
  const registration = await api.post('/api/v1/auth/register', {
    data: {
      password: 'fictional-browser-id-password',
      timeZone: bodyProgressFixtureContract.serverTimeZone,
      username: `uuid-compat-${Date.now()}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();
  const token = ((await registration.json()).data as { token: string }).token;
  const headers = { authorization: `Bearer ${token}` };
  const preference = await api.patch('/api/v1/body-check-ins/preferences', {
    data: bodyProgressFixtureContract.preference,
    headers,
  });
  expect(preference.ok(), await preference.text()).toBeTruthy();

  await disableRandomUuid(page);
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    'pulse-auth-token',
    token,
  ] as const);

  let interceptedKey: string | undefined;
  let hidFirstSuccessfulResponse = false;
  await page.route('**/api/v1/body-check-ins', async (route) => {
    if (route.request().method() !== 'POST' || hidFirstSuccessfulResponse) return route.continue();
    const body = route.request().postDataJSON() as { idempotencyKey?: string };
    interceptedKey = body.idempotencyKey;
    const actual = await route.fetch();
    expect(actual.ok(), await actual.text()).toBeTruthy();
    hidFirstSuccessfulResponse = true;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SIMULATED_LOST_RESPONSE', message: 'Retry save' } }),
    });
  });

  await page.goto('/body?check-in=1');
  await expect(page.getByTestId('guided-check-in-form')).toBeVisible();
  const environment = await page.evaluate(() => ({
    origin: location.origin,
    isSecureContext,
    hasRandomUUID: typeof crypto.randomUUID === 'function',
    hasGetRandomValues: typeof crypto.getRandomValues === 'function',
  }));
  expect(environment.hasRandomUUID).toBe(false);
  expect(environment.hasGetRandomValues).toBe(true);
  await page.getByLabel('Reading 1 (cm)').first().fill('84.0');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('alert')).toContainText('Retry save');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(/\/body\/check-ins\//u);
  expect(interceptedKey).toMatch(/^body-ui-[0-9a-f-]{36}$/u);

  const list = await api.get('/api/v1/body-check-ins?limit=200', { headers });
  expect(list.ok(), await list.text()).toBeTruthy();
  const records = ((await list.json()).data as Array<{ date: string; status: string }>).filter(
    (entry) => entry.status === 'draft',
  );
  expect(records).toHaveLength(1);

  await page.goto('/e2e/browser-id-harness.html');
  await page.getByRole('button', { name: 'Add Activity' }).click();
  await page.getByLabel('Duration').fill('20');
  await page.getByRole('button', { name: 'Log Activity' }).click();
  const activityOutput = await page.getByTestId('activity-output').textContent();
  if (!activityOutput) throw new Error('Activity harness did not render its output');
  const activities = JSON.parse(activityOutput) as Array<{ id: string }>;
  expect(activities).toHaveLength(1);
  expect(activities[0]?.id).toMatch(/^activity-local-[0-9a-f-]{36}$/u);
  expect(errors).toEqual([]);
  expect(expectedNetworkErrors).toHaveLength(1);

  await fs.writeFile(
    path.join(evidenceRoot, 'environment.json'),
    `${JSON.stringify({ ...environment, forcedRandomUUIDRemoval: true }, null, 2)}\n`,
  );
  await page.screenshot({
    fullPage: true,
    path: path.join(evidenceRoot, 'activity-fallback-success.png'),
  });
  await api.dispose();
});

test('native randomUUID saves Body and creates an Activity ID', async ({ page }) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  const registration = await api.post('/api/v1/auth/register', {
    data: {
      password: 'fictional-native-browser-id-password',
      timeZone: bodyProgressFixtureContract.serverTimeZone,
      username: `uuid-native-${Date.now()}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();
  const token = ((await registration.json()).data as { token: string }).token;
  const headers = { authorization: `Bearer ${token}` };
  const preference = await api.patch('/api/v1/body-check-ins/preferences', {
    data: bodyProgressFixtureContract.preference,
    headers,
  });
  expect(preference.ok(), await preference.text()).toBeTruthy();
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    'pulse-auth-token',
    token,
  ] as const);

  await page.goto('/body?check-in=1');
  const environment = await page.evaluate(() => ({
    origin: location.origin,
    isSecureContext,
    hasRandomUUID: typeof crypto.randomUUID === 'function',
  }));
  test.skip(!environment.hasRandomUUID, 'This origin does not expose native crypto.randomUUID');
  await page.getByLabel('Reading 1 (cm)').first().fill('85.0');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(/\/body\/check-ins\//u);
  const list = await api.get('/api/v1/body-check-ins?limit=200', { headers });
  expect(list.ok(), await list.text()).toBeTruthy();
  expect((await list.json()).data as unknown[]).toHaveLength(1);

  await page.goto('/e2e/browser-id-harness.html');
  await page.getByRole('button', { name: 'Add Activity' }).click();
  await page.getByLabel('Duration').fill('25');
  await page.getByRole('button', { name: 'Log Activity' }).click();
  const activityOutput = await page.getByTestId('activity-output').textContent();
  if (!activityOutput) throw new Error('Activity harness did not render its output');
  const activities = JSON.parse(activityOutput) as Array<{ id: string }>;
  expect(activities[0]?.id).toMatch(/^activity-local-[0-9a-f-]{36}$/u);
  await fs.writeFile(
    path.join(evidenceRoot, 'native-environment.json'),
    `${JSON.stringify(environment, null, 2)}\n`,
  );
  await api.dispose();
});
