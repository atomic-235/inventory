import { loadConfig } from './config';
import { structuredJson } from '../llm/client';
import type { ChatMessage } from '../llm/client';
import { ItemFieldsSchema } from '../domain/item';
import type { ItemFields } from '../domain/item';

const SYSTEM_PROMPT = [
  'Extract structured inventory data from a photo of an item/product.',
  'Return JSON with ONLY these fields:',
  'name (string, required), category (string), quantity (positive integer, default 1),',
  'unit (string), purchase_price (number or null), condition (string), notes (string).',
  'Leave unknown optional fields as empty string.',
].join(' ');

export async function extractItem(
  imageBase64: string,
  maxRetries = 3,
): Promise<ItemFields> {
  const cfg = loadConfig();
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
    throw new Error('Provider not configured');
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract the inventory item from this photo.' },
        { type: 'image_url', image_url: { url: imageBase64 } },
      ],
    },
  ];

  let lastError = '';
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await structuredJson(ItemFieldsSchema, {
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        messages,
        responseFormatName: 'item',
        supportsResponseFormat: cfg.supportsResponseFormat,
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      messages.push({
        role: 'user',
        content: `Your previous response was invalid: ${lastError}. Return a valid JSON object with only the item fields.`,
      });
    }
  }

  throw new Error(`Failed to extract item after ${maxRetries} attempts: ${lastError}`);
}