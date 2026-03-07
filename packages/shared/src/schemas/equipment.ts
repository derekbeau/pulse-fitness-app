import { z } from 'zod';

export const equipmentItemCategorySchema = z.enum([
  'free-weights',
  'machines',
  'cables',
  'cardio',
  'accessories',
]);

export const equipmentLocationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().trim().min(1),
  notes: z.string().nullable(),
  createdAt: z.number().int(),
});

export const equipmentItemSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  name: z.string().trim().min(1),
  category: equipmentItemCategorySchema,
  details: z.string().nullable(),
  createdAt: z.number().int(),
});

export type EquipmentItemCategory = z.infer<typeof equipmentItemCategorySchema>;
export type EquipmentLocation = z.infer<typeof equipmentLocationSchema>;
export type EquipmentItem = z.infer<typeof equipmentItemSchema>;
