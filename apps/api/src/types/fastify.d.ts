import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireAuth after successful authentication. */
    authType: 'jwt' | 'agent-token';
    agentTokenId?: string;
    userId: string;
  }
}

export {};
