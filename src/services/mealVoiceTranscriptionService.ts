import { supabase } from '@/src/lib/supabase';

export type MealVoiceTranscriptionErrorCode =
  | 'MISSING_AUDIO'
  | 'AUDIO_TOO_LARGE'
  | 'AUDIO_TOO_LONG'
  | 'UNSUPPORTED_AUDIO'
  | 'TRANSCRIPTION_FAILED'
  | 'AI_TEMPORARILY_UNAVAILABLE'
  | 'AI_TIMEOUT';

type SupabaseFunctionError = Error & {
  context?: unknown;
};

type MealVoiceTranscriptionResponse =
  | {
      success: true;
      transcript: string;
      description?: string;
      mealName?: string | null;
      confidence?: 'low' | 'medium' | 'high';
      detectedLanguage?: string;
      provider: string;
      model: string;
    }
  | {
      success: false;
      code: MealVoiceTranscriptionErrorCode;
      error: string;
      debug?: Record<string, unknown>;
    };

export class MealVoiceTranscriptionError extends Error {
  code: MealVoiceTranscriptionErrorCode;

  constructor(code: MealVoiceTranscriptionErrorCode, message: string) {
    super(message);
    this.name = 'MealVoiceTranscriptionError';
    this.code = code;
  }
}

const CLIENT_TIMEOUT_MS = 30_000;
const MAX_AUDIO_DURATION_MS = 30_000;
const MAX_AUDIO_BASE64_LENGTH = 4_000_000;

function getSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  return supabase;
}

function readBlobAsBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error('Could not read audio recording.'));
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

async function getFunctionErrorResponseBody(error: SupabaseFunctionError) {
  const context = error.context;

  if (!context || typeof context !== 'object') {
    return null;
  }

  const response = context as Response;

  if (typeof response.clone !== 'function') {
    return null;
  }

  try {
    const text = await response.clone().text();
    return text ? JSON.parse(text) : null;
  } catch (_error) {
    return null;
  }
}

function getFunctionErrorStatus(error: SupabaseFunctionError) {
  const context = error.context;

  if (!context || typeof context !== 'object') {
    return undefined;
  }

  const response = context as Response;
  return typeof response.status === 'number' ? response.status : undefined;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new MealVoiceTranscriptionError(
          'AI_TIMEOUT',
          'Voice transcription is taking too long. Please try again.',
        ),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

export async function transcribeMealVoiceRecording(params: {
  durationMs?: number;
  languageHint?: string;
  mimeType?: string;
  uri: string;
}) {
  const durationMs = typeof params.durationMs === 'number' ? params.durationMs : undefined;

  if (durationMs && durationMs > MAX_AUDIO_DURATION_MS) {
    throw new MealVoiceTranscriptionError(
      'AUDIO_TOO_LONG',
      'Voice note is too long. Try a shorter description.',
    );
  }

  const response = await fetch(params.uri);
  const blob = await response.blob();

  if (!blob.size) {
    throw new MealVoiceTranscriptionError('MISSING_AUDIO', 'No audio was recorded.');
  }

  const audioBase64 = await readBlobAsBase64(blob);

  if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
    throw new MealVoiceTranscriptionError(
      'AUDIO_TOO_LARGE',
      'Voice note is too long. Try a shorter description.',
    );
  }

  if (__DEV__) {
    console.log('[Meal Voice] audio prepared', {
      audioDurationMs: durationMs,
      audioFileSize: blob.size,
      base64Length: audioBase64.length,
      timeoutMs: CLIENT_TIMEOUT_MS,
    });
  }

  const client = getSupabaseClient();
  const { data, error } = await withTimeout(
    client.functions.invoke<MealVoiceTranscriptionResponse>(
      'transcribe-meal-voice',
      {
        body: {
          audioBase64,
          languageHint: params.languageHint,
          mimeType: params.mimeType ?? blob.type ?? 'audio/m4a',
        },
      },
    ),
    CLIENT_TIMEOUT_MS,
  );

  if (error) {
    const responseBody = await getFunctionErrorResponseBody(error as SupabaseFunctionError);
    const status = getFunctionErrorStatus(error as SupabaseFunctionError);
    const code =
      responseBody && typeof responseBody === 'object' && typeof responseBody.code === 'string'
        ? responseBody.code
        : 'TRANSCRIPTION_FAILED';
    const message =
      responseBody && typeof responseBody === 'object' && typeof responseBody.error === 'string'
        ? responseBody.error
        : 'Could not transcribe meal voice recording.';

    if (__DEV__) {
      console.warn('[Meal Voice] transcription failed', {
        code,
        status,
        responseBody,
        debug:
          responseBody && typeof responseBody === 'object'
            ? (responseBody as { debug?: unknown }).debug
            : undefined,
      });
    }

    if (
      code === 'MISSING_AUDIO' ||
      code === 'AUDIO_TOO_LARGE' ||
      code === 'AUDIO_TOO_LONG' ||
      code === 'UNSUPPORTED_AUDIO' ||
      code === 'AI_TEMPORARILY_UNAVAILABLE' ||
      code === 'AI_TIMEOUT' ||
      code === 'TRANSCRIPTION_FAILED'
    ) {
      throw new MealVoiceTranscriptionError(code, message);
    }

    throw new MealVoiceTranscriptionError('TRANSCRIPTION_FAILED', message);
  }

  if (!data?.success || !data.transcript?.trim()) {
    throw new MealVoiceTranscriptionError('TRANSCRIPTION_FAILED', 'Could not transcribe meal voice recording.');
  }

  return data;
}
