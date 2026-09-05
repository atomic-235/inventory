import { z } from 'zod';

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  code: z.string().default(''),
  category: z.string().default(''),
  quantity: z.coerce.number().int().positive().default(1),
  unit: z.string().default(''),
  purchase_date: z.string().default(''),
  purchase_price: z.coerce.number().nonnegative().nullable().default(null),
  condition: z.string().default(''),
  notes: z.string().default(''),
  parent_id: z.string().nullable().default(null),
  updated_at: z.coerce.number().int().nonnegative().default(0),
  deleted_at: z.coerce.number().int().nonnegative().nullable().default(null),
});

export type Item = z.infer<typeof ItemSchema>;

export const ItemFieldsSchema = ItemSchema.omit({ id: true });
export type ItemFields = z.infer<typeof ItemFieldsSchema>;
export type ItemFieldsInput = z.input<typeof ItemFieldsSchema>;
