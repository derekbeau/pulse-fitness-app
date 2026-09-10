import { writeFile } from 'node:fs/promises';

import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { apiBaseURL } from './test-env';

const addDays = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

const monitor = (page: Page) => {
  const consoleMessages: string[] = [];
  const failedRequests: string[] = [];
  const responses: Array<{ method: string; path: string; status: number }> = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (requestValue) =>
    failedRequests.push(
      `${requestValue.method()} ${new URL(requestValue.url()).pathname} ${requestValue.failure()?.errorText ?? ''}`,
    ),
  );
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.includes('/api/v1/nutrition')) {
      responses.push({ method: response.request().method(), path, status: response.status() });
    }
  });
  return { consoleMessages, failedRequests, responses };
};

async function registerFixture(api: APIRequestContext, suffix: string) {
  const registration = await api.post('/api/v1/auth/register', {
    data: {
      username: `dt-${suffix.slice(0, 3)}-${Date.now().toString().slice(-10)}`,
      password: 'daily-target-test-password',
      timeZone: 'America/Detroit',
    },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();
  const token = ((await registration.json()) as { data: { token: string } }).data.token;
  const state = await api.get('/api/v1/adaptive-nutrition', {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(state.ok(), await state.text()).toBeTruthy();
  const localDate = ((await state.json()) as { data: { localDate: string } }).data.localDate;
  const target = await api.post('/api/v1/nutrition-targets', {
    data: {
      calories: 2_200,
      protein: 180,
      carbs: 250,
      fat: 70,
      effectiveDate: addDays(localDate, -7),
    },
    headers: { authorization: `Bearer ${token}` },
  });
  expect(target.ok(), await target.text()).toBeTruthy();
  return { localDate, token };
}

async function openDate(page: Page, token: string, date: string) {
  await setAuthenticatedSession(page, token);
  await page.goto(`/nutrition?view=log&date=${date}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Nutrition' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily targets' })).toBeVisible();
}

for (const viewport of [
  { name: 'mobile-375', width: 375, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 900 },
] as const) {
  test(`${viewport.name}: create, edit, reload, future-confine, and restore a daily adjustment`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const api = await request.newContext({ baseURL: apiBaseURL });
    const diagnostics = monitor(page);
    const fixture = await registerFixture(api, viewport.name);
    const selectedDate = fixture.localDate;
    const historicalDate = addDays(fixture.localDate, -1);
    const futureDate = addDays(fixture.localDate, 1);

    try {
      await openDate(page, fixture.token, selectedDate);
      await page.getByRole('button', { name: 'Adjust this day' }).focus();
      await page.keyboard.press('Enter');
      await page.getByLabel('Calories (kcal)').fill('2500');
      await page.getByLabel('Reason (optional)').fill('Planned event');
      const createResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          new URL(response.url()).pathname.endsWith(`/${selectedDate}/target-override`),
      );
      await page.getByRole('button', { name: 'Save adjustment' }).click();
      const created = await createResponse;
      expect(created.ok(), await created.text()).toBeTruthy();
      await expect(page.getByText('Adjusted', { exact: true })).toBeVisible();
      await expect(page.getByText('Baseline 2,200 kcal')).toBeVisible();
      await expect(page.getByRole('article', { name: 'Daily energy' })).toContainText(
        'Adjusted target',
      );

      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByText('Planned event')).toBeVisible();
      await page.getByRole('button', { name: 'Edit adjustment' }).click();
      await page.getByLabel('Protein (g)').fill('200');
      await page.getByRole('button', { name: 'Save adjustment' }).click();
      await expect(page.getByText('Baseline 180 g')).toBeVisible();

      await openDate(page, fixture.token, historicalDate);
      await expect(
        page.getByText('No accepted baseline target was effective on this date.'),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Adjust this day' })).toBeDisabled();

      await openDate(page, fixture.token, futureDate);
      await expect(page.getByText('Adjusted', { exact: true })).toHaveCount(0);
      await expect(page.getByText('2,200 kcal')).toBeVisible();

      const selectedReadback = await api.get(`/api/v1/nutrition/${selectedDate}/target-override`, {
        headers: { authorization: `Bearer ${fixture.token}` },
      });
      const futureReadback = await api.get(`/api/v1/nutrition/${futureDate}/target-override`, {
        headers: { authorization: `Bearer ${fixture.token}` },
      });
      expect((await selectedReadback.json()).data).toMatchObject({
        adjusted: true,
        effective: { calories: 2_500, protein: 200 },
      });
      expect((await futureReadback.json()).data).toMatchObject({
        adjusted: false,
        effective: { calories: 2_200, protein: 180 },
      });

      await openDate(page, fixture.token, selectedDate);
      await page.getByRole('button', { name: 'Restore baseline' }).click();
      await expect(page.getByText('Adjusted', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Baseline 2,200 kcal')).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);

      const networkPath = testInfo.outputPath(`${viewport.name}-network.json`);
      const consolePath = testInfo.outputPath(`${viewport.name}-console.json`);
      await writeFile(networkPath, `${JSON.stringify(diagnostics.responses, null, 2)}\n`);
      await writeFile(consolePath, `${JSON.stringify(diagnostics.consoleMessages, null, 2)}\n`);
      await testInfo.attach(`${viewport.name}-network`, {
        path: networkPath,
        contentType: 'application/json',
      });
      await testInfo.attach(`${viewport.name}-console`, {
        path: consolePath,
        contentType: 'application/json',
      });
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath(`${viewport.name}-restored.png`),
      });
      expect(diagnostics.consoleMessages).toEqual([]);
      expect(diagnostics.failedRequests).toEqual([]);
      expect(
        diagnostics.responses.some((entry) => entry.method === 'PATCH' && entry.status === 200),
      ).toBe(true);
      expect(
        diagnostics.responses.some((entry) => entry.method === 'DELETE' && entry.status === 200),
      ).toBe(true);
    } finally {
      await api.dispose();
    }
  });
}
