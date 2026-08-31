import { z } from 'zod';

export const SettingsSchema = z.object({
  baseUrl: z.string().default(''),
  apiKey: z.string().default(''),
  model: z.string().default(''),
});

export type ProviderConfig = z.infer<typeof SettingsSchema>;