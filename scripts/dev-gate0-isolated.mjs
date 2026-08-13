#!/usr/bin/env node

import console from 'node:console';
import { constants, lstatSync, realpathSync } from 'node:fs';
import { access } from 'node:fs/promises';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

export const GATE0_API_PORT = 3102;
export const GATE0_WEB_PORT = 5274;
export const GATE0_DATABASE_RELATIVE_PATH = 'apps/api/data/pulse-tdee-dev.db';

export const resolveGate0Config = (repoRoot) => {
  const databasePath = resolve(repoRoot, GATE0_DATABASE_RELATIVE_PATH);

  return {
    apiPort: GATE0_API_PORT,
    databasePath,
    proxyPort: GATE0_API_PORT,
    webPort: GATE0_WEB_PORT,
  };
};

export const validateGate0Database = (repoRoot, databaseUrl) => {
  const expectedPath = resolve(repoRoot, GATE0_DATABASE_RELATIVE_PATH);
  const resolvedPath = resolve(repoRoot, databaseUrl);

  if (resolvedPath !== expectedPath) {
    throw new Error(
      `Refusing Gate 0 startup: DATABASE_URL must resolve to ${GATE0_DATABASE_RELATIVE_PATH}.`,
    );
  }

  const stat = lstatSync(resolvedPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(
      'Refusing Gate 0 startup: isolated database must be a regular, non-symlink file.',
    );
  }

  if ((stat.mode & 0o222) === 0) {
    throw new Error('Refusing Gate 0 startup: isolated database is not writable.');
  }

  const realPath = realpathSync(resolvedPath);
  if (realPath !== realpathSync(expectedPath)) {
    throw new Error(
      'Refusing Gate 0 startup: isolated database resolves outside its tracked location.',
    );
  }

  return realPath;
};

export const createGate0Environment = (baseEnvironment, config) => ({
  ...baseEnvironment,
  DATABASE_URL: config.databasePath,
  PORT: String(config.apiPort),
  VITE_API_PORT: String(config.proxyPort),
  VITE_API_PROXY_TARGET: `http://127.0.0.1:${config.proxyPort}`,
  VITE_PORT: String(config.webPort),
});

const assertPortAvailable = (port) =>
  new Promise((resolvePromise, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => {
      reject(new Error(`Refusing Gate 0 startup: port ${port} is already in use.`));
    });
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close(() => resolvePromise());
    });
  });

const start = async () => {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, '..');
  const config = resolveGate0Config(repoRoot);

  validateGate0Database(repoRoot, config.databasePath);
  await access(config.databasePath, constants.R_OK | constants.W_OK);

  if (process.argv.includes('--check')) {
    console.log(`Gate 0 database: ${GATE0_DATABASE_RELATIVE_PATH}`);
    console.log(
      `Gate 0 ports: API ${config.apiPort}, web ${config.webPort}, proxy ${config.proxyPort}`,
    );
    return;
  }

  await Promise.all([assertPortAvailable(config.apiPort), assertPortAvailable(config.webPort)]);

  const environment = createGate0Environment(process.env, config);
  const children = [
    spawn('pnpm', ['--filter', '@pulse/api', 'dev'], {
      cwd: repoRoot,
      env: environment,
      stdio: 'inherit',
    }),
    spawn(
      'pnpm',
      ['--filter', '@pulse/web', 'dev', '--host', '127.0.0.1', '--port', '5274', '--strictPort'],
      {
        cwd: repoRoot,
        env: environment,
        stdio: 'inherit',
      },
    ),
  ];

  console.log(`Gate 0 API: http://127.0.0.1:${config.apiPort}`);
  console.log(`Gate 0 web: http://127.0.0.1:${config.webPort}`);
  console.log(`Gate 0 database: ${GATE0_DATABASE_RELATIVE_PATH}`);
  console.log('Press Ctrl-C to stop both isolated development servers.');

  let shuttingDown = false;
  const shutdown = (signal, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) child.kill(signal);
    }
    process.exitCode = exitCode;
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  for (const child of children) {
    child.once('error', (error) => {
      console.error(`Gate 0 development process failed: ${error.message}`);
      shutdown('SIGTERM', 1);
    });
    child.once('exit', (code, signal) => {
      if (!shuttingDown) {
        console.error(
          `Gate 0 development process exited unexpectedly (${signal ?? `code ${code ?? 1}`}).`,
        );
        shutdown('SIGTERM', code ?? 1);
      }
    });
  }
};

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  start().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
