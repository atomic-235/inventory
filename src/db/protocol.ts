import { z } from 'zod';
import { ItemSchema } from '../domain/item';

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

export const RequestSchema = z.discriminatedUnion('type', [
  ListRequest,
  InsertRequest,
  UpdateRequest,
  RemoveRequest,
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