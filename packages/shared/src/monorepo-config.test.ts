import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type TurboConfig = {
  tasks: {
    dev?: { persistent?: boolean; cache?: boolean };
    build?: { dependsOn?: string[]; outputs?: string[] };
    test?: { dependsOn?: string[] };
    lint?: Record<string, unknown>;
    typecheck?: Record<string, unknown>;
  };
};

describe('monorepo pipeline configuration', () => {
  it('defines the expected turbo task graph', async () => {
    const turboConfigPath = resolve(process.cwd(), '..', '..', 'turbo.json');
    const turboConfigRaw = await readFile(turboConfigPath, 'utf8');
    const turboConfig = JSON.parse(turboConfigRaw) as TurboConfig;

    expect(turboConfig.tasks.dev).toEqual({
      persistent: true,
      cache: false,
    });
    expect(turboConfig.tasks.build).toEqual({
      dependsOn: ['^build'],
      outputs: ['dist/**'],
    });
    expect(turboConfig.tasks.test).toEqual({
      dependsOn: ['build'],
    });
    expect(turboConfig.tasks.lint).toEqual({});
    expect(turboConfig.tasks.typecheck).toEqual({});
  });

  it('delegates root scripts to turbo run', async () => {
    const rootPackagePath = resolve(process.cwd(), '..', '..', 'package.json');
    const rootPackageRaw = await readFile(rootPackagePath, 'utf8');
    const rootPackage = JSON.parse(rootPackageRaw) as {
      scripts?: Record<string, string>;
    };

    expect(rootPackage.scripts?.dev).toBe('turbo run dev');
    expect(rootPackage.scripts?.build).toBe('turbo run build');
    expect(rootPackage.scripts?.test).toBe('turbo run test');
    expect(rootPackage.scripts?.lint).toBe('turbo run lint');
    expect(rootPackage.scripts?.typecheck).toBe('turbo run typecheck');
  });
});
