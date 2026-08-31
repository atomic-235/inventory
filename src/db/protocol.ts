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