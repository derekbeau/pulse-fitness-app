# API Conventions

Pulse uses Fastify plugins plus shared Zod schemas. This document defines the unified `/api/v1/*` route layout, request validation rules, auth middleware contracts, and the response envelope every API route should follow.

## Route Structure

- App routes live under `/api/v1/`.
- Single API surface with auth-aware behavior replaces separate user and agent route trees.
- Most routes accept either JWT or AgentToken auth on the same endpoint.
- Use one request schema per endpoint body/params/query definition. Do not branch contracts by auth mode.
- Agent-only capabilities stay on the same `/api/v1/*` surface and may layer `requireAgentOnly` after `requireAuth`, for example `/api/v1/context`.
- Health and infrastructure checks may live outside the versioned prefix, for example `/health`.
- Group routes by domain plugin, then register each plugin with a prefix in `apps/api/src/index.ts`.

Current examples:

- `/api/v1/auth/register`
- `/api/v1/auth/login`
- `/api/v1/agent-tokens`
- `/api/v1/context`

## Request Validation

- Validate every request boundary with Zod: body, querystring, params, and headers when applicable.
- Shared request and response schemas belong in `packages/shared/src/schemas/`.
- Unified schemas may include optional convenience aliases (for example `foodName`, `exerciseName`, `reps` shorthand); route handlers should consume canonical fields after middleware transforms.
- Route handlers should use `safeParse` when they need custom error envelopes instead of Fastify's default validation output.
- Reject malformed input with `400` and the standard error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload"
  }
}
```

Common validation rules:

- Dates use `YYYY-MM-DD`.
- Pagination uses integer `page` and `limit`.
- Optional strings should be `.trim()`-ed and, when meaningful, `.min(1)`.
- Auth-normalized identifiers such as usernames should be transformed in the shared schema so register and login behave identically.

## Agent Middleware Pattern

Unified routes with agent conveniences should use middleware hooks instead of route-level auth branching:

- `preHandler: agentRequestTransform` resolves names, expands shorthand fields, and performs agent auto-create behavior for AgentToken requests.
- `onSend: agentEnrichmentOnSend` appends optional `agent` guidance from request context when available.
- Handlers should implement one canonical write/read path and avoid `isAgentRequest()` schema branching.

## Authentication

Three auth hooks are available:

- `requireAuth`: accepts either `Authorization: Bearer <jwt>` or `Authorization: AgentToken <token>`.
- `requireUserAuth`: accepts only `Authorization: Bearer <jwt>`.
- `requireAgentOnly`: accepts only `Authorization: AgentToken <token>` after `requireAuth` has populated auth context.

Rules:

- Most application data routes should use `requireAuth`.
- User-account and credential-management routes should use `requireUserAuth`.
- Agent token CRUD is JWT-only, so `/api/v1/agent-tokens` uses `requireUserAuth`.
- Agent-only planning routes such as `/api/v1/context` should use `requireAuth` plus `requireAgentOnly`.
- JWTs issued by Pulse must include `type: "session"` and `iss: "pulse-api"` claims; hand-crafted JWTs without those claims are rejected.
- Agent tokens are bearer secrets stored only as hashes and validated on every request.
- After a successful auth hook, handlers may rely on `request.userId`.
- Agent-token requests may also rely on `request.agentTokenId`.
- Agent-token `lastUsedAt` updates are best-effort and must not fail an otherwise valid request.

## Response Envelope

Base success responses return `{ data: T }`.

Unified routes that add agent guidance may return `{ data: T, agent?: AgentEnrichment }`.

```json
{
  "data": {
    "id": "tok_123",
    "name": "Meal Agent"
  }
}
```

Agent-aware responses may include hints, `"suggestedActions"`, and `relatedState`:

```json
{
  "data": {
    "id": "meal-1"
  },
  "agent": {
    "hints": ["Lunch adds 536 kcal and 66.3g protein."],
    "suggestedActions": ["Review today's nutrition summary next."],
    "relatedState": {
      "date": "2026-03-09"
    }
  }
}
```

List responses return `{ data: T[], meta: { page, limit, total } }`. Routes may also add optional agent enrichment when the shared schema supports it: `{ data: T[], meta: { page, limit, total }, agent?: AgentEnrichment }`.

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 0
  }
}
```

Error responses return `{ error: { code, message } }`.

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

Use `apps/api/src/lib/reply.ts` helpers for shared error formatting instead of ad hoc reply bodies.

## Standard Error Codes

These error codes are the base vocabulary across routes:

- `UNAUTHORIZED`: missing or invalid authentication
- `FORBIDDEN`: authenticated but not allowed to act on the resource
- `NOT_FOUND`: resource does not exist in the caller's scope
- `VALIDATION_ERROR`: request payload, params, or query failed validation
- `CONFLICT`: write would violate a uniqueness or state constraint
- `INTERNAL_ERROR`: unexpected server failure

Domain-specific codes may extend the base set when they improve caller behavior, for example:

- `INVALID_CREDENTIALS`
- `USERNAME_TAKEN`
- `AGENT_TOKEN_NOT_FOUND`
- `WORKOUT_SESSION_ACTIVE_SECTION_REQUIRED`
- `WORKOUT_SESSION_SECTION_SWITCH_REQUIRES_PAUSE`
- `WORKOUT_SESSION_SECTION_TIMER_REQUIRES_IN_PROGRESS`
- `WORKOUT_SESSION_SECTION_TIMER_PAUSE_MISMATCH`

Status-code guidance:

- `400` -> `VALIDATION_ERROR`
- `401` -> `UNAUTHORIZED` or auth-specific invalid-credential codes
- `403` -> `FORBIDDEN`
- `404` -> `NOT_FOUND` or resource-specific not-found codes
- `409` -> `CONFLICT` or domain-specific uniqueness/state conflicts
- `500` -> `INTERNAL_ERROR`

## Pagination Pattern

Collection routes should support:

- `page`: default `1`
- `limit`: default `50`, max `100`

Response metadata must include:

- `page`
- `limit`
- `total`

Additional pagination rules:

- Apply pagination after user scoping and filters.
- Use a stable sort order before paginating.
- Keep `total` scoped to the same filters as `data`.

## Date Range Queries

List and reporting routes that query time-series data should accept:

- `from`: inclusive lower bound in `YYYY-MM-DD`
- `to`: inclusive upper bound in `YYYY-MM-DD`

Guidelines:

- Validate both with the shared date schema.
- Allow either bound independently when that makes sense for the route.
- Document whether the range applies to `date`, `effectiveDate`, `onsetDate`, or another domain-specific field.
- Prefer server-side range filtering over fetching all rows and slicing in memory.

## Route Design Guidelines

- Use resource-oriented nouns in the URL and keep verbs in the HTTP method.
- Scope every query by `request.userId` unless the route is intentionally public.
- For child resources, validate parent ownership before returning or mutating data.
- Return `404` instead of leaking whether a resource belongs to another user.
- Keep route plugins thin: validation, auth, and envelope formatting in the route; query details in a store or service module.
- Use shared schemas from `@pulse/shared` as the single source of truth for API contracts.
- Do not introduce new legacy agent-only routes. Agent-specific behavior belongs on the unified `/api/v1/*` surface.
