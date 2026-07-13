const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash';
const DEFAULT_TEXT_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
];
const DEFAULT_VISION_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
];

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
  | 'AI_TIMEOUT'
  | 'NO_FOOD_DETECTED'
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

function parseModelList(value: string | null | undefined) {
  return (value ?? '')
    .split(',')
    .map((model) => normalizeGeminiModelName(model, ''))
    .filter((model, index, models) => model && models.indexOf(model) === index);
}

function uniqueModels(models: Array<string | null | undefined>) {
  return models
    .map((model) => normalizeGeminiModelName(model, ''))
    .filter((model, index, list) => model && list.indexOf(model) === index);
}

export function getGeminiTextModels(primaryModel?: string, fallbackModels: string[] = []) {
  const configured = parseModelList(Deno.env.get('GEMINI_TEXT_MODELS'));

  if (configured.length > 0) {
    return uniqueModels([...configured, ...fallbackModels, ...DEFAULT_TEXT_MODELS]);
  }

  const geminiModel = normalizeGeminiModelName(primaryModel ?? Deno.env.get('GEMINI_MODEL'), '');

  if (geminiModel) {
    return uniqueModels([geminiModel, ...fallbackModels, ...DEFAULT_TEXT_MODELS]);
  }

  return DEFAULT_TEXT_MODELS;
}

export function getGeminiVisionModels(primaryModel?: string, fallbackModels: string[] = []) {
  const configured = parseModelList(Deno.env.get('GEMINI_VISION_MODELS'));

  if (configured.length > 0) {
    return uniqueModels([...configured, ...fallbackModels, ...DEFAULT_VISION_MODELS]);
  }

  const visionModel = normalizeGeminiModelName(primaryModel ?? Deno.env.get('GEMINI_VISION_MODEL'), '');
  const geminiModel = normalizeGeminiModelName(Deno.env.get('GEMINI_MODEL'), '');

  if (visionModel || geminiModel) {
    return uniqueModels([visionModel, geminiModel, ...fallbackModels, ...DEFAULT_VISION_MODELS]);
  }

  return DEFAULT_VISION_MODELS;
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

function isFallbackableGeminiError(error: EdgeFunctionError) {
  return (
    error.code === 'AI_TEMPORARILY_UNAVAILABLE' ||
    error.code === 'AI_TIMEOUT' ||
    error.code === 'AI_MODEL_UNAVAILABLE' ||
    error.code === 'INVALID_AI_RESPONSE'
  );
}

function classifyGeminiHttpError(params: {
  model: string;
  response: Response;
  payload: Record<string, unknown> | null;
  responseText: string;
  durationMs: number;
}) {
  const { durationMs, model, payload, response, responseText } = params;
  const debug = getGeminiErrorDebug({ model, response, payload, responseText });
  const error = payload?.error && typeof payload.error === 'object'
    ? payload.error as Record<string, unknown>
    : null;
  const message =
    (typeof error?.message === 'string' ? error.message : null) ??
    `Gemini request failed with status ${response.status}`;
  const errorText = `${message} ${JSON.stringify(payload ?? {})}`;

  if (response.status === 429 || isQuotaErrorText(errorText)) {
    return new EdgeFunctionError(
      'AI_QUOTA_EXCEEDED',
      'AI usage limit reached. Please try again later.',
      429,
      { ...debug, durationMs },
    );
  }

  if (response.status === 503 || isTemporaryUnavailableErrorText(errorText)) {
    return new EdgeFunctionError(
      'AI_TEMPORARILY_UNAVAILABLE',
      'AI is busy right now. Please try again in a moment or add it manually.',
      503,
      { ...debug, durationMs },
    );
  }

  if ((response.status === 400 || response.status === 404) && isModelUnavailableErrorText(errorText)) {
    return new EdgeFunctionError(
      'AI_MODEL_UNAVAILABLE',
      'AI model is temporarily unavailable. Please try again later.',
      503,
      { ...debug, durationMs },
    );
  }

  if (response.status === 403) {
    return new EdgeFunctionError(
      'AI_PERMISSION_DENIED',
      'AI access is not permitted for this key or project.',
      403,
      { ...debug, durationMs },
    );
  }

  if (response.status === 400) {
    return new EdgeFunctionError(
      'AI_BAD_REQUEST',
      'AI request was rejected by Gemini.',
      400,
      { ...debug, durationMs },
    );
  }

  if (response.status >= 500) {
    return new EdgeFunctionError(
      'AI_TEMPORARILY_UNAVAILABLE',
      'AI is busy right now. Please try again in a moment or add it manually.',
      503,
      { ...debug, durationMs },
    );
  }

  return new EdgeFunctionError('GEMINI_ERROR', message, 500, { ...debug, durationMs });
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
    'gemini-3.5-flash',
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

export function extractGeminiText(payload: unknown) {
  const response = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  const candidate = candidates[0] && typeof candidates[0] === 'object'
    ? candidates[0] as Record<string, unknown>
    : null;
  const content = candidate?.content && typeof candidate.content === 'object'
    ? candidate.content as Record<string, unknown>
    : null;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const firstPart = parts[0] && typeof parts[0] === 'object'
    ? parts[0] as Record<string, unknown>
    : null;

  return {
    text: typeof firstPart?.text === 'string' ? firstPart.text : '',
    finishReason: typeof candidate?.finishReason === 'string' ? candidate.finishReason : undefined,
    candidateCount: candidates.length,
  };
}

export function parseGeminiJsonText(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const jsonText =
    firstBrace >= 0 && lastBrace > firstBrace
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned;

  return JSON.parse(jsonText);
}

export async function callGeminiWithFallback<T>({
  models,
  onAttempt,
  onFailure,
  onSuccess,
  payloadBuilder,
  parseResponse,
  taskType,
  timeoutMs = 12_000,
}: {
  models: string[];
  onAttempt?: (event: { model: string; attempt: number }) => void;
  onFailure?: (event: { model: string; attempt: number; error: EdgeFunctionError }) => void;
  onSuccess?: (event: { model: string }) => void;
  payloadBuilder: (model: string) => unknown;
  parseResponse: (payload: unknown, model: string) => T;
  taskType: string;
  timeoutMs?: number;
}): Promise<T & { provider: 'gemini'; model: string; isDemo: false }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');

  if (!apiKey) {
    console.error('[Gemini] Missing GEMINI_API_KEY Supabase secret.');
    throw new EdgeFunctionError('MISSING_AI_PROVIDER_KEY', 'Gemini API key is not configured.');
  }

  const modelsToTry = uniqueModels(models);
  console.log('[Gemini] resolved fallback models:', modelsToTry);
  let lastFallbackableError: EdgeFunctionError | null = null;
  const failures: Array<{
    model: string;
    attempt: number;
    code: string;
    status: number;
    messagePreview: string;
    rawPreview?: string;
    parsedPreview?: string;
    finalReason?: unknown;
  }> = [];

  function recordFailure(model: string, attempt: number, error: EdgeFunctionError) {
    const failure = {
      model,
      attempt,
      code: error.code,
      status: error.status,
      messagePreview: error.message.slice(0, 200),
      ...(typeof error.debug?.rawPreview === 'string' ? { rawPreview: error.debug.rawPreview.slice(0, 1000) } : {}),
      ...(typeof error.debug?.parsedPreview === 'string' ? { parsedPreview: error.debug.parsedPreview.slice(0, 1000) } : {}),
      ...('finalReason' in (error.debug ?? {}) ? { finalReason: error.debug?.finalReason } : {}),
    };
    failures.push(failure);
    onFailure?.({ model, attempt, error });
  }

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      console.log('[Gemini] attempt', { taskType, model, attempt });
      onAttempt?.({ model, attempt });

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify(payloadBuilder(model)),
          },
        );
        const responseText = await response.text();
        const payload = responseText ? safeParseJson(responseText) : null;
        const durationMs = getDurationMs(startedAt);

        if (!response.ok) {
          const error = classifyGeminiHttpError({
            model,
            response,
            payload: payload && typeof payload === 'object' && !Array.isArray(payload)
              ? payload as Record<string, unknown>
              : null,
            responseText,
            durationMs,
          });

          console.warn('[Gemini] model failed', {
            taskType,
            model,
            attempt,
            code: error.code,
            status: error.status,
          });
          recordFailure(model, attempt, error);

          if (error.code === 'AI_TEMPORARILY_UNAVAILABLE' && attempt === 1) {
            await sleep(700);
            continue;
          }

          if (isFallbackableGeminiError(error)) {
            lastFallbackableError = error;
            break;
          }

          throw error;
        }

        const result = parseResponse(payload, model);
        console.log('[Gemini] success', { taskType, model, durationMs });
        onSuccess?.({ model });
        return {
          ...result,
          provider: 'gemini',
          model,
          isDemo: false,
        };
      } catch (error) {
        const durationMs = getDurationMs(startedAt);

        if (error instanceof DOMException && error.name === 'AbortError') {
          const timeoutError = new EdgeFunctionError(
            'AI_TIMEOUT',
            'AI is taking too long. Please try again.',
            504,
            { model, taskType, durationMs, timeoutMs },
          );
          console.warn('[Gemini] model failed', {
            taskType,
            model,
            attempt,
            code: timeoutError.code,
            status: timeoutError.status,
          });
          recordFailure(model, attempt, timeoutError);

          if (attempt === 1) {
            await sleep(700);
            continue;
          }

          lastFallbackableError = timeoutError;
          break;
        }

        if (error instanceof EdgeFunctionError) {
          console.warn('[Gemini] model failed', {
            taskType,
            model,
            attempt,
            code: error.code,
            status: error.status,
          });
          recordFailure(model, attempt, error);

          if (error.code === 'AI_TEMPORARILY_UNAVAILABLE' && attempt === 1) {
            await sleep(700);
            continue;
          }

          if (isFallbackableGeminiError(error)) {
            lastFallbackableError = error;
            break;
          }
        }

        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  if (lastFallbackableError) {
    if (Deno.env.get('DEBUG_AI') === 'true') {
      lastFallbackableError.debug = {
        ...lastFallbackableError.debug,
        triedModels: modelsToTry,
        failures,
      };
    }

    throw lastFallbackableError;
  }

  throw new EdgeFunctionError(
    'AI_MODEL_UNAVAILABLE',
    'No compatible AI model is available for this project.',
    503,
    Deno.env.get('DEBUG_AI') === 'true' ? { triedModels: modelsToTry, failures } : undefined,
  );
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
    throw new EdgeFunctionError(
      'INVALID_AI_RESPONSE',
      'Gemini returned invalid JSON.',
      422,
      Deno.env.get('DEBUG_AI') === 'true'
        ? {
          model,
          rawPreview: text.slice(0, 1000),
          finalReason: 'json_parse_failed',
        }
        : { model },
    );
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

  let fallbackError: EdgeFunctionError | null = null;

  const modelsToTry = Deno.env.get('GEMINI_TEXT_MODELS')
    ? getGeminiTextModels(primaryModel, options.fallbackModels)
    : getGeminiModelsToTry(primaryModel, options.fallbackModels);
  console.log('[Gemini] resolved fallback models:', modelsToTry);

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
        try {
          return await callGeminiJsonWithModel(prompt, responseSchema, model, {
            ...options,
            retryTemporaryUnavailable: false,
          });
        } catch (retryError) {
          if (retryError instanceof EdgeFunctionError && isFallbackableGeminiError(retryError)) {
            fallbackError = retryError;
            continue;
          }

          throw retryError;
        }
      }

      if (error instanceof EdgeFunctionError && isFallbackableGeminiError(error)) {
        fallbackError = error;
        const nextModel = modelsToTry[modelsToTry.indexOf(model) + 1];
        if (nextModel) {
          console.warn('[Gemini] Retrying with fallback model', {
            failedModel: model,
            code: error.code,
            fallbackModel: nextModel,
          });
          continue;
        }
      }

      throw error;
    }
  }

  throw fallbackError ??
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
