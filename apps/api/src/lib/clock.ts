const readTestNow = () => {
  const configured = process.env.PULSE_TEST_NOW;
  if (!configured) return undefined;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PULSE_TEST_NOW is test-only and cannot be used in production');
  }
  const parsed = new Date(configured);
  if (Number.isNaN(parsed.getTime())) throw new Error('PULSE_TEST_NOW must be an ISO timestamp');
  return parsed;
};

export const getApplicationNow = () => readTestNow() ?? new Date();

export const getApplicationNowMs = () => getApplicationNow().getTime();
