// Test-only process entrypoint: real API and independent SQLite connection, IPC barriers.

type Command = {
  kind: 'request' | 'release' | 'close';
  id: string;
  url?: string;
  owner?: string;
  payload?: Record<string, unknown>;
  barrier?: boolean;
};
const send = (message: object) => process.send?.(message);
const started = performance.now();
const phase = (name: string) =>
  send({ kind: 'phase', phase: name, elapsedMs: performance.now() - started });
const queued: Command[] = [];
let handleCommand: ((command: Command) => void) | undefined;
// Listen before loading the API graph so close/error handling never depends on
// messages happening to arrive after app.ready(). Requests still wait for readiness.
process.on('message', (command: Command) => {
  if (handleCommand) handleCommand(command);
  else queued.push(command);
});
phase('bootstrap');

const start = async () => {
  const { db, sqlite } = await import('../../../db/index.js');
  phase('database-open');
  try {
    const { buildServer } = await import('../../../index.js');
    phase('api-imported');
    let activeId = '';
    let attempts = 0;
    let release: (() => void) | undefined;
    const originalTransaction = db.transaction.bind(db);
    db.transaction = ((...args: Parameters<typeof db.transaction>) => {
      attempts++;
      try {
        return originalTransaction(...args);
      } catch (error) {
        send({
          kind: 'attemptError',
          id: activeId,
          attempt: attempts,
          code: (error as { code?: string }).code,
        });
        throw error;
      }
    }) as typeof db.transaction;
    const app = buildServer();
    app.addHook('onRoute', (route) => {
      if (route.method !== 'POST') return;
      const prior = route.preHandler
        ? Array.isArray(route.preHandler)
          ? route.preHandler
          : [route.preHandler]
        : [];
      route.preHandler = [
        ...prior,
        async (request) => {
          if (request.headers['x-fixture-barrier'] !== 'yes') return;
          await new Promise<void>((resolve) => {
            release = resolve;
            send({ kind: 'barrier', id: activeId });
          });
        },
      ];
    });
    await app.ready();
    phase('api-ready');
    handleCommand = (command: Command) => {
      if (command.kind === 'release') {
        release?.();
        release = undefined;
      } else if (command.kind === 'close') {
        void app.close().then(() => {
          sqlite.close();
          process.disconnect();
        });
      } else {
        if (!command.url) {
          send({ kind: 'fatal', id: command.id, error: 'Missing request URL' });
          return;
        }
        activeId = command.id;
        attempts = 0;
        void app
          .inject({
            method: command.payload ? 'POST' : 'GET',
            url: command.url,
            headers: {
              authorization: `AgentToken fictional-${command.owner ?? 'owner'}`,
              ...(command.barrier ? { 'x-fixture-barrier': 'yes' } : {}),
            },
            ...(command.payload ? { payload: command.payload } : {}),
          })
          .then((response) =>
            send({
              kind: 'response',
              id: command.id,
              status: response.statusCode,
              body: response.json(),
              attempts,
              busyTimeout: sqlite.pragma('busy_timeout', { simple: true }),
            }),
          )
          .catch((error: unknown) => send({ kind: 'fatal', id: command.id, error: String(error) }));
      }
    };
    // This is deliberately API readiness, not an early process-start handshake.
    send({
      kind: 'online',
      pid: process.pid,
      apiReady: true,
      elapsedMs: performance.now() - started,
    });
    for (const command of queued.splice(0)) handleCommand(command);
  } catch (error) {
    sqlite.close();
    throw error;
  }
};
void start().catch((error: unknown) => {
  send({ kind: 'fatal', error: String(error) });
  process.exitCode = 1;
  process.disconnect?.();
});
