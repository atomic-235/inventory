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
  supportsResponseFormat?: boolean;
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

function parseJsonContent<T>(schema: z.ZodType<T>, content: string): T {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return schema.parse(JSON.parse(text));
}

function messageContent(data: any): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('LLM response missing content');
  return content;
}

export async function structuredJson<T>(
  schema: z.ZodType<T>,
  params: CompleteParams & { responseFormatName?: string },
): Promise<T> {
  const messages: ChatMessage[] = params.supportsResponseFormat
    ? params.messages
    : [
        ...params.messages,
        {
          role: 'system',
          content: 'Respond with a single JSON object and nothing else. Do not wrap it in markdown code fences.',
        },
      ];

  const body: Record<string, unknown> = {
    model: params.model,
    messages,
  };
  if (params.supportsResponseFormat) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: params.responseFormatName ?? 'response',
        schema: z.toJSONSchema(schema),
      },
    };
  }

  const data = await postJson(params, body);
  return parseJsonContent(schema, messageContent(data));
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