import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { adaptivePreviewFixtureContract } from './adaptive-preview-fixture-contract';
import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'America/Detroit' });

const fixturePassword = 'adaptive-preview-only';
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
const fixtureDate = '2026-08-23';
const tokens = new Map<Fixture, string>();

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
  await setAuthenticatedSession(page, token);
}

async function openCoach(page: Page, fixture: Fixture) {
  await authenticate(page, fixture);
  const response = page.waitForResponse(
    (value) =>
      new URL(value.url()).pathname === '/api/v1/adaptive-nutrition/reviews/pending' &&
      value.status() === 200,
  );
  await page.goto('/nutrition?view=coach', { waitUntil: 'networkidle' });
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
  await page.waitForLoadState('networkidle');
}

test.describe.serial('agentic weekly decision reviews', () => {
  test.beforeAll(async () => {
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
    await expect(page.getByRole('button', { name: 'Accept and keep current plan' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Edit proposal' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Defer review' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Decline recommendation' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Ask your agent' })).toBeEnabled();
    await expect(page.getByText('Needs refresh', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh review' })).toHaveCount(0);
    await openEvidence(page);
    await expect(page.getByText('No nutrition log').first()).toBeVisible();
    diagnostics();
  });

  test('lets a real AgentToken resolve bounded low-day context without changing eligibility', async ({
    page,
  }) => {
    const diagnostics = monitorPage(page);
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
      await openCoach(page, 'review-low-day');
      await expect(
        page.getByRole('heading', {
          name: adaptivePreviewFixtureContract.weeklyReview.headline,
        }),
      ).toBeVisible();
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
            snapshot: {
              reviewLocalDate: string;
              analysisStart: string;
              analysisEnd: string;
              headline: string;
              contexts: unknown[];
              modules: Array<{
                kind: string;
                requiresClarification?: boolean;
                evidence?: Array<{
                  id: string | null;
                  localDate?: string;
                  state?: string;
                  label?: string;
                  detail?: string;
                  reasonCodes?: string[];
                }>;
              }>;
            };
          };
        };
      };
      const reviewContract = adaptivePreviewFixtureContract.weeklyReview;
      expect(pending.data.review.snapshot).toMatchObject({
        reviewLocalDate: reviewContract.reviewLocalDate,
        analysisStart: reviewContract.analysisStart,
        analysisEnd: reviewContract.analysisEnd,
        headline: reviewContract.headline,
        contexts: [],
      });
      const dataQualityModule = pending.data.review.snapshot.modules.find(
        (module) => module.kind === 'data_quality',
      );
      expect(dataQualityModule?.requiresClarification).toBe(true);
      expect(dataQualityModule?.evidence).toHaveLength(reviewContract.clarificationCount);
      expect(dataQualityModule?.evidence?.[0]).toMatchObject({
        localDate: reviewContract.lowDay.localDate,
        state: reviewContract.lowDay.state,
        label: reviewContract.lowDay.label,
        reasonCodes: [reviewContract.lowDay.reasonCode],
      });
      expect(dataQualityModule?.evidence?.[0]?.detail).toContain(
        `${reviewContract.lowDay.calories} kcal`,
      );
      const lowDayEvidence = pending.data.review.snapshot.modules
        .find((module) => module.kind === 'data_quality')
        ?.evidence?.find((item) => item.id !== null);
      const nutritionId = lowDayEvidence?.id;
      const lowDayLocalDate = lowDayEvidence?.localDate;
      if (!nutritionId || !lowDayLocalDate) throw new Error('Missing low-day nutrition evidence');
      const stateBefore = (await stateBeforeResponse.json()) as {
        data: {
          activeGoal: unknown;
          currentTarget: unknown;
          eligibility: unknown;
          goalProgress: unknown;
          program: unknown;
        };
      };

      const createdResponse = await apiContext.post('/api/v1/adaptive-nutrition/review-context', {
        data: {
          subject: { kind: 'date', localDate: lowDayLocalDate },
          category: 'illness',
          note: 'Low intake was intentional during illness recovery.',
          resolution: 'Low intake was intentional and the log is complete.',
          resolutionKind: 'nutrition_complete',
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

      await page.reload({ waitUntil: 'networkidle' });
      await expect(
        page
          .locator('[data-slot="weekly-decision-review"]')
          .getByText('Needs refresh', { exact: true }),
      ).toBeVisible();
      const refreshedResponsePromise = page.waitForResponse(
        (value) =>
          new URL(value.url()).pathname ===
            `/api/v1/adaptive-nutrition/reviews/${pending.data.review.id}/refresh` &&
          value.status() === 200,
      );
      await page.getByRole('button', { name: 'Refresh review' }).click();
      const refreshedResponse = await refreshedResponsePromise;
      await expect(page.getByRole('status')).toContainText(
        'Weekly review refreshed with current source data.',
      );
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
      await expect(page.getByRole('heading', { name: reviewContract.headline })).toHaveCount(0);
      await openEvidence(page);
      const contextSection = page.getByRole('heading', { name: 'Context records' }).locator('..');
      await expect(
        contextSection.getByText('Resolution: Low intake was intentional and the log is complete.'),
      ).toBeVisible();
      await expect(contextSection.getByText(/Low-day review agent/)).toBeVisible();
      const resolvedEvidence = page
        .getByText('Complete low day explained by context', { exact: true })
        .locator('..');
      await expect(resolvedEvidence.getByText('logged', { exact: true })).toBeVisible();
      await expect(page.getByText(/Pulse has not changed its eligibility status\./)).toBeVisible();
      await expect(page.getByText('Complete day needs confirmation', { exact: true })).toHaveCount(
        0,
      );
      expect(refreshed.data.snapshot.contexts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: created.data.id,
            resolution: 'Low intake was intentional and the log is complete.',
          }),
        ]),
      );
      const [jwtReview, agentReview] = await Promise.all([
        apiContext.get(`/api/v1/adaptive-nutrition/reviews/${refreshed.data.id}`, {
          headers: lowJwtHeaders,
        }),
        apiContext.get(`/api/v1/adaptive-nutrition/reviews/${refreshed.data.id}`, {
          headers: lowAgentHeaders,
        }),
      ]);
      expect(jwtReview.ok()).toBeTruthy();
      expect(agentReview.ok()).toBeTruthy();
      expect(await agentReview.json()).toEqual(await jwtReview.json());
      const stateAfterResponse = await apiContext.get('/api/v1/adaptive-nutrition', {
        headers: lowJwtHeaders,
      });
      const stateAfter = (await stateAfterResponse.json()) as typeof stateBefore;
      expect({
        activeGoal: stateAfter.data.activeGoal,
        currentTarget: stateAfter.data.currentTarget,
        eligibility: stateAfter.data.eligibility,
        goalProgress: stateAfter.data.goalProgress,
        program: stateAfter.data.program,
      }).toEqual({
        activeGoal: stateBefore.data.activeGoal,
        currentTarget: stateBefore.data.currentTarget,
        eligibility: stateBefore.data.eligibility,
        goalProgress: stateBefore.data.goalProgress,
        program: stateBefore.data.program,
      });

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
      await page.goto('/nutrition?view=coach', { waitUntil: 'networkidle' });
      await expect(
        page
          .locator('[data-slot="weekly-decision-review"]')
          .getByText('Needs refresh', { exact: true }),
      ).toBeVisible();
      const clarifiedResponsePromise = page.waitForResponse(
        (value) =>
          new URL(value.url()).pathname ===
            `/api/v1/adaptive-nutrition/reviews/${refreshed.data.id}/refresh` &&
          value.status() === 200,
      );
      await page.getByRole('button', { name: 'Refresh review' }).click();
      await clarifiedResponsePromise;
      await expect(page.getByRole('status')).toContainText(
        'Weekly review refreshed with current source data.',
      );
      await expect(page.getByRole('heading', { name: /Clarify one logged day/ })).toBeVisible();
      diagnostics();
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
    const originalResponse = await apiContext.get(
      `/api/v1/adaptive-nutrition/reviews/${reviewId}`,
      { headers },
    );
    expect(originalResponse.ok()).toBeTruthy();
    const original = (await originalResponse.json()) as {
      data: { checkInId: string; snapshot: unknown };
    };
    const [reviewsBeforeResponse, checkInsBeforeResponse] = await Promise.all([
      apiContext.get('/api/v1/adaptive-nutrition/reviews?page=1&limit=100', { headers }),
      apiContext.get('/api/v1/adaptive-nutrition/check-ins?page=1&limit=100', { headers }),
    ]);
    const reviewsBefore = (await reviewsBeforeResponse.json()) as { meta: { total: number } };
    const checkInsBefore = (await checkInsBeforeResponse.json()) as { meta: { total: number } };
    const diagnostics = monitorPage(page, [
      { pathname: `/api/v1/adaptive-nutrition/reviews/${reviewId}/actions`, status: 409 },
    ]);
    const corrected = await apiContext.patch(`/api/v1/nutrition/${date}/status`, {
      data: { status: 'partial' },
      headers,
    });
    expect(corrected.ok()).toBeTruthy();
    let replacementReviewId: string | undefined;
    try {
      const response = page.waitForResponse(
        (value) =>
          new URL(value.url()).pathname.endsWith(`/${reviewId}/actions`) && value.status() === 409,
      );
      await page.getByRole('button', { name: 'Accept and keep current plan' }).click();
      await response;
      await expect(page.getByRole('alert')).toContainText('source record changed');

      const agentResponse = await apiContext.post('/api/v1/agent-tokens', {
        data: { name: 'Concurrent stale review verifier' },
        headers,
      });
      expect(agentResponse.status()).toBe(201);
      const agent = (await agentResponse.json()) as { data: { id: string; token: string } };
      try {
        const attempts = await Promise.all([
          apiContext.post(`/api/v1/adaptive-nutrition/reviews/${reviewId}/refresh`, {
            headers,
          }),
          apiContext.post(`/api/v1/adaptive-nutrition/reviews/${reviewId}/refresh`, {
            headers: { authorization: `AgentToken ${agent.data.token}` },
          }),
        ]);
        expect(attempts.map((attempt) => attempt.status()).sort()).toEqual([200, 409]);
        const successful = attempts.find((attempt) => attempt.status() === 200);
        const conflicted = attempts.find((attempt) => attempt.status() === 409);
        if (!successful || !conflicted) throw new Error('Expected one refresh and one conflict');
        const replacement = (await successful.json()) as {
          data: { id: string; checkInId: string };
        };
        replacementReviewId = replacement.data.id;
        expect(await conflicted.json()).toEqual({
          error: {
            code: 'ADAPTIVE_REVIEW_REFRESH_NOT_ALLOWED',
            message: 'Only a stale, nonterminal weekly review can be refreshed',
          },
        });

        const [oldResponse, pendingAfterResponse, reviewsAfterResponse, checkInsAfterResponse] =
          await Promise.all([
            apiContext.get(`/api/v1/adaptive-nutrition/reviews/${reviewId}`, { headers }),
            apiContext.get('/api/v1/adaptive-nutrition/reviews/pending', { headers }),
            apiContext.get('/api/v1/adaptive-nutrition/reviews?page=1&limit=100', { headers }),
            apiContext.get('/api/v1/adaptive-nutrition/check-ins?page=1&limit=100', { headers }),
          ]);
        const old = (await oldResponse.json()) as {
          data: {
            actions: Array<{ type: string; payload: Record<string, unknown> }>;
            snapshot: unknown;
            state: string;
          };
        };
        const pendingAfter = (await pendingAfterResponse.json()) as {
          data: { review: { id: string; checkInId: string } };
        };
        const reviewsAfter = (await reviewsAfterResponse.json()) as { meta: { total: number } };
        const checkInsAfter = (await checkInsAfterResponse.json()) as {
          data: Array<{ id: string; status: string }>;
          meta: { total: number };
        };
        expect(old.data.snapshot).toEqual(original.data.snapshot);
        expect(old.data.state).toBe('superseded');
        expect(old.data.actions).toEqual([
          expect.objectContaining({
            type: 'supersede',
            payload: expect.objectContaining({
              replacementCheckInId: replacement.data.checkInId,
            }),
          }),
        ]);
        expect(pendingAfter.data.review).toMatchObject({
          id: replacement.data.id,
          checkInId: replacement.data.checkInId,
        });
        expect(reviewsAfter.meta.total).toBe(reviewsBefore.meta.total + 1);
        expect(checkInsAfter.meta.total).toBe(checkInsBefore.meta.total + 1);
        expect(checkInsAfter.data.filter((checkIn) => checkIn.status === 'pending')).toEqual([
          expect.objectContaining({ id: replacement.data.checkInId }),
        ]);
      } finally {
        const removed = await apiContext.delete(`/api/v1/agent-tokens/${agent.data.id}`, {
          headers,
        });
        expect(removed.status()).toBe(200);
      }

      await page.reload({ waitUntil: 'networkidle' });
      const replacementBrief = page.locator('[data-slot="weekly-decision-review"]');
      await expect(replacementBrief).toBeVisible();
      if (!replacementReviewId) throw new Error('Expected the replacement review ID');
      await expect(
        replacementBrief.getByRole('link', { name: 'Review all evidence' }),
      ).toHaveAttribute('href', `/nutrition/reviews/${replacementReviewId}`);
      await expect(replacementBrief.getByText('Needs refresh', { exact: true })).toHaveCount(0);
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
    const declineToken = tokens.get('review-decline');
    if (!declineToken) throw new Error('Missing decline fixture token');
    const declineJwtHeaders = { authorization: `Bearer ${declineToken}` };
    const agentResponse = await apiContext.post('/api/v1/agent-tokens', {
      data: { name: 'Terminal review verifier' },
      headers: declineJwtHeaders,
    });
    expect(agentResponse.status()).toBe(201);
    const agent = (await agentResponse.json()) as { data: { id: string; token: string } };
    const agentHeaders = { authorization: `AgentToken ${agent.data.token}` };
    try {
      const pendingResponse = await apiContext.get('/api/v1/adaptive-nutrition/reviews/pending', {
        headers: declineJwtHeaders,
      });
      const pending = (await pendingResponse.json()) as { data: { review: { id: string } } };
      await openCoach(page, 'review-decline');
      await page.getByRole('button', { name: 'Decline recommendation' }).click();
      await page.getByRole('button', { name: 'Decline and keep current' }).click();
      await expect(page.getByRole('status')).toContainText(
        'Current targets kept. The decision remains in history.',
      );
      await expect(page.locator('[data-slot="weekly-decision-review"]')).toHaveCount(0);
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.locator('[data-slot="weekly-decision-review"]')).toHaveCount(0);
      await expect(page.getByText('Declined', { exact: true }).first()).toBeVisible();

      const forbiddenRefresh = await apiContext.post(
        `/api/v1/adaptive-nutrition/reviews/${pending.data.review.id}/refresh`,
        { headers: agentHeaders },
      );
      expect(forbiddenRefresh.status()).toBe(409);
      expect(await forbiddenRefresh.json()).toEqual({
        error: {
          code: 'ADAPTIVE_REVIEW_REFRESH_NOT_ALLOWED',
          message: 'Only a stale, nonterminal weekly review can be refreshed',
        },
      });
      const [jwtPending, agentPending] = await Promise.all([
        apiContext.get('/api/v1/adaptive-nutrition/reviews/pending', {
          headers: declineJwtHeaders,
        }),
        apiContext.get('/api/v1/adaptive-nutrition/reviews/pending', { headers: agentHeaders }),
      ]);
      const jwtPendingPayload = await jwtPending.json();
      expect(jwtPendingPayload).toEqual({ data: { review: null } });
      expect(await agentPending.json()).toEqual(jwtPendingPayload);
    } finally {
      const removed = await apiContext.delete(`/api/v1/agent-tokens/${agent.data.id}`, {
        headers: declineJwtHeaders,
      });
      expect(removed.status()).toBe(200);
    }

    await openCoach(page, 'review-defer');
    const trigger = page.getByRole('button', { name: 'Defer review' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByLabel('Return on').fill(datePlus(fixtureDate, 2));
    await page.getByRole('button', { name: 'Defer without changing plan' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Review deferred without changing your plan.',
    );
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
    await expect(page.getByRole('status')).toContainText('Your weekly decision was accepted.');
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
    const maximalToken = tokens.get('review-maximal');
    if (!maximalToken) throw new Error('Missing maximal fixture token');
    const seededHistoryResponse = await apiContext.get(
      '/api/v1/adaptive-nutrition/reviews?page=1&limit=20',
      { headers: { authorization: `Bearer ${maximalToken}` } },
    );
    expect(seededHistoryResponse.ok(), await seededHistoryResponse.text()).toBeTruthy();
    const seededHistory = (await seededHistoryResponse.json()) as {
      data: Array<{ id: string; snapshot: { modules: Array<{ kind: string }> } }>;
    };
    const maximalEvidence = seededHistory.data.find(
      (review) => review.snapshot.modules.length === 5,
    );
    expect(maximalEvidence, 'seeded five-module review').toBeDefined();
    const previewResponse = await apiContext.post('/api/v1/adaptive-nutrition/reviews/preview', {
      data: { kind: 'weekly' },
      headers: { authorization: `Bearer ${maximalToken}` },
    });
    expect(previewResponse.ok(), await previewResponse.text()).toBeTruthy();
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
    const maximalEvidenceLink = page.getByRole('link', { name: 'Review all evidence' });
    await expect(maximalEvidenceLink).toHaveAttribute(
      'href',
      `/nutrition/reviews/${maximalEvidence?.id ?? ''}`,
    );
    await expect(maximalEvidenceLink).toBeVisible();
    await maximalEvidenceLink.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Weekly Review Evidence' }),
    ).toBeVisible();
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
    await page.waitForLoadState('networkidle');
    diagnostics();
  });
});
