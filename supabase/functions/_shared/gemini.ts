const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';
const FALLBACK_GEMINI_MODEL = 'gemini-2.5-flash';

export function normalizeGeminiModelName(value: string | null | undefined, fallback: string) {
  const model = value?.trim() || fallback;
  return model.replace(/^models\//, '');
}

export const GEMINI_MODEL = normalizeGeminiModelName(Deno.env.get('GEMINI_MODEL'), DEFAULT_GEMINI_MODEL);
export const GEMINI_FALLBACK_MODEL = normalizeGeminiModelName(
  Deno.env.get('GEMINI_FALLBACK_MODEL'),
  FALLBACK_GEMINI_MODEL,
);

export type GeminiSchema = Record<string, unknown>;
type GeminiCallOptions = {
  includeResponseSchema?: boolean;
  fallbackModels?: string[];
  maxOutputTokens?: number;
  timeoutMs?: number;
  retryTemporaryUnavailable?: boolean;
};
export type GeminiModelInfo = {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
};
export type EdgeErrorCode =
  | 'MISSING_GEMINI_KEY'
  | 'MISSING_AI_PROVIDER_KEY'
  | 'INVALID_INPUT'
  | 'AI_MODEL_UNAVAILABLE'
  | 'AI_PERMISSION_DENIED'
  | 'AI_BAD_REQUEST'
  | 'AI_RATE_LIMITED'
  | 'GEMINI_ERROR'
  | 'AI_PROVIDER_ERROR'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_TEMPORARILY_UNAVAILABLE'
  | 'INVALID_AI_RESPONSE'
  | 'UNKNOWN_ERROR';

export class EdgeFunctionError extends Error {
  code: EdgeErrorCode;
  status: number;
  debug?: Record<string, unknown>;

  constructor(code: EdgeErrorCode, message: string, status = 500, debug?: Record<string, unknown>) {
    super(message);
    this.name = 'EdgeFunctionError';
    this.code = code;
    this.status = status;
    this.debug = debug;
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

function isModelUnavailableErrorText(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('model') &&
    (normalized.includes('not found') ||
      normalized.includes('not supported') ||
      normalized.includes('not available') ||
      normalized.includes('unavailable') ||
      normalized.includes('please update your code'))
  );
}

function getGeminiModelsToTry(primaryModel = GEMINI_MODEL, fallbackModels: string[] = [GEMINI_FALLBACK_MODEL]) {
  return [primaryModel, ...fallbackModels]
    .map((model) => normalizeGeminiModelName(model, ''))
    .filter((model, index, models) => model && models.indexOf(model) === index);
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function getDurationMs(startedAt: number) {
  return Date.now() - startedAt;
}

function getTemporaryUnavailableDelayMs() {
  return 700 + Math.floor(Math.random() * 501);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasGenerateContentSupport(model: GeminiModelInfo) {
  return Array.isArray(model.supportedGenerationMethods) &&
    model.supportedGenerationMethods.includes('generateContent');
}

function isLikelyTextGenerationModel(model: GeminiModelInfo) {
  const searchable = `${model.name} ${model.displayName ?? ''}`.toLowerCase();

  return (
    searchable.includes('gemini') &&
    !searchable.includes('embedding') &&
    !searchable.includes('imagen') &&
    !searchable.includes('image') &&
    !searchable.includes('veo') &&
    !searchable.includes('audio') &&
    !searchable.includes('live') &&
    !searchable.includes('tts')
  );
}

export async function listAvailableGeminiModels(apiKey: string): Promise<GeminiModelInfo[]> {
  console.log('[Gemini] list models request', {
    apiVersion: 'v1beta',
    hasApiKey: Boolean(apiKey),
    apiKeyPrefix: apiKey ? apiKey.slice(0, 6) : null,
  });

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const responseText = await response.text();
  const payload = responseText ? safeParseJson(responseText) : null;

  if (!response.ok) {
    const debug = getGeminiErrorDebug({
      model: 'models',
      response,
      payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null,
      responseText,
    });
    console.warn('[Gemini] list models failed', debug);
    throw new EdgeFunctionError(
      response.status === 403 ? 'AI_PERMISSION_DENIED' : 'GEMINI_ERROR',
      'Could not list available Gemini models.',
      response.status === 403 ? 403 : 500,
      debug,
    );
  }

  const models = payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).models)
    ? (payload as Record<string, unknown>).models as Record<string, unknown>[]
    : [];

  return models
    .map((model) => ({
      name: typeof model.name === 'string' ? model.name : '',
      displayName: typeof model.displayName === 'string' ? model.displayName : undefined,
      supportedGenerationMethods: Array.isArray(model.supportedGenerationMethods)
        ? model.supportedGenerationMethods.filter((method): method is string => typeof method === 'string')
        : [],
    }))
    .filter((model) => model.name);
}

export function pickBestGenerateContentModel(models: GeminiModelInfo[]) {
  const priority = [
    'gemini-3.1-flash-lite',
    'gemini-3-flash',
    'gemini-3.5-flash',
    'gemini-flash-latest',
  ];
  const candidates = models
    .filter(hasGenerateContentSupport)
    .filter(isLikelyTextGenerationModel)
    .map((model) => normalizeGeminiModelName(model.name, model.name));

  const uniqueCandidates = candidates.filter((model, index) => candidates.indexOf(model) === index);
  const priorityMatch = priority.find((model) => uniqueCandidates.includes(model));

  if (priorityMatch) {
    return priorityMatch;
  }

  return (
    uniqueCandidates.find((model) => model.includes('flash')) ??
    uniqueCandidates.find((model) => model.includes('gemini')) ??
    null
  );
}

function getGeminiErrorDebug(params: {
  model: string;
  response: Response;
  payload: Record<string, unknown> | null;
  responseText: string;
}) {
  const { model, payload, response, responseText } = params;
  const error = payload?.error && typeof payload.error === 'object'
    ? payload.error as Record<string, unknown>
    : null;

  return {
    model,
    status: response.status,
    statusText: response.statusText,
    errorStatus: typeof error?.status === 'string' ? error.status : null,
    errorCode: typeof error?.code === 'number' ? error.code : null,
    errorMessage: typeof error?.message === 'string' ? error.message : null,
    rawPreview: responseText.slice(0, 500),
  };
}

async function callGeminiJsonWithModel(
  prompt: string,
  responseSchema: GeminiSchema,
  model: string,
  options: GeminiCallOptions = {},
) {
  const startedAt = Date.now();
  const apiKey = Deno.env.get('GEMINI_API_KEY');

  if (!apiKey) {
    console.error('[Gemini] Missing GEMINI_API_KEY Supabase secret.');
    throw new EdgeFunctionError('MISSING_AI_PROVIDER_KEY', 'Gemini API key is not configured.');
  }

  console.log('[Gemini] request', {
    model,
    endpointModelPath: `models/${model}:generateContent`,
    apiVersion: 'v1beta',
    hasApiKey: Boolean(apiKey),
    apiKeyPrefix: apiKey ? apiKey.slice(0, 6) : null,
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          maxOutputTokens: options.maxOutputTokens ?? 512,
          ...(options.includeResponseSchema === false ? {} : { responseSchema }),
        },
      }),
    });
  } catch (error) {
    const durationMs = getDurationMs(startedAt);
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.warn('[Gemini] request timed out', { model, durationMs });
      throw new EdgeFunctionError(
        'AI_TEMPORARILY_UNAVAILABLE',
        'AI is taking too long. Please try again.',
        503,
        { model, durationMs, timeoutMs: options.timeoutMs ?? 12_000 },
      );
    }

    console.warn('[Gemini] request failed before response', {
      model,
      durationMs,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();
  const payload = responseText ? safeParseJson(responseText) : null;
  const durationMs = getDurationMs(startedAt);
  console.log('[Gemini] response', {
    model,
    status: response.status,
    durationMs,
  });

  if (!response.ok) {
    const debug = getGeminiErrorDebug({
      model,
      response,
      payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null,
      responseText,
    });
    const message =
      payload?.error?.message ??
      `Gemini request failed with status ${response.status}`;
    const errorText = `${message} ${JSON.stringify(payload ?? {})}`;
    console.warn('[Gemini] error response', debug);

    if (isQuotaErrorText(errorText)) {
      console.error('[Gemini] Quota exceeded', {
        model,
        status: response.status,
        message,
      });
      throw new EdgeFunctionError(
        'AI_QUOTA_EXCEEDED',
        'AI usage limit reached. Please try again later.',
        429,
        { ...debug, durationMs },
      );
    }

    if (isTemporaryUnavailableErrorText(errorText)) {
      console.error('[Gemini] Temporarily unavailable', {
        model,
        status: response.status,
        message,
      });
      throw new EdgeFunctionError(
        'AI_TEMPORARILY_UNAVAILABLE',
        'AI is busy right now. Please try again in a moment or add it manually.',
        503,
        { ...debug, durationMs },
      );
    }

    if ((response.status === 400 || response.status === 404) && isModelUnavailableErrorText(errorText)) {
      console.warn('[Gemini] Model unavailable', {
        model,
        status: response.status,
        message,
      });
      throw new EdgeFunctionError(
        'AI_MODEL_UNAVAILABLE',
        'AI model is temporarily unavailable. Please try again later.',
        503,
        { ...debug, durationMs },
      );
    }

    if (response.status === 403) {
      throw new EdgeFunctionError(
        'AI_PERMISSION_DENIED',
        'AI access is not permitted for this key or project.',
        403,
        { ...debug, durationMs },
      );
    }

    if (response.status === 400) {
      throw new EdgeFunctionError(
        'AI_BAD_REQUEST',
        'AI request was rejected by Gemini.',
        400,
        { ...debug, durationMs },
      );
    }

    if (response.status >= 500) {
      throw new EdgeFunctionError(
        'AI_TEMPORARILY_UNAVAILABLE',
        'AI is busy right now. Please try again in a moment or add it manually.',
        503,
        { ...debug, durationMs },
      );
    }

    console.error('[Gemini] Non-ok response', {
      model,
      status: response.status,
      message,
    });
    throw new EdgeFunctionError('GEMINI_ERROR', message, 500, { ...debug, durationMs });
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== 'string' || !text.trim()) {
    console.error('[Gemini] Empty response text', {
      model,
      candidateCount: Array.isArray(payload?.candidates) ? payload.candidates.length : 0,
    });
    throw new EdgeFunctionError('INVALID_AI_RESPONSE', 'Gemini returned no JSON text.');
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...parsed, model };
    }

    return parsed;
  } catch (error) {
    console.error('[Gemini] Failed to parse JSON response', {
      model,
      message: error instanceof Error ? error.message : String(error),
      textPreview: text.slice(0, 240),
    });
    throw new EdgeFunctionError('INVALID_AI_RESPONSE', 'Gemini returned invalid JSON.');
  }
}

export async function callGeminiJson(
  prompt: string,
  responseSchema: GeminiSchema,
  primaryModel = GEMINI_MODEL,
  options: GeminiCallOptions = {},
) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');

  if (!apiKey) {
    console.error('[Gemini] Missing GEMINI_API_KEY Supabase secret.');
    throw new EdgeFunctionError('MISSING_AI_PROVIDER_KEY', 'Gemini API key is not configured.');
  }

  let modelUnavailableError: EdgeFunctionError | null = null;

  const modelsToTry = getGeminiModelsToTry(primaryModel, options.fallbackModels);

  for (const model of modelsToTry) {
    try {
      return await callGeminiJsonWithModel(prompt, responseSchema, model, options);
    } catch (error) {
      if (
        options.retryTemporaryUnavailable &&
        error instanceof EdgeFunctionError &&
        error.code === 'AI_TEMPORARILY_UNAVAILABLE'
      ) {
        const delayMs = getTemporaryUnavailableDelayMs();
        console.warn('[Gemini] temporary unavailable, retrying once', {
          model,
          delayMs,
        });
        await sleep(delayMs);
        return await callGeminiJsonWithModel(prompt, responseSchema, model, {
          ...options,
          retryTemporaryUnavailable: false,
        });
      }

      if (error instanceof EdgeFunctionError && error.code === 'AI_MODEL_UNAVAILABLE') {
        modelUnavailableError = error;
        const nextModel = modelsToTry[modelsToTry.indexOf(model) + 1];
        if (nextModel) {
          console.warn('[Gemini] Retrying with fallback model', {
            failedModel: model,
            fallbackModel: nextModel,
          });
          continue;
        }
      }

      throw error;
    }
  }

  throw modelUnavailableError ??
    new EdgeFunctionError('AI_MODEL_UNAVAILABLE', 'AI model is temporarily unavailable. Please try again later.', 503);
}

export async function probeGeminiModels(models: string[]) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');

  if (!apiKey) {
    console.error('[Gemini] Missing GEMINI_API_KEY Supabase secret.');
    throw new EdgeFunctionError('MISSING_AI_PROVIDER_KEY', 'Gemini API key is not configured.');
  }

  const results = [];

  for (const rawModel of models) {
    const model = normalizeGeminiModelName(rawModel, rawModel);
    console.log('[Gemini] probe request', {
      model,
      endpointModelPath: `models/${model}:generateContent`,
      apiVersion: 'v1beta',
      hasApiKey: Boolean(apiKey),
      apiKeyPrefix: apiKey ? apiKey.slice(0, 6) : null,
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Return JSON: {"ok": true}' }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 64,
            temperature: 0,
          },
        }),
      },
    );
    const responseText = await response.text();
    const payload = responseText ? safeParseJson(responseText) : null;
    const debug = getGeminiErrorDebug({
      model,
      response,
      payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null,
      responseText,
    });

    results.push({
      model,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      errorStatus: debug.errorStatus,
      errorCode: debug.errorCode,
      errorMessage: debug.errorMessage,
      textPreview: response.ok ? responseText.slice(0, 200) : undefined,
    });
  }

  return results;
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
