import { z } from 'zod';

export const LOOKUP_TABLES = ['categories', 'locations', 'units', 'conditions'] as const;
export type LookupTable = (typeof LOOKUP_TABLES)[number];

export const LookupTableSchema = z.enum(LOOKUP_TABLES);

export const LookupSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export type Lookup = z.infer<typeof LookupSchema>;

export const MetaSchema = z.object({
  categories: z.array(LookupSchema),
  locations: z.array(LookupSchema),
  units: z.array(LookupSchema),
  conditions: z.array(LookupSchema),
});

export type Meta = z.infer<typeof MetaSchema>;