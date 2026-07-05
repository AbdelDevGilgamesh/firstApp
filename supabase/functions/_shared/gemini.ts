export const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash-lite';

export type GeminiSchema = Record<string, unknown>;
export type EdgeErrorCode =
  | 'MISSING_GEMINI_KEY'
  | 'MISSING_AI_PROVIDER_KEY'
  | 'INVALID_INPUT'
  | 'GEMINI_ERROR'
  | 'AI_PROVIDER_ERROR'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_TEMPORARILY_UNAVAILABLE'
  | 'INVALID_AI_RESPONSE'
  | 'UNKNOWN_ERROR';

export class EdgeFunctionError extends Error {
  code: EdgeErrorCode;
  status: number;

  constructor(code: EdgeErrorCode, message: string, status = 500) {
    super(message);
    this.name = 'EdgeFunctionError';
    this.code = code;
    this.status = status;
  }
}

export function isQuotaErrorText(value: string) {
  const normalized = value.toLowerCase();
  return (
    value.includes('Quota exceeded') ||
    value.includes('RESOURCE_EXHAUSTED') ||
    normalized.includes('rate-limits') ||
    normalized.includes('rate limit') ||
    normalized.includes('rate_limit') ||
    normalized.includes('quota')
  );
}

export function isTemporaryUnavailableErrorText(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('high demand') ||
    normalized.includes('temporarily') ||
    normalized.includes('try again later') ||
    normalized.includes('overloaded') ||
    normalized.includes('503') ||
    value.includes('UNAVAILABLE')
  );
}

export async function callGeminiJson(prompt: string, responseSchema: GeminiSchema) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');

  if (!apiKey) {
    console.error('[Gemini] Missing GEMINI_API_KEY Supabase secret.');
    throw new EdgeFunctionError('MISSING_AI_PROVIDER_KEY', 'Gemini API key is not configured.');
  }

  console.log('[AI Provider] Calling Gemini', { model: GEMINI_MODEL });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema,
      },
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error?.message ??
      `Gemini request failed with status ${response.status}`;
    const errorText = `${message} ${JSON.stringify(payload ?? {})}`;
    if (isQuotaErrorText(errorText)) {
      console.error('[Gemini] Quota exceeded', {
        status: response.status,
        message,
      });
      throw new EdgeFunctionError(
        'AI_QUOTA_EXCEEDED',
        'AI usage limit reached. Please try again later.',
        429,
      );
    }

    if (isTemporaryUnavailableErrorText(errorText)) {
      console.error('[Gemini] Temporarily unavailable', {
        status: response.status,
        message,
      });
      throw new EdgeFunctionError(
        'AI_TEMPORARILY_UNAVAILABLE',
        'AI is busy right now. Please try again in a moment or add it manually.',
        503,
      );
    }

    console.error('[Gemini] Non-ok response', {
      status: response.status,
      message,
    });
    throw new EdgeFunctionError('GEMINI_ERROR', message);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== 'string' || !text.trim()) {
    console.error('[Gemini] Empty response text', {
      candidateCount: Array.isArray(payload?.candidates) ? payload.candidates.length : 0,
    });
    throw new EdgeFunctionError('INVALID_AI_RESPONSE', 'Gemini returned no JSON text.');
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('[Gemini] Failed to parse JSON response', {
      message: error instanceof Error ? error.message : String(error),
      textPreview: text.slice(0, 240),
    });
    throw new EdgeFunctionError('INVALID_AI_RESPONSE', 'Gemini returned invalid JSON.');
  }
}

export function toFiniteNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function toOptionalNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

export function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function normalizeConfidence(value: unknown) {
  return value === 'medium' ? 'medium' : 'low';
}

export function normalizeNotes(value: unknown) {
  return Array.isArray(value)
    ? value.filter((note): note is string => typeof note === 'string').slice(0, 4)
    : [];
}

export async function readDescription(request: Request) {
  if (request.method !== 'POST') {
    console.error('[AI Autofill] Invalid request method', { method: request.method });
    throw new EdgeFunctionError('INVALID_INPUT', 'Method not allowed.', 400);
  }

  const body = await request.json().catch(() => null);
  const description = typeof body?.description === 'string' ? body.description.trim() : '';

  if (description.length < 5) {
    console.error('[AI Autofill] Invalid request body', {
      hasBody: Boolean(body),
      descriptionType: typeof body?.description,
      descriptionLength: description.length,
    });
    throw new EdgeFunctionError('INVALID_INPUT', 'Description must be at least 5 characters.', 400);
  }

  return description.slice(0, 1200);
}
