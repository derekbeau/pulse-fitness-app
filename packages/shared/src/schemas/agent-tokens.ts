import { z } from 'zod';

export const createAgentTokenInputSchema = z.object({
  name: z.string().trim().min(1),
});

export type CreateAgentTokenInput = z.infer<typeof createAgentTokenInputSchema>;
