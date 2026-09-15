import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { apiBaseURL } from './test-env';

const authTokenStorageKey = 'pulse-auth-token';
const password = 'synthetic-photo-password';
const evidenceRoot =
  process.env.PROGRESS_PHOTO_EVIDENCE_DIR ??
  path.resolve(process.cwd(), '../../test-results/progress-photo-browser-evidence');
const fixtureVersion = 'progress-photo-ui-synthetic-color-block-v1';
const syntheticPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const widths = [320, 375, 390, 430, 768, 1280] as const;

type Seed = { token: string; setA: string; setB: string; photoA: string };

async function seed(api: APIRequestContext): Promise<Seed> {
  const username = `photo-ui-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const register = await api.post('/api/v1/auth/register', {
    data: { username, password, timeZone: 'America/Detroit' },
  });
  expect(register.ok(), await register.text()).toBeTruthy();
  const token = ((await register.json()) as { data: { token: string } }).data.token;
  const headers = { authorization: `Bearer ${token}` };
  const consent = await api.patch('/api/v1/body-progress/photos/preferences', {
    headers,
    data: {
      consentDecision: 'grant',
      consentVersion: 'body-progress-photo-consent-v1',
      cadenceDays: 30,
      cadenceChange: 'preserve_anchor',
      sideView: 'side_right',
      reminderLocalTime: '08:30',
    },
  });
  expect(consent.ok(), await consent.text()).toBeTruthy();

  const makeSet = async (date: string, notes: string) => {
    const response = await api.post('/api/v1/body-progress/photo-sets/', {
      headers,
      data: {
        date,
        localTime: '08:15',
        guideVersion: 'body-progress-photo-guide-v1',
        notes,
        countAsScheduledOccurrence: true,
        context: {
          meal: 'pre_meal',
          workout: 'pre_workout',
          pumpPresent: false,
          unusualBloating: false,
          clothingNotes: 'Synthetic fixture clothing.',
          lightingNotes: 'Synthetic fixture lighting.',
        },
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const setA = await makeSet('2026-08-15', 'Synthetic calibration set A.');
  const setB = await makeSet('2026-09-15', 'Synthetic calibration set B.');
  const upload = async (setId: string, views: string[]) => {
    const multipart = Object.fromEntries(
      views.map((view) => [
        view,
        { name: `${view}-${fixtureVersion}.png`, mimeType: 'image/png', buffer: syntheticPng },
      ]),
    );
    const response = await api.post(`/api/v1/body-progress/photo-sets/${setId}/photos`, {
      headers,
      multipart,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()) as { data: { photos: Array<{ id: string; view: string }> } };
  };
  const uploadedA = await upload(setA, ['front']);
  await upload(setB, ['front', 'side_right', 'back']);
  return {
    token,
    setA,
    setB,
    photoA: uploadedA.data.photos.find((photo) => photo.view === 'front')?.id ?? '',
  };
}

async function authenticate(page: Page, token: string) {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    authTokenStorageKey,
    token,
  ] as const);
}

async function expectNoOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(sizes.scroll).toBe(sizes.client);
}

test('private progress-photo browser acceptance with synthetic media only', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await fs.mkdir(evidenceRoot, { recursive: true });
  const api = await request.newContext({ baseURL: apiBaseURL });
  const seeded = await seed(api);
  await api.dispose();
  await authenticate(page, seeded.token);

  const unexpected: string[] = [];
  const expectedConsole: string[] = [];
  let expectedFailureActive = false;
  const expectedFailureFragments = ['/content', '/photos'];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      const entry = `console ${message.type()}: ${message.text()}`;
      if (expectedFailureActive && message.text().includes('Failed to load resource'))
        expectedConsole.push(entry);
      else unexpected.push(entry);
    }
  });
  page.on('pageerror', (error) => unexpected.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (failure) => unexpected.push(`requestfailed ${failure.url()}`));
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      !expectedFailureFragments.some((fragment) => response.url().includes(fragment))
    )
      unexpected.push(`response ${response.status()} ${response.url()}`);
  });

  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 920 : 1000 });
    await page.goto('/body');
    await expect(
      page.getByText('Progress photos, without analysis', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/granted/).first()).toBeVisible();
    await expect(page.getByText(/Sep 15, 2026/).first()).toBeVisible();
    await expectNoOverflow(page);
    await page.goto('/body/photos');
    await expect(page.getByRole('heading', { name: 'Private Progress Photos' })).toBeVisible();
    await expect(page.getByText('Encrypted in live storage')).toBeVisible();
    await expectNoOverflow(page);
    if (width === 390 || width === 1280)
      await page.screenshot({
        animations: 'disabled',
        fullPage: true,
        path: path.join(evidenceRoot, `private-progress-photos-${width}.png`),
      });
  }

  await page.setViewportSize({ width: 390, height: 920 });
  await page.goto('/body/photos');
  await expect(page.getByRole('heading', { name: 'Private Progress Photos' })).toBeVisible();
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('Tab');
    if ((await page.evaluate(() => document.activeElement?.tagName)) !== 'BODY') break;
  }
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.getByLabel('Select 2026-09-15 for comparison').click();
  await page.getByLabel('Select 2026-08-15 for comparison').click();
  await page.getByRole('button', { name: 'Load authenticated comparison' }).click();
  await expect(page.getByRole('img', { name: /Front comparison photo/ })).toHaveCount(2);
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: path.join(evidenceRoot, 'same-pose-comparison-390.png'),
  });

  await page.goto(`/body/photos?set=${seeded.setA}`);
  await page.getByRole('button', { name: 'Load private full' }).click();
  await expect(page.getByRole('img', { name: /Front progress photo/ })).toBeVisible();
  await page.getByRole('button', { name: 'Edit metadata' }).click();
  await page.getByLabel('Notes', { exact: true }).fill('Corrected synthetic browser fixture note.');
  await page.getByRole('button', { name: 'Save corrections' }).click();
  await expect(page.getByText('Corrected synthetic browser fixture note.')).toBeVisible();

  await context.clearPermissions();
  await page.getByRole('button', { name: 'Use camera' }).first().click();
  await expect(
    page.getByText(/Camera permission was denied|Camera capture is unavailable/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Use file instead' }).click();
  await page
    .getByLabel('Choose file')
    .first()
    .setInputFiles({ name: 'synthetic.heic', mimeType: 'image/heic', buffer: syntheticPng });
  await expect(page.getByText(/cannot be decoded or converted reliably/i)).toBeVisible();

  let failedOnce = false;
  await page.route(`**/api/v1/body-progress/photo-sets/${seeded.setA}/photos`, async (route) => {
    if (!failedOnce) {
      failedOnce = true;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE', message: 'synthetic outage' },
        }),
      });
      return;
    }
    await route.continue();
  });
  await page
    .getByLabel('Choose file')
    .first()
    .setInputFiles({ name: `${fixtureVersion}.png`, mimeType: 'image/png', buffer: syntheticPng });
  expectedFailureActive = true;
  await page.getByRole('button', { name: 'Upload 1 selected' }).click();
  await expect(page.getByRole('button', { name: 'Retry failed uploads' })).toBeVisible();
  expectedFailureActive = false;
  await page.getByRole('button', { name: 'Retry failed uploads' }).click();
  await expect(page.getByText(/2 photos/)).toBeVisible();
  await page.unroute(`**/api/v1/body-progress/photo-sets/${seeded.setA}/photos`);

  await page.goto(`/body/photos?set=${seeded.setB}`);
  await page.route(
    `**/api/v1/body-progress/photos/${seeded.photoA}/content?variant=full`,
    (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'BODY_PROGRESS_PHOTO_NOT_FOUND', message: 'synthetic missing' },
        }),
      }),
  );
  await page.goto(`/body/photos?set=${seeded.setA}`);
  expectedFailureActive = true;
  await page
    .getByText('Front', { exact: true })
    .locator('..')
    .locator('..')
    .getByRole('button', { name: 'Load private full' })
    .click();
  await expect(page.getByText('This photo is missing or was deleted.')).toBeVisible();
  expectedFailureActive = false;
  await page.unroute(`**/api/v1/body-progress/photos/${seeded.photoA}/content?variant=full`);

  await page.goto(`/body/photos?set=${seeded.setB}`);
  await page.getByRole('button', { name: 'Delete photo' }).first().click();
  await page.getByRole('button', { name: 'Delete photo' }).last().click();
  await expect(page.getByText(/Deleted 4 encrypted files/)).toBeVisible();

  let contentRequests = 0;
  page.on('request', (requestEvent) => {
    if (requestEvent.url().includes('/content')) contentRequests += 1;
  });
  await page.goto('/body/photos');
  contentRequests = 0;
  await page.reload();
  await expect(page.getByText('Private photo timeline', { exact: true })).toBeVisible();
  expect(contentRequests).toBe(0);
  await fs.writeFile(
    path.join(evidenceRoot, 'browser-readback.json'),
    JSON.stringify(
      {
        fixtureVersion,
        route: '/body/photos',
        widths,
        expectedSyntheticFailures: ['503 upload retry', '404 missing content'],
        expectedConsole,
        unexpectedConsoleOrNetwork: unexpected,
      },
      null,
      2,
    ),
  );
  expect(unexpected).toEqual([]);
});
