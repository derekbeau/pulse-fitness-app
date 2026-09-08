import type { FastifyReply } from 'fastify';

export const sendError = (
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
) =>
  reply.code(statusCode).send({
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  });
