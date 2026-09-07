import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const output = join('/Users/meridian/Projects/qa-reports/pulse-pr137-launch', head, 'browser');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = {
  head,
  browser: browser.version(),
  viewport: { width: 375, height: 812 },
  flows: [],
};
const api = async (path, token, method = 'GET', body) => {
  const response = await globalThis.fetch(`http://127.0.0.1:3117/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
};
const login = async (kind) => {
  const result = await api('/auth/login', null, 'POST', {
    username: `fictional-${kind}`,
    password: 'fictional-qa-only',
  });
  assert.equal(result.status, 200);
  return result.body.data.token;
};
try {
  const otherToken = `Bearer ${await login('hold')}`;
  const otherAgent = await api('/agent-tokens', otherToken, 'POST', {
    name: 'Fictional isolation proof',
  });
  assert.equal(otherAgent.status, 201);
  for (const kind of ['keep', 'adjust', 'hold', 'defer']) {
    const token = await login(kind);
    const authorization = `Bearer ${token}`;
    const context = await browser.newContext({
      viewport: results.viewport,
      timezoneId: 'America/Detroit',
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(
      (value) => globalThis.localStorage.setItem('pulse-auth-token', value),
      token,
    );
    const review = (await api('/adaptive-nutrition/reviews/pending', authorization)).body.data
      .review;
    const targetBefore = await api('/nutrition-targets', authorization);
    const input = {
      type: 'accept',
      expectedFingerprint: review.sourceFingerprint,
      expectedActionSequence: 0,
    };
    const ownAgent = await api('/agent-tokens', authorization, 'POST', {
      name: 'Fictional parity proof',
    });
    assert.equal(ownAgent.status, 201);
    const agentAuthorization = `AgentToken ${ownAgent.body.data.token}`;
    const jwtRead = await api(`/adaptive-nutrition/reviews/${review.id}`, authorization);
    const agentRead = await api(`/adaptive-nutrition/reviews/${review.id}`, agentAuthorization);
    assert.deepEqual(jwtRead, agentRead);
    const forbidden = await api(
      `/adaptive-nutrition/reviews/${review.id}/actions`,
      agentAuthorization,
      'POST',
      input,
    );
    assert.equal(forbidden.status, 403);
    const isolation = [];
    if (kind !== 'hold') {
      for (const foreign of [otherToken, `AgentToken ${otherAgent.body.data.token}`]) {
        for (const path of [
          `/adaptive-nutrition/reviews/${review.id}`,
          `/adaptive-nutrition/check-ins/${review.checkInId}`,
        ]) {
          const result = await api(path, foreign);
          assert.equal(result.status, 404);
          isolation.push(result);
        }
      }
      const foreignWrite = await api(
        `/adaptive-nutrition/reviews/${review.id}/actions`,
        otherToken,
        'POST',
        input,
      );
      assert.equal(foreignWrite.status, 404);
      isolation.push(foreignWrite);
    }
    await page.goto('http://127.0.0.1:5287/nutrition?view=coach', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-slot="weekly-decision-review"]')).toBeVisible();
    await page.screenshot({
      path: join(output, `${kind}-before.png`),
      fullPage: true,
      animations: 'disabled',
    });
    if (kind === 'defer') {
      await page.getByRole('button', { name: 'Defer review', exact: true }).click();
      await page.getByLabel('Return on', { exact: true }).fill('2026-08-22');
      await page
        .getByLabel('Reason', { exact: true })
        .fill('Fictional travel; review after the next complete days.');
      await page.screenshot({
        path: join(output, 'defer-populated-mobile.png'),
        fullPage: true,
        animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Defer without changing plan', exact: true }).click();
      await expect
        .poll(
          async () =>
            (await api(`/adaptive-nutrition/reviews/${review.id}`, authorization)).body.data.state,
        )
        .toBe('deferred');
    } else if (kind === 'hold') {
      await expect(
        page.getByRole('button', { name: 'Accept and keep current plan' }),
      ).toBeDisabled();
      const denied = await api(
        `/adaptive-nutrition/reviews/${review.id}/actions`,
        authorization,
        'POST',
        input,
      );
      assert.equal(denied.status, 409);
    } else {
      await page
        .getByRole('button', {
          name: kind === 'keep' ? 'Accept estimate; keep targets' : 'Accept and apply targets',
        })
        .click();
      await expect
        .poll(
          async () =>
            (await api(`/adaptive-nutrition/reviews/${review.id}`, authorization)).body.data.state,
        )
        .toBe('accepted');
    }
    const accepted = await api(`/adaptive-nutrition/reviews/${review.id}`, authorization);
    const checkIn = await api(`/adaptive-nutrition/check-ins/${review.checkInId}`, authorization);
    const targetAfter = await api('/nutrition-targets', authorization);
    const analytics = await api(
      '/adaptive-nutrition/analytics?range=1m&aggregation=daily&end=2026-08-19',
      authorization,
    );
    if (kind === 'keep') {
      assert.deepEqual(targetAfter, targetBefore);
      assert.equal(checkIn.body.data.status, 'accepted');
      assert.equal(checkIn.body.data.acceptedNutritionTargetId, null);
      assert.equal(checkIn.body.data.proposedTdeeKcal, 2520);
      assert.equal(analytics.body.data.current.adaptiveTdeeKcal, 2520);
      assert.equal(analytics.body.data.current.calorieTargetKcal, 2500);
      assert.equal(analytics.body.data.current.expenditureSourceCheckInId, review.checkInId);
      assert.deepEqual(
        await api(`/adaptive-nutrition/reviews/${review.id}/actions`, authorization, 'POST', input),
        accepted,
      );
      assert.equal(accepted.body.data.actions.length, 1);
    } else if (kind === 'adjust') {
      assert.equal(targetAfter.body.data.length, targetBefore.body.data.length + 1);
      assert.equal(checkIn.body.data.status, 'accepted');
      assert.ok(checkIn.body.data.acceptedNutritionTargetId);
    } else {
      assert.deepEqual(targetAfter, targetBefore);
      assert.equal(checkIn.body.data.status, kind === 'defer' ? 'pending' : 'held');
      if (kind === 'hold') assert.equal(checkIn.body.data.proposedTdeeKcal, null);
    }
    await page.goto(`http://127.0.0.1:5287/nutrition/reviews/${review.id}`, {
      waitUntil: 'networkidle',
    });
    await page.screenshot({
      path: join(output, `${kind}-audit.png`),
      fullPage: true,
      animations: 'disabled',
    });
    if (kind === 'keep')
      await expect(
        page.getByText(/Accepted expenditure estimate:.*2,520.*targets unchanged/),
      ).toBeVisible();
    const readback = await page.locator('body').innerText();
    writeFileSync(join(output, `${kind}-ui.txt`), readback);
    if (kind === 'keep') {
      await page.goto('http://127.0.0.1:5287/nutrition/energy-balance', {
        waitUntil: 'networkidle',
      });
      await expect(
        page.getByRole('heading', { name: 'Energy Balance & Expenditure', exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: join(output, 'keep-analytics-mobile.png'),
        fullPage: true,
        animations: 'disabled',
      });
      writeFileSync(join(output, 'keep-analytics-ui.txt'), await page.locator('body').innerText());
    }
    assert.deepEqual(pageErrors, []);
    const flow = {
      kind,
      parity: 'JWT and AgentToken reads equal; AgentToken decisions 403',
      isolation,
      targetBefore,
      accepted,
      checkIn,
      targetAfter,
      analytics,
      pageErrors,
    };
    results.flows.push(flow);
    writeFileSync(join(output, `${kind}-api.json`), JSON.stringify(flow, null, 2));
    await context.close();
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
  globalThis.console.log(
    `PASS installed Chrome ${results.browser}: keep, material adjust, true hold, populated defer; JWT/AgentToken parity and isolation; API readbacks and mobile screenshots retained.`,
  );
} finally {
  await browser.close();
}
