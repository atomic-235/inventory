import { z } from 'zod';
import { ItemSchema } from '../domain/item';
import { MetaSchema, LookupSchema, LookupTableSchema } from '../domain/lookup';

export const ListRequest = z.object({
  type: z.literal('list'),
  requestId: z.string(),
});

export const InsertRequest = z.object({
  type: z.literal('insert'),
  requestId: z.string(),
  item: ItemSchema,
});

export const UpdateRequest = z.object({
  type: z.literal('update'),
  requestId: z.string(),
  item: ItemSchema,
});

export const RemoveRequest = z.object({
  type: z.literal('remove'),
  requestId: z.string(),
  id: z.string(),
});

export const ExportRequest = z.object({
  type: z.literal('export'),
  requestId: z.string(),
});

export const ImportRequest = z.object({
  type: z.literal('import'),
  requestId: z.string(),
  data: z.instanceof(Uint8Array),
});

export const GetMetaRequest = z.object({
  type: z.literal('getMeta'),
  requestId: z.string(),
});

export const GetSettingsRequest = z.object({
  type: z.literal('getSettings'),
  requestId: z.string(),
});

export const SaveSettingsRequest = z.object({
  type: z.literal('saveSettings'),
  requestId: z.string(),
  value: z.string(),
});

export const GetSyncSettingsRequest = z.object({
  type: z.literal('getSyncSettings'),
  requestId: z.string(),
});

export const SaveSyncSettingsRequest = z.object({
  type: z.literal('saveSyncSettings'),
  requestId: z.string(),
  value: z.string(),
});

export const ListAllItemsRequest = z.object({
  type: z.literal('listAllItems'),
  requestId: z.string(),
});

export const ReadBlobItemsRequest = z.object({
  type: z.literal('readBlobItems'),
  requestId: z.string(),
  data: z.instanceof(Uint8Array),
});

export const ReadBlobSettingsRequest = z.object({
  type: z.literal('readBlobSettings'),
  requestId: z.string(),
  data: z.instanceof(Uint8Array),
});

export const MergeSettingsRequest = z.object({
  type: z.literal('mergeSettings'),
  requestId: z.string(),
  settings: z.record(z.string(), z.string()),
});export const ReplaceItemsRequest = z.object({
  type: z.literal('replaceItems'),
  requestId: z.string(),
  items: z.array(ItemSchema),
});

export const LookupAddRequest = z.object({
  type: z.literal('lookupAdd'),
  requestId: z.string(),
  table: LookupTableSchema,
  name: z.string().min(1),
});

export const LookupRenameRequest = z.object({
  type: z.literal('lookupRename'),
  requestId: z.string(),
  table: LookupTableSchema,
  id: z.number(),
  name: z.string().min(1),
});

export const LookupRemoveRequest = z.object({
  type: z.literal('lookupRemove'),
  requestId: z.string(),
  table: LookupTableSchema,
  id: z.number(),
});

export const RequestSchema = z.discriminatedUnion('type', [
  ListRequest,
  InsertRequest,
  UpdateRequest,
  RemoveRequest,
  ExportRequest,
  ImportRequest,
  GetMetaRequest,
  GetSettingsRequest,
  SaveSettingsRequest,
  GetSyncSettingsRequest,
  SaveSyncSettingsRequest,
  ListAllItemsRequest,
  ReadBlobItemsRequest,
  ReadBlobSettingsRequest,
  MergeSettingsRequest,
  ReplaceItemsRequest,
  LookupAddRequest,
  LookupRenameRequest,
  LookupRemoveRequest,
]);

export type Request = z.infer<typeof RequestSchema>;

export const OkResponse = z.object({
  type: z.literal('ok'),
  requestId: z.string(),
  data: z.unknown().optional(),
});

export const ErrorResponse = z.object({
  type: z.literal('error'),
  requestId: z.string(),
  message: z.string(),
});

export const ResponseSchema = z.discriminatedUnion('type', [
  OkResponse,
  ErrorResponse,
]);

export type Response = z.infer<typeof ResponseSchema>;

export const ListResult = z.array(ItemSchema);
export type ListResult = z.infer<typeof ListResult>;

export type MetaResult = z.infer<typeof MetaSchema>;
export type LookupResult = z.infer<typeof LookupSchema>;