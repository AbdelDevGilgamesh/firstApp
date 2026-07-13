import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import {
  isTemporaryUnavailableErrorText,
  normalizeGeminiModelName,
} from '../_shared/gemini.ts';

type TranscriptionErrorCode =
  | 'MISSING_AUDIO'
  | 'AUDIO_TOO_LARGE'
  | 'UNSUPPORTED_AUDIO'
  | 'TRANSCRIPTION_FAILED'
  | 'AI_TEMPORARILY_UNAVAILABLE'
  | 'AI_TIMEOUT';

class TranscriptionError extends Error {
  code: TranscriptionErrorCode;
  status: number;
  debug?: Record<string, unknown>;

  constructor(code: TranscriptionErrorCode, message: string, status = 500, debug?: Record<string, unknown>) {
    super(message);
    this.name = 'TranscriptionError';
    this.code = code;
    this.status = status;
    this.debug = debug;
  }
}

const AUDIO_BASE64_MAX_LENGTH = 4_000_000;
const GEMINI_TIMEOUT_MS = 20_000;
const DEFAULT_TRANSCRIPTION_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
];

function isSupportedAudioMimeType(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.startsWith('audio/') &&
    !normalized.includes('x-ms') &&
    !normalized.includes('midi')
  );
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

function getTranscriptionModels() {
  const voiceModels = parseModelList(Deno.env.get('GEMINI_VOICE_MODELS'));
  const textModels = parseModelList(Deno.env.get('GEMINI_TEXT_MODELS'));
  const legacyModel = normalizeGeminiModelName(Deno.env.get('MEAL_VOICE_TRANSCRIPTION_MODEL'), '');
  const models = voiceModels.length > 0
    ? voiceModels
    : textModels.length > 0
      ? textModels
      : DEFAULT_TRANSCRIPTION_MODELS;

  return uniqueModels([...models, legacyModel, ...DEFAULT_TRANSCRIPTION_MODELS]);
}

function buildPrompt(languageHint?: string) {
  return [
    'Transcribe this meal voice note for a calorie tracker.',
    'Return ONLY compact JSON. No markdown. No explanation.',
    'Schema: {"description":string,"mealName":string|null,"confidence":"low"|"medium"|"high"}.',
    'Preserve spoken food names, quantities, units, sauces, drinks, and cooking methods.',
    'Do not estimate nutrition. Do not add ingredients that were not spoken.',
    'Do not translate; keep the spoken language as spoken.',
    languageHint ? `Language hint: ${languageHint}` : '',
  ].filter(Boolean).join('\n');
}

function extractText(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const candidate = (payload as Record<string, unknown>).candidates;
  if (!Array.isArray(candidate)) {
    return '';
  }

  const parts = candidate[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map((part) => typeof part?.text === 'string' ? part.text : '')
    .join(' ')
    .trim();
}

function parseJsonObject(rawText: string) {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
  } catch (_error) {
    return null;
  }
}

function normalizeConfidence(value: unknown) {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function parseTranscriptionResult(rawText: string) {
  const parsed = parseJsonObject(rawText);
  const description = typeof parsed?.description === 'string'
    ? parsed.description.trim()
    : typeof parsed?.transcript === 'string'
      ? parsed.transcript.trim()
      : rawText.trim();

  if (!description) {
    return null;
  }

  return {
    confidence: normalizeConfidence(parsed?.confidence),
    description: description.slice(0, 800),
    mealName: typeof parsed?.mealName === 'string' && parsed.mealName.trim()
      ? parsed.mealName.trim().slice(0, 120)
      : null,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiTranscription(params: {
  apiKey: string;
  audioBase64: string;
  languageHint?: string;
  mimeType: string;
  model: string;
}) {
  const { apiKey, audioBase64, languageHint, mimeType, model } = params;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: buildPrompt(languageHint) },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: audioBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 96,
            temperature: 0,
          },
        }),
      },
    );
    const responseText = await response.text();
    const payload = responseText ? JSON.parse(responseText) : null;
    const durationMs = Date.now() - startedAt;

    console.log('[Meal Voice] Gemini response', {
      model,
      status: response.status,
      durationMs,
      textLength: responseText.length,
    });

    if (!response.ok) {
      const message = payload?.error?.message ?? `Gemini returned status ${response.status}`;
      const errorText = `${message} ${responseText}`;
      console.warn('[Meal Voice] Gemini error', {
        model,
        status: response.status,
        message,
        rawPreview: responseText.slice(0, 300),
      });

      if (response.status === 503 || response.status === 429 || isTemporaryUnavailableErrorText(errorText)) {
        throw new TranscriptionError(
          'AI_TEMPORARILY_UNAVAILABLE',
          'Voice transcription is busy. Please try again in a moment.',
          503,
          { model, status: response.status, durationMs },
        );
      }

      throw new TranscriptionError(
        'TRANSCRIPTION_FAILED',
        'Could not transcribe meal voice recording.',
        500,
        { model, status: response.status, durationMs },
      );
    }

    const rawText = extractText(payload);
    const transcription = parseTranscriptionResult(rawText);

    if (!transcription) {
      throw new TranscriptionError(
        'TRANSCRIPTION_FAILED',
        'Could not transcribe meal voice recording.',
        422,
        { model, stage: 'empty_transcript', rawPreview: rawText.slice(0, 300), durationMs },
      );
    }

    return transcription;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TranscriptionError(
        'AI_TIMEOUT',
        'Voice transcription is taking too long. Please try again.',
        504,
        { model, stage: 'timeout', timeoutMs: GEMINI_TIMEOUT_MS },
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function transcribeWithFallback(params: {
  apiKey: string;
  audioBase64: string;
  languageHint?: string;
  mimeType: string;
}) {
  const models = getTranscriptionModels();
  const failures: Array<Record<string, unknown>> = [];

  console.log('[Meal Voice] resolved fallback models', { models });

  for (const model of models) {
    for (const attempt of [1, 2]) {
      console.log('[Meal Voice] Gemini attempt', { model, attempt });

      try {
        const result = await callGeminiTranscription({ ...params, model });
        console.log('[Meal Voice] Gemini success', { model, attempt });
        return { ...result, model };
      } catch (error) {
        if (!(error instanceof TranscriptionError)) {
          throw error;
        }

        failures.push({
          attempt,
          code: error.code,
          messagePreview: error.message.slice(0, 200),
          model,
          status: error.status,
        });
        console.warn('[Meal Voice] Gemini model failed', {
          model,
          attempt,
          code: error.code,
          status: error.status,
          messagePreview: error.message.slice(0, 200),
        });

        const canRetrySameModel =
          attempt === 1 &&
          (error.code === 'AI_TEMPORARILY_UNAVAILABLE' || error.code === 'AI_TIMEOUT');

        if (canRetrySameModel) {
          await sleep(700);
          continue;
        }

        break;
      }
    }
  }

  const allTimeout = failures.length > 0 && failures.every((failure) => failure.code === 'AI_TIMEOUT');
  throw new TranscriptionError(
    allTimeout ? 'AI_TIMEOUT' : 'AI_TEMPORARILY_UNAVAILABLE',
    allTimeout
      ? 'Voice transcription is taking too long. Please try again.'
      : 'Voice transcription is busy. Please try again in a moment.',
    allTimeout ? 504 : 503,
    { failures, models, stage: 'fallback_exhausted' },
  );
}

Deno.serve(async (request) => {
  const options = handleOptions(request);

  if (options) {
    return options;
  }

  try {
    if (request.method !== 'POST') {
      throw new TranscriptionError('TRANSCRIPTION_FAILED', 'Method not allowed.', 405);
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new TranscriptionError(
        'TRANSCRIPTION_FAILED',
        'Voice transcription is not configured.',
        500,
        { stage: 'missing_gemini_key' },
      );
    }

    const body = await request.json().catch(() => null);
    const audioBase64 = typeof body?.audioBase64 === 'string' ? body.audioBase64.trim() : '';
    const mimeType = typeof body?.mimeType === 'string' && body.mimeType.trim()
      ? body.mimeType.trim()
      : 'audio/m4a';
    const languageHint = typeof body?.languageHint === 'string' ? body.languageHint.trim().slice(0, 80) : undefined;

    if (!audioBase64) {
      throw new TranscriptionError('MISSING_AUDIO', 'No audio recording was provided.', 400);
    }

    if (audioBase64.length > AUDIO_BASE64_MAX_LENGTH) {
      throw new TranscriptionError('AUDIO_TOO_LARGE', 'Voice note is too long. Try a shorter description.', 413);
    }

    if (!isSupportedAudioMimeType(mimeType)) {
      throw new TranscriptionError('UNSUPPORTED_AUDIO', 'Unsupported audio recording type.', 415);
    }

    const transcription = await transcribeWithFallback({
      apiKey,
      audioBase64,
      languageHint,
      mimeType,
    });

    return jsonResponse({
      success: true,
      transcript: transcription.description,
      description: transcription.description,
      mealName: transcription.mealName,
      confidence: transcription.confidence,
      provider: 'gemini',
      model: transcription.model,
    });
  } catch (error) {
    if (error instanceof TranscriptionError) {
      console.warn('[Meal Voice] failed', {
        code: error.code,
        message: error.message,
        debug: error.debug,
      });
      return jsonResponse(
        {
          success: false,
          status: 'failed',
          code: error.code,
          error: error.message,
          debug: error.debug,
        },
        error.status,
      );
    }

    console.warn('[Meal Voice] unknown failure', {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(
      {
        success: false,
        status: 'failed',
        code: 'TRANSCRIPTION_FAILED',
        error: 'Could not transcribe meal voice recording.',
      },
      500,
    );
  }
});
