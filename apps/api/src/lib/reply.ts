import type { FastifyReply } from 'fastify';

export const sendError = (reply: FastifyReply, statusCode: number, code: string, message: string) =>
  reply.code(statusCode).send({
    error: {
      code,
      message,
    },
  });
