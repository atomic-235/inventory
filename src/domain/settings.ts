import { z } from 'zod';

export const SettingsSchema = z.object({
  baseUrl: z.string().default(''),
  apiKey: z.string().default(''),
  model: z.string().default(''),
  supportsResponseFormat: z.boolean().default(false),
});

export type ProviderConfig = z.infer<typeof SettingsSchema>;

export const SyncConfigSchema = z.object({
  endpoint: z.string().default(''),
  region: z.string().default('us-east-1'),
  bucket: z.string().default(''),
  path: z.string().default('inventory.sqlite'),
  accessKey: z.string().default(''),
  secretKey: z.string().default(''),
});

export type SyncConfig = z.infer<typeof SyncConfigSchema>;