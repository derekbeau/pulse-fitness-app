import type { FastifyInstance } from 'fastify';

export const SESSION_JWT_TYPE = 'session' as const;
export const SESSION_JWT_ISSUER = 'pulse-api' as const;
export const SESSION_JWT_EXPIRES_IN = '7d';

type SessionJwtOverrides = Partial<{
  expiresIn: string | number;
  iss: string;
  sub: string;
  type: string;
}>;

type SessionJwtPayloadInput = {
  sub: string;
  type?: string;
  iss?: string;
};

export type SessionJwtPayload = {
  sub: string;
  type: typeof SESSION_JWT_TYPE;
  iss: typeof SESSION_JWT_ISSUER;
  iat: number;
  exp: number;
};

export const buildSessionJwtPayload = (
  userId: string,
  overrides?: Pick<SessionJwtPayloadInput, 'type' | 'iss'>,
): SessionJwtPayloadInput => ({
  sub: userId,
  type: overrides?.type ?? SESSION_JWT_TYPE,
  iss: overrides?.iss ?? SESSION_JWT_ISSUER,
});

export const issueSessionJwt = (
  app: FastifyInstance,
  userId: string,
  overrides?: SessionJwtOverrides,
) =>
  app.jwt.sign(buildSessionJwtPayload(userId, overrides), {
    expiresIn: overrides?.expiresIn ?? SESSION_JWT_EXPIRES_IN,
  });
