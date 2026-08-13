#!/usr/bin/env node

import { lstatSync } from 'node:fs';
import process from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_REVIEWED_WEIGHT_MAP_PATH =
  '/run/pulse-secrets/body-weight-legacy-unit-map.json';

export function verifyReviewedWeightMapMount(
  mapPath = process.env.BODY_WEIGHT_LEGACY_UNIT_MAP_PATH ?? DEFAULT_REVIEWED_WEIGHT_MAP_PATH,
) {
  let stat;
  try {
    stat = lstatSync(mapPath);
  } catch {
    throw new Error(`Reviewed body-weight migration map is not mounted at ${mapPath}.`);
  }

  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('Reviewed body-weight migration map must be a regular, non-symlink file.');
  }

  if ((stat.mode & 0o077) !== 0) {
    throw new Error('Reviewed body-weight migration map must have mode 0600 or stricter.');
  }

  return mapPath;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    const mapPath = verifyReviewedWeightMapMount();
    process.stdout.write(`Reviewed body-weight migration map mount verified: ${mapPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
