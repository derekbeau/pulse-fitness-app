// Test-only process entrypoint: registered API routes over an independent SQLite handle.

type Command = {
  kind: 'request' | 'release' | 'close';
  id: string;
  method?: 'GET' | 'POST' | 'PATCH';
  url?: string;
  owner?: 'owner' | 'foreign';
  payload?: Record<string, unknown>;
  barrier?: boolean;
};

const send = (message: object) => process.send?.(message);
const queued: Command[] = [];
let handleCommand: ((command: Command) => void) | undefined;

process.on('message', (command: Command) => {
  if (handleCommand) handleCommand(command);
  else queued.push(command);
});

const start = async () => {
  const { randomUUID } = await import('node:crypto');
  const { sqlite } = await import('../../../db/index.js');
  const { buildServer } = await import('../../../index.js');
  let activeId = '';
  let release: (() => void) | undefined;

  const app = buildServer();
  app.addHook('onRoute', (route) => {
    if (!['POST', 'PATCH', 'PUT'].includes(String(route.method))) return;
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
        send({ kind: 'released', id: activeId });
      },
    ];
  });
  await app.ready();

  handleCommand = (command: Command) => {
    if (command.kind === 'release') {
      release?.();
      release = undefined;
      return;
    }
    if (command.kind === 'close') {
      void app.close().then(() => {
        sqlite.close();
        process.disconnect();
      });
      return;
    }
    if (!command.url || !command.method) {
      send({ kind: 'fatal', id: command.id, error: 'Missing request URL or method' });
      return;
    }
    activeId = command.id;
    void app
      .inject({
        method: command.method,
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
          headers: response.headers,
          body: response.json(),
        }),
      )
      .catch((error: unknown) => send({ kind: 'fatal', id: command.id, error: String(error) }));
  };

  send({
    kind: 'online',
    pid: process.pid,
    connectionId: randomUUID(),
    journalMode: sqlite.pragma('journal_mode', { simple: true }),
    busyTimeout: sqlite.pragma('busy_timeout', { simple: true }),
  });
  for (const command of queued.splice(0)) handleCommand(command);
};

void start().catch((error: unknown) => {
  send({ kind: 'fatal', error: String(error) });
  process.exitCode = 1;
  process.disconnect?.();
});
