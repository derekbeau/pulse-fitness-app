import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireAuth/requireUserAuth after successful authentication. */
    userId: string;
  }
}

export {};
