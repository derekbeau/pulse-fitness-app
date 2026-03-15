import type { FastifyInstance } from 'fastify';

export const SESSION_JWT_TYPE = 'session' as const;
export const SESSION_JWT_ISSUER = 'pulse-api' as const;
export const SESSION_JWT_EXPIRES_IN = '7d';

type SessionJwtIssueOptions = Partial<{
  expiresIn: string | number;
}>;

export type SessionJwtPayload = {
  sub: string;
  type: typeof SESSION_JWT_TYPE;
  iss: typeof SESSION_JWT_ISSUER;
  iat: number;
  exp: number;
};

const buildSessionJwtPayload = (userId: string) => ({
  sub: userId,
  type: SESSION_JWT_TYPE,
  iss: SESSION_JWT_ISSUER,
});

export const issueSessionJwt = (
  app: FastifyInstance,
  userId: string,
  options?: SessionJwtIssueOptions,
) =>
  app.jwt.sign(buildSessionJwtPayload(userId), {
    expiresIn: options?.expiresIn ?? SESSION_JWT_EXPIRES_IN,
  });
