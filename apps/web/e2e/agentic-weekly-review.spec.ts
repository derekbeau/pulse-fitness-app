import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'America/Detroit' });

const fixturePassword = 'adaptive-preview-only';
const authTokenStorageKey = 'pulse-auth-token';
type Fixture =
  | 'review-clean-loss'
  | 'review-clean-gain'
  | 'review-clean-maintain'
  | 'review-low-day'
  | 'review-cutoff'
  | 'review-illness'
  | 'review-holding'
  | 'review-stale'
  | 'review-decline'
  | 'review-defer'
  | 'review-maximal'
  | 'review-adjust';

const usernames: Record<Fixture, string> = {
  'review-clean-loss': 'adaptive-preview-wr-loss',
  'review-clean-gain': 'adaptive-preview-wr-gain',
  'review-clean-maintain': 'adaptive-preview-wr-maintain',
  'review-low-day': 'adaptive-preview-wr-low',
  'review-cutoff': 'adaptive-preview-wr-cutoff',
  'review-illness': 'adaptive-preview-wr-illness',
  'review-holding': 'adaptive-preview-wr-hold',
  'review-stale': 'adaptive-preview-wr-stale',
  'review-decline': 'adaptive-preview-wr-decline',
  'review-defer': 'adaptive-preview-wr-defer',
  'review-maximal': 'adaptive-preview-wr-full',
  'review-adjust': 'adaptive-preview-wr-adjust',
};

let apiContext: APIRequestContext;
let fixtureDate: string;
const tokens = new Map<Fixture, string>();

function detroitDateKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Detroit',
    year: 'numeric',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function datePlus(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monitorPage(page: Page, expected: Array<{ pathname: string; status: number }> = []) {
  const failures: string[] = [];
  const optionalFont = (url: string) => new URL(url).hostname === 'fonts.gstatic.com';
  const isExpected = (url: string, status: number) => {
    const pathname = new URL(url).pathname;
    return expected.some((entry) => entry.pathname === pathname && entry.status === status);
  };
  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    const locationUrl = message.location().url;
    if (
      message.type() === 'error' &&
      locationUrl &&
      expected.some(
        (entry) =>
          isExpected(locationUrl, entry.status) && message.text().includes(String(entry.status)),
      )
    )
      return;
    failures.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (failed) => {
    const url = new URL(failed.url());
    const viteAbort =
      failed.failure()?.errorText === 'net::ERR_ABORTED' &&
      url.origin === 'http://127.0.0.1:5274' &&
      (url.pathname.startsWith('/src/') || url.pathname.startsWith('/node_modules/.vite/'));
    if (!optionalFont(failed.url()) && !viteAbort) {
      failures.push(
        `requestfailed: ${failed.method()} ${failed.url()} ${failed.failure()?.errorText}`,
      );
    }
  });
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      !optionalFont(response.url()) &&
      !isExpected(response.url(), response.status())
    ) {
      failures.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  return () => expect(failures, 'browser diagnostics').toEqual([]);
}

async function authenticate(page: Page, fixture: Fixture) {
  const token = tokens.get(fixture);
  if (!token) throw new Error(`Missing ${fixture} token`);
  await page.goto('/login');
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
    authTokenStorageKey,
    token,
  ] as const);
}

async function openCoach(page: Page, fixture: Fixture) {
  await authenticate(page, fixture);
  const response = page.waitForResponse(
    (value) =>
      new URL(value.url()).pathname === '/api/v1/adaptive-nutrition/reviews/pending' &&
      value.status() === 200,
  );
  await page.goto('/nutrition?view=coach');
  await response;
  await expect(page.locator('[data-slot="weekly-decision-review"]')).toBeVisible();
}

async function openEvidence(page: Page) {
  const link = page.getByRole('link', { name: 'Review all evidence' });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Weekly Review Evidence' }),
  ).toBeVisible();
}

test.describe.serial('agentic weekly decision reviews', () => {
  test.beforeAll(async () => {
    fixtureDate = detroitDateKey();
    apiContext = await request.newContext({ baseURL: apiBaseURL });
    for (const fixture of Object.keys(usernames) as Fixture[]) {
      const response = await apiContext.post('/api/v1/auth/login', {
        data: { username: usernames[fixture], password: fixturePassword },
      });
      expect(response.ok(), `${fixture} login`).toBeTruthy();
      const payload = (await response.json()) as { data: { token: string } };
      tokens.set(fixture, payload.data.token);
    }
  });

  test.afterAll(async () => apiContext.dispose());

  test('keeps clean reviews concise and labels loss, gain, and maintenance truthfully', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    for (const [fixture, label, selectedRate] of [
      ['review-clean-loss', 'Loss goal', /\/ −/u],
      ['review-clean-gain', 'Gain goal', /\/ \+/u],
      ['review-clean-maintain', 'Maintenance goal', /\/ 0/u],
    ] as const) {
      await openCoach(page, fixture);
      await openEvidence(page);
      const modules = page.locator('[data-slot="weekly-review-modules"] > section');
      await expect(modules).toHaveCount(2);
      await expect(modules.nth(0).getByRole('heading', { name: 'Outcome' })).toBeVisible();
      await expect(modules.nth(1).getByRole('heading', { name: 'Recommendation' })).toBeVisible();
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      await expect(page.getByText('Actual / selected rate').locator('..').locator('dd')).toHaveText(
        selectedRate,
      );
      await expect(page.getByRole('heading', { name: 'Data quality' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Energy' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Training and recovery' })).toHaveCount(0);
    }
    diagnostics();
  });

  test('returns byte-equal pending facts to JWT and a real AgentToken caller', async ({ page }) => {
    const token = tokens.get('review-clean-maintain');
    if (!token) throw new Error('Missing JWT');
    const jwtHeaders = { authorization: `Bearer ${token}` };
    const created = await apiContext.post('/api/v1/agent-tokens', {
      data: { name: 'Weekly review parity' },
      headers: jwtHeaders,
    });
    expect(created.status()).toBe(201);
    const createdPayload = (await created.json()) as { data: { id: string; token: string } };
    try {
      const [jwtResponse, agentResponse] = await Promise.all([
        apiContext.get('/api/v1/adaptive-nutrition/reviews/pending', { headers: jwtHeaders }),
        apiContext.get('/api/v1/adaptive-nutrition/reviews/pending', {
          headers: { authorization: `AgentToken ${createdPayload.data.token}` },
        }),
      ]);
      expect(jwtResponse.ok()).toBeTruthy();
      expect(agentResponse.ok()).toBeTruthy();
      expect(await agentResponse.json()).toEqual(await jwtResponse.json());
      await openCoach(page, 'review-clean-maintain');
      await expect(page.getByText('Weekly decision review', { exact: true })).toBeVisible();
    } finally {
      const removed = await apiContext.delete(`/api/v1/agent-tokens/${createdPayload.data.id}`, {
        headers: jwtHeaders,
      });
      expect(removed.status()).toBe(200);
    }
  });

  test('shows low-day, cutoff, illness, and holding evidence without changing quantitative truth', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    await openCoach(page, 'review-low-day');
    await expect(page.getByRole('heading', { name: /Clarify one logged day/ })).toBeVisible();
    await openEvidence(page);
    await expect(page.getByText('Complete day needs confirmation')).toBeVisible();
    await expect(page.getByText('LIKELY_PARTIAL_NUTRITION')).toBeVisible();

    await openCoach(page, 'review-cutoff');
    await openEvidence(page);
    await expect(
      page.getByText(/Complete nutrition logged after the completed-day cutoff/),
    ).toBeVisible();
    await expect(page.getByText(/Weigh-in logged after the completed-day cutoff/)).toBeVisible();
    await expect(page.getByText(/missing/i)).toHaveCount(0);

    await openCoach(page, 'review-illness');
    await openEvidence(page);
    await expect(page.getByRole('heading', { name: 'Training and recovery' })).toBeVisible();
    await expect(page.getByText(/Flu symptoms/)).toBeVisible();
    await expect(page.getByText('Nutrition causal rule: not applied')).toBeVisible();

    await openCoach(page, 'review-holding');
    await expect(page.getByRole('heading', { name: /Defer a target decision/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Accept/ })).toBeDisabled();
    await openEvidence(page);
    await expect(page.getByText('No nutrition log').first()).toBeVisible();
    diagnostics();
  });

  test('lets a real AgentToken resolve bounded low-day context without changing eligibility', async () => {
    const lowJwt = tokens.get('review-low-day');
    const otherJwt = tokens.get('review-clean-maintain');
    if (!lowJwt || !otherJwt) throw new Error('Missing context fixtures');
    const lowJwtHeaders = { authorization: `Bearer ${lowJwt}` };
    const otherJwtHeaders = { authorization: `Bearer ${otherJwt}` };
    const [lowAgentResponse, otherAgentResponse] = await Promise.all([
      apiContext.post('/api/v1/agent-tokens', {
        data: { name: 'Low-day review agent' },
        headers: lowJwtHeaders,
      }),
      apiContext.post('/api/v1/agent-tokens', {
        data: { name: 'Other review agent' },
        headers: otherJwtHeaders,
      }),
    ]);
    expect(lowAgentResponse.status()).toBe(201);
    expect(otherAgentResponse.status()).toBe(201);
    const lowAgent = (await lowAgentResponse.json()) as { data: { id: string; token: string } };
    const otherAgent = (await otherAgentResponse.json()) as { data: { id: string; token: string } };
    const lowAgentHeaders = { authorization: `AgentToken ${lowAgent.data.token}` };
    const otherAgentHeaders = { authorization: `AgentToken ${otherAgent.data.token}` };
    try {
      const [pendingResponse, stateBeforeResponse] = await Promise.all([
        apiContext.get('/api/v1/adaptive-nutrition/reviews/pending', {
          headers: lowJwtHeaders,
        }),
        apiContext.get('/api/v1/adaptive-nutrition', { headers: lowJwtHeaders }),
      ]);
      const pending = (await pendingResponse.json()) as {
        data: {
          review: {
            id: string;
            snapshot: { modules: Array<{ kind: string; evidence?: Array<{ id: string | null }> }> };
          };
        };
      };
      const nutritionId = pending.data.review.snapshot.modules
        .find((module) => module.kind === 'data_quality')
        ?.evidence?.find((item) => item.id !== null)?.id;
      if (!nutritionId) throw new Error('Missing low-day nutrition evidence');
      const stateBefore = await stateBeforeResponse.json();

      const createdResponse = await apiContext.post('/api/v1/adaptive-nutrition/review-context', {
        data: {
          subject: { kind: 'nutrition_log', id: nutritionId },
          category: 'nutrition_exception',
          note: 'Confirmed as a complete low-intake day.',
          resolution: 'Confirmed complete by the connected agent.',
        },
        headers: lowAgentHeaders,
      });
      expect(createdResponse.status()).toBe(201);
      const created = (await createdResponse.json()) as {
        data: { id: string; revision: number; provenance: { agentTokenId: string; label: string } };
      };
      expect(created.data.provenance).toMatchObject({
        agentTokenId: lowAgent.data.id,
        label: 'Low-day review agent',
      });

      const foreignUpdate = await apiContext.patch(
        `/api/v1/adaptive-nutrition/review-context/${created.data.id}`,
        {
          data: { expectedRevision: 1, note: 'Cross-user edit' },
          headers: otherAgentHeaders,
        },
      );
      expect(foreignUpdate.status()).toBe(404);
      const updatedResponse = await apiContext.patch(
        `/api/v1/adaptive-nutrition/review-context/${created.data.id}`,
        {
          data: { expectedRevision: 1, note: 'Confirmed complete after source review.' },
          headers: lowAgentHeaders,
        },
      );
      expect(updatedResponse.status()).toBe(200);
      const staleUpdate = await apiContext.patch(
        `/api/v1/adaptive-nutrition/review-context/${created.data.id}`,
        {
          data: { expectedRevision: 1, note: 'Stale edit' },
          headers: lowAgentHeaders,
        },
      );
      expect(staleUpdate.status()).toBe(409);

      const refreshedResponse = await apiContext.post(
        `/api/v1/adaptive-nutrition/reviews/${pending.data.review.id}/refresh`,
        { headers: lowAgentHeaders },
      );
      expect(refreshedResponse.status()).toBe(200);
      const refreshed = (await refreshedResponse.json()) as {
        data: {
          id: string;
          snapshot: {
            contexts: Array<{ id: string; resolution: string | null }>;
            modules: Array<{ kind: string; requiresClarification?: boolean }>;
          };
        };
      };
      expect(
        refreshed.data.snapshot.modules.find((module) => module.kind === 'data_quality')
          ?.requiresClarification,
      ).toBe(false);
      expect(refreshed.data.snapshot.contexts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: created.data.id,
            resolution: 'Confirmed complete by the connected agent.',
          }),
        ]),
      );
      const stateAfterResponse = await apiContext.get('/api/v1/adaptive-nutrition', {
        headers: lowJwtHeaders,
      });
      expect(await stateAfterResponse.json()).toEqual(stateBefore);

      const deletedResponse = await apiContext.delete(
        `/api/v1/adaptive-nutrition/review-context/${created.data.id}`,
        { headers: lowAgentHeaders, params: { expectedRevision: '2' } },
      );
      expect(deletedResponse.status()).toBe(200);
      const immutableResponse = await apiContext.get(
        `/api/v1/adaptive-nutrition/reviews/${refreshed.data.id}`,
        { headers: lowJwtHeaders },
      );
      const immutable = (await immutableResponse.json()) as typeof refreshed;
      expect(immutable.data.snapshot.contexts).toEqual(refreshed.data.snapshot.contexts);
    } finally {
      await Promise.all([
        apiContext.delete(`/api/v1/agent-tokens/${lowAgent.data.id}`, {
          headers: lowJwtHeaders,
        }),
        apiContext.delete(`/api/v1/agent-tokens/${otherAgent.data.id}`, {
          headers: otherJwtHeaders,
        }),
      ]);
    }
  });

  test('blocks stale acceptance, refreshes immutable evidence, and preserves the target', async ({
    page,
  }) => {
    const token = tokens.get('review-stale');
    if (!token) throw new Error('Missing stale token');
    const headers = { authorization: `Bearer ${token}` };
    const date = datePlus(fixtureDate, -3);
    await openCoach(page, 'review-stale');
    const pending = await apiContext.get('/api/v1/adaptive-nutrition/reviews/pending', { headers });
    const pendingPayload = (await pending.json()) as { data: { review: { id: string } } };
    const reviewId = pendingPayload.data.review.id;
    const diagnostics = monitorPage(page, [
      { pathname: `/api/v1/adaptive-nutrition/reviews/${reviewId}/actions`, status: 409 },
    ]);
    const corrected = await apiContext.patch(`/api/v1/nutrition/${date}/status`, {
      data: { status: 'partial' },
      headers,
    });
    expect(corrected.ok()).toBeTruthy();
    try {
      const response = page.waitForResponse(
        (value) =>
          new URL(value.url()).pathname.endsWith(`/${reviewId}/actions`) && value.status() === 409,
      );
      await page.getByRole('button', { name: 'Accept and keep current plan' }).click();
      await response;
      await expect(page.getByRole('alert')).toContainText('source record changed');
      const refreshed = page.waitForResponse(
        (value) =>
          new URL(value.url()).pathname.endsWith(`/${reviewId}/refresh`) && value.status() === 200,
      );
      await page.getByRole('button', { name: 'Refresh review' }).click();
      await refreshed;
      await expect(page.getByText('Needs refresh')).toHaveCount(0);
    } finally {
      const restored = await apiContext.patch(`/api/v1/nutrition/${date}/status`, {
        data: { status: 'complete' },
        headers,
      });
      expect(restored.ok()).toBeTruthy();
    }
    diagnostics();
  });

  test('declines and defers with preserved history and no duplicate pending review', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    await openCoach(page, 'review-decline');
    await page.getByRole('button', { name: 'Decline recommendation' }).click();
    await page.getByRole('button', { name: 'Decline and keep current' }).click();
    await expect(page.locator('[data-slot="weekly-decision-review"]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-slot="weekly-decision-review"]')).toHaveCount(0);
    await expect(page.getByText('Declined', { exact: true }).first()).toBeVisible();

    await openCoach(page, 'review-defer');
    const trigger = page.getByRole('button', { name: 'Defer review' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole('button', { name: 'Defer without changing plan' }).click();
    await expect(page.locator('[data-slot="weekly-decision-review"]')).toHaveCount(0);
    diagnostics();
  });

  test('keeps a bounded edit review-only until explicit acceptance applies it', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    const token = tokens.get('review-adjust');
    if (!token) throw new Error('Missing adjustment token');
    await openCoach(page, 'review-adjust');
    await page.getByRole('button', { name: 'Edit proposal' }).click();
    const calories = page.getByLabel('calories');
    const originalCalories = Number(await calories.inputValue());
    await calories.fill(String(originalCalories + 100));
    const editResponse = page.waitForResponse(
      (value) => new URL(value.url()).pathname.endsWith('/actions') && value.status() === 200,
    );
    await page.getByRole('button', { name: 'Save edited proposal' }).click();
    await editResponse;
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const beforeAccept = await apiContext.get('/api/v1/adaptive-nutrition', {
      headers: { authorization: `Bearer ${token}` },
    });
    const beforePayload = (await beforeAccept.json()) as {
      data: { currentTarget: { calories: number } };
    };
    expect(beforePayload.data.currentTarget.calories).not.toBe(originalCalories + 100);

    const acceptResponse = page.waitForResponse(
      (value) => new URL(value.url()).pathname.endsWith('/actions') && value.status() === 200,
    );
    await page.getByRole('button', { name: 'Accept and apply targets' }).click();
    await acceptResponse;
    await expect(page.locator('[data-slot="weekly-decision-review"]')).toHaveCount(0);
    const afterAccept = await apiContext.get('/api/v1/adaptive-nutrition', {
      headers: { authorization: `Bearer ${token}` },
    });
    const afterPayload = (await afterAccept.json()) as {
      data: { currentTarget: { calories: number } };
    };
    expect(afterPayload.data.currentTarget.calories).toBe(originalCalories + 100);
    diagnostics();
  });

  test('renders all modules without overflow and with 44px actions at required widths', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await openCoach(page, 'review-maximal');
      const actions = page.locator('[aria-label="Weekly review actions"] button:visible');
      const sizes = await actions.evaluateAll((buttons) =>
        buttons.map((button) => ({
          height: button.getBoundingClientRect().height,
          width: button.getBoundingClientRect().width,
        })),
      );
      expect(sizes.length).toBeGreaterThan(0);
      expect(sizes.every((size) => size.height >= 44 && size.width >= 44)).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await openEvidence(page);
    await expect(page.locator('[data-slot="weekly-review-modules"] > section')).toHaveCount(5);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
      ),
    ).toBe(true);
    diagnostics();
  });

  test('announces loading and recovers from an exact expected pending-review error', async ({
    page,
  }) => {
    const pathname = '/api/v1/adaptive-nutrition/reviews/pending';
    const diagnostics = monitorPage(page, [{ pathname, status: 503 }]);
    await authenticate(page, 'review-clean-loss');
    let allowSuccess = false;
    let releaseLoading: (() => void) | undefined;
    const loadingGate = new Promise<void>((resolve) => {
      releaseLoading = resolve;
    });
    let loadingReleased = false;
    await page.route(`**${pathname}`, async (route) => {
      if (!allowSuccess) {
        if (!loadingReleased) {
          await loadingGate;
          loadingReleased = true;
        }
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'EXPECTED_TEST_ERROR', message: 'Expected failure' },
          }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto('/nutrition?view=coach', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('status')).toContainText('Loading weekly review');
    releaseLoading?.();
    await expect(page.getByRole('alert')).toContainText('Weekly review unavailable');
    allowSuccess = true;
    const response = page.waitForResponse(
      (value) => new URL(value.url()).pathname === pathname && value.status() === 200,
    );
    await page.getByRole('button', { name: 'Try again' }).click();
    await response;
    await expect(page.locator('[data-slot="weekly-decision-review"]')).toBeVisible();
    diagnostics();
  });
});
