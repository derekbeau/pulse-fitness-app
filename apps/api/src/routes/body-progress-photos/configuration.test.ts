import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { BODY_PROGRESS_PHOTO_MAX_REQUEST_BYTES } from '@pulse/shared';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(process.cwd(), '../..');

describe('progress photo production configuration', () => {
  it('keeps proxy and API limits aligned while isolating media from nginx', async () => {
    const [nginx, compose, dockerfile, entrypoint] = await Promise.all([
      readFile(resolve(repoRoot, 'nginx.conf'), 'utf8'),
      readFile(resolve(repoRoot, 'docker-compose.yml'), 'utf8'),
      readFile(resolve(repoRoot, 'Dockerfile'), 'utf8'),
      readFile(resolve(repoRoot, 'scripts/api-container-entrypoint.sh'), 'utf8'),
    ]);
    const nginxLimitMiB = Number(/client_max_body_size (\d+)m;/u.exec(nginx)?.[1]);
    expect(nginxLimitMiB * 1024 * 1024).toBeGreaterThanOrEqual(
      BODY_PROGRESS_PHOTO_MAX_REQUEST_BYTES,
    );
    expect(nginx).toContain('location ^~ /private/');
    expect(nginx).toContain('BODY_PROGRESS_PHOTO_SIZE_LIMIT');
    expect(compose).toContain('BODY_PROGRESS_MEDIA_KEY=${BODY_PROGRESS_MEDIA_KEY}');
    expect(compose).toContain('BODY_PROGRESS_MEDIA_ROOT=/data/private/body-progress');
    expect(compose.match(/pulse-data:\/data/gu)).toHaveLength(1);
    expect(dockerfile).toContain('pnpm rebuild better-sqlite3 sharp');
    expect(entrypoint).toContain('chmod 0700 "$(dirname "$media_root")" "$media_root"');
  });

  it('backs up database and ciphertext together while excluding the key', async () => {
    const backup = await readFile(resolve(repoRoot, 'scripts/backup-db.sh'), 'utf8');
    expect(backup).toContain("'media_key_included=false'");
    expect(backup).toContain('manifest.txt pulse.db private/body-progress');
    expect(backup).toContain('pulse-*.tar.gz');
    expect(backup).not.toMatch(/BODY_PROGRESS_MEDIA_KEY=|JWT_SECRET=/u);
  });
});
