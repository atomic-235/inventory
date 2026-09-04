import { z } from 'zod';

export const SyncConfigSchema = z.object({
  endpoint: z.string().default(''),
  region: z.string().default('us-east-1'),
  bucket: z.string().default(''),
  path: z.string().default('inventory.sqlite'),
  accessKey: z.string().default(''),
  secretKey: z.string().default(''),
});

export type SyncConfig = z.infer<typeof SyncConfigSchema>;
