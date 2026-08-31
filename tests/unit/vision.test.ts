import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downscale } from '../../src/data/camera';

describe('downscale', () => {
  it('returns same dimensions when within max edge', () => {
    expect(downscale(800, 600, 1800)).toEqual({ width: 800, height: 600 });
  });

  it('scales down the long edge to the max', () => {
    const result = downscale(3600, 1800, 1800);
    expect(result.width).toBe(1800);
    expect(result.height).toBe(900);
  });

  it('handles portrait orientation', () => {
    const result = downscale(1000, 4000, 1800);
    expect(result.height).toBe(1800);
    expect(result.width).toBe(450);
  });
});

// Vision extraction is covered via e2e (mocked provider), since it hits fetch + config.
import { extractItem } from '../../src/data/vision';

beforeEach(() => {
  vi.unstubAllGlobals();
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  });
});

function mockFetchResponse(content: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
        status: 200,
      }),
    ),
  );
}

describe('extractItem', () => {
  const valid = '{"name":"Camera","category":"Electronics","quantity":1,"unit":"","purchase_price":null,"condition":"good","notes":""}';

  function configure(): void {
    localStorage.setItem(
      'inventory.provider',
      JSON.stringify({ baseUrl: 'https://api.example.com/v1', apiKey: 'k', model: 'm' }),
    );
  }

  it('returns parsed ItemFields on success', async () => {
    configure();
    mockFetchResponse(valid);
    const result = await extractItem('data:image/jpeg;base64,abc');
    expect(result.name).toBe('Camera');
    expect(result.condition).toBe('good');
  });

  it('throws when provider is not configured', async () => {
    await expect(extractItem('data:image/jpeg;base64,abc')).rejects.toThrow('Provider not configured');
  });

  it('retries on invalid response and succeeds', async () => {
    configure();
    const fn = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'not json' } }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: valid } }] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fn);

    const result = await extractItem('data:image/jpeg;base64,abc');
    expect(result.name).toBe('Camera');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});