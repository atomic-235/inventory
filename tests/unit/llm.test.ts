import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { complete, structuredJson } from '../../src/llm/client';
import type { CompleteParams } from '../../src/llm/client';

const params: CompleteParams = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'secret',
  model: 'test-model',
  messages: [{ role: 'user', content: 'hi' }],
};

type MockCall = [
  string,
  { headers: Record<string, string>; body: string; method: string },
];

function mockFetch(data: unknown) {
  const fn = vi.fn(async (_url: string, _init: RequestInit) => {
    return new Response(JSON.stringify(data), { status: 200 });
  });
  vi.stubGlobal('fetch', fn);
  return {
    call: () => fn.mock.calls[0] as unknown as MockCall,
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('complete', () => {
  it('posts to /chat/completions with auth header and returns message', async () => {
    const fetchMock = mockFetch({
      choices: [{ message: { role: 'assistant', content: 'hello' } }],
    });

    const result = await complete(params);

    expect(result.content).toBe('hello');

    const [url, init] = fetchMock.call();
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer secret');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('passes tools and stream through when provided', async () => {
    const fetchMock = mockFetch({
      choices: [{ message: { role: 'assistant', content: '' } }],
    });

    await complete({ ...params, tools: [{ type: 'function' }], stream: true });

    const [, init] = fetchMock.call();
    const body = JSON.parse(init.body);
    expect(body.tools).toEqual([{ type: 'function' }]);
    expect(body.stream).toBe(true);
  });

  it('throws on non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad', { status: 401 })),
    );
    await expect(complete(params)).rejects.toThrow(/401/);
  });
});

describe('structuredJson', () => {
  const schema = z.object({ name: z.string() });

  it('sends json_schema response_format and zod-parses content when supportsResponseFormat', async () => {
    const fetchMock = mockFetch({
      choices: [{ message: { role: 'assistant', content: '{"name":"Lamp"}' } }],
    });

    const result = await structuredJson(schema, { ...params, supportsResponseFormat: true });

    expect(result).toEqual({ name: 'Lamp' });

    const [, init] = fetchMock.call();
    const body = JSON.parse(init.body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema).toBeTruthy();
  });

  it('omits response_format and zod-parses content by default (prompt-based JSON)', async () => {
    const fetchMock = mockFetch({
      choices: [{ message: { role: 'assistant', content: '{"name":"Lamp"}' } }],
    });

    const result = await structuredJson(schema, params);

    expect(result).toEqual({ name: 'Lamp' });

    const [, init] = fetchMock.call();
    const body = JSON.parse(init.body);
    expect(body.response_format).toBeUndefined();
    expect(body.messages[body.messages.length - 1].content).toContain('JSON object');
  });

  it('throws when content does not match the schema', async () => {
    mockFetch({ choices: [{ message: { role: 'assistant', content: '{"nope":1}' } }] });
    await expect(structuredJson(schema, params)).rejects.toThrow();
  });
});