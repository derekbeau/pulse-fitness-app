import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('unified API documentation', () => {
  const currentFileDir = dirname(fileURLToPath(import.meta.url));
  const monorepoRoot = resolve(currentFileDir, '..', '..', '..');
  const agentsPath = resolve(monorepoRoot, 'AGENTS.md');
  const readmePath = resolve(monorepoRoot, 'README.md');
  const agentConventionPath = resolve(monorepoRoot, 'docs', 'conventions', 'agent-integration.md');
  const skillPath = resolve(monorepoRoot, '.agents', 'skills', 'pulse-app-usage', 'SKILL.md');

  it('documents the unified auth-aware /api/v1 surface in AGENTS.md', async () => {
    const agentsDoc = await readFile(agentsPath, 'utf8');

    expect(agentsDoc).not.toContain('/api/agent/');
    expect(agentsDoc).toContain('All API routes live under `/api/v1/`');
    expect(agentsDoc).toContain('Authorization: Bearer <jwt>');
    expect(agentsDoc).toContain('Authorization: AgentToken <token>');
    expect(agentsDoc).toContain('type: "session"');
    expect(agentsDoc).toContain('iss: "pulse-api"');
    expect(agentsDoc).toContain('agent?: AgentEnrichment');
  });

  it('documents auth-aware routing and optional agent enrichment in README.md', async () => {
    const readmeDoc = await readFile(readmePath, 'utf8');

    expect(readmeDoc).not.toContain('/api/agent/');
    expect(readmeDoc).toContain('Single API surface with auth-aware behavior');
    expect(readmeDoc).toContain('Bearer <jwt>');
    expect(readmeDoc).toContain('AgentToken <token>');
    expect(readmeDoc).toContain('"suggestedActions"');
  });

  it('documents agent workflows on unified /api/v1 endpoints in agent integration conventions', async () => {
    const agentConventionDoc = await readFile(agentConventionPath, 'utf8');

    expect(agentConventionDoc).not.toContain('/api/agent/');
    expect(agentConventionDoc).toContain('GET /api/v1/context');
    expect(agentConventionDoc).toContain('GET /api/v1/foods?q=<term>&limit=<n>');
    expect(agentConventionDoc).toContain('GET /api/v1/exercises?q=<term>&limit=<n>');
    expect(agentConventionDoc).toContain('Authorization: AgentToken <token>');
    expect(agentConventionDoc).toContain('optional `agent` field');
    expect(agentConventionDoc).toContain('suggestedActions');
  });

  it('documents agent workflows on /api/v1 endpoints in the pulse app usage skill', async () => {
    const skillDoc = await readFile(skillPath, 'utf8');

    expect(skillDoc).not.toContain('/api/agent/');
    expect(skillDoc).toContain('Authorization: AgentToken <token>');
    expect(skillDoc).toContain('GET /api/v1/exercises?q=<name>&limit=<n>');
    expect(skillDoc).toContain('POST /api/v1/workout-templates');
    expect(skillDoc).toContain('PATCH /api/v1/habits/:id/entries');
    expect(skillDoc).toContain('POST /api/v1/meals');
    expect(skillDoc).toContain('optional `agent` field');
  });
});
