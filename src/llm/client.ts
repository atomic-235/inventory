import { z } from 'zod';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
}

export interface CompleteParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: object[];
  stream?: boolean;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
}

export async function complete(params: CompleteParams): Promise<AssistantMessage> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
  };
  if (params.tools?.length) body.tools = params.tools;
  if (params.stream) body.stream = true;

  const data = await postJson(params, body);
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error('LLM response missing message');
  return msg as AssistantMessage;
}

export async function structuredJson<T>(
  schema: z.ZodType<T>,
  params: CompleteParams & { responseFormatName?: string },
): Promise<T> {
  const jsonSchema = z.toJSONSchema(schema);

  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    response_format: {
      type: 'json_schema',
      json_schema: { name: params.responseFormatName ?? 'response', schema: jsonSchema },
    },
  };

  const data = await postJson(params, body);
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('LLM response missing content');

  return schema.parse(JSON.parse(content));
}

async function postJson(params: CompleteParams, body: Record<string, unknown>): Promise<any> {
  const url = `${params.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}