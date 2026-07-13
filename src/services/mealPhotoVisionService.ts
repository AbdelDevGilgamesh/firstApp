import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

import { supabase } from '@/src/lib/supabase';

const MAX_IMAGE_WIDTH = 1280;
const JPEG_QUALITY = 0.85;
const MAX_BASE64_LENGTH = 2_500_000;
const CLIENT_TIMEOUT_MS = 30_000;

export type MealPhotoVisionErrorCode =
  | 'SUPABASE_NOT_CONFIGURED'
  | 'INVALID_INPUT'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_TEMPORARILY_UNAVAILABLE'
  | 'AI_TIMEOUT'
  | 'NO_FOOD_DETECTED'
  | 'INVALID_AI_RESPONSE'
  | 'MISSING_AI_PROVIDER_KEY'
  | 'UNKNOWN_ERROR';

export type MealPhotoVisionItem = {
  name: string;
  estimatedQuantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: 'low' | 'medium' | 'high';
  notes: string[];
};

export type MealPhotoVisionEstimate = {
  status: 'estimated';
  mealName: string;
  items: MealPhotoVisionItem[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  confidence: 'low' | 'medium' | 'high';
  notes: string[];
  provider: 'gemini' | 'demo';
  model: string | null;
  isDemo: boolean;
};

type MealPhotoFunctionResponse = {
  success?: boolean;
  data?: MealPhotoVisionEstimate;
  code?: MealPhotoVisionErrorCode;
  error?: string;
  debug?: Record<string, unknown>;
};

export class MealPhotoVisionError extends Error {
  code: MealPhotoVisionErrorCode;

  constructor(code: MealPhotoVisionErrorCode, message: string) {
    super(message);
    this.name = 'MealPhotoVisionError';
    this.code = code;
  }
}

function getImageSize(imageUri: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(
      imageUri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
}

async function prepareImage(imageUri: string) {
  const size = await getImageSize(imageUri).catch(() => null);
  const actions: ImageManipulator.Action[] =
    size && size.width > MAX_IMAGE_WIDTH
      ? [{ resize: { width: MAX_IMAGE_WIDTH } }]
      : [];
  const result = await ImageManipulator.manipulateAsync(imageUri, actions, {
    base64: true,
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  if (!result.base64) {
    throw new MealPhotoVisionError('INVALID_INPUT', 'Could not prepare meal photo.');
  }

  if (result.base64.length > MAX_BASE64_LENGTH) {
    throw new MealPhotoVisionError('INVALID_INPUT', 'Image is too large. Please choose a smaller photo.');
  }

  if (__DEV__) {
    console.log('[Meal Photo Vision] Image prepared', {
      sourceWidth: size?.width,
      sourceHeight: size?.height,
      outputWidth: result.width,
      outputHeight: result.height,
      base64Length: result.base64.length,
    });
  }

  return result.base64;
}

async function readFunctionErrorBody(error: unknown) {
  const context =
    error && typeof error === 'object' && 'context' in error
      ? (error.context as Partial<Response> | undefined)
      : undefined;

  if (!context || typeof context.json !== 'function') {
    return null;
  }

  return context.json().catch(() => null);
}

function readErrorCode(value: unknown): MealPhotoVisionErrorCode {
  if (value && typeof value === 'object' && 'code' in value && typeof value.code === 'string') {
    const code = value.code;

    if (
      code === 'INVALID_INPUT' ||
      code === 'AI_QUOTA_EXCEEDED' ||
      code === 'AI_TEMPORARILY_UNAVAILABLE' ||
      code === 'AI_TIMEOUT' ||
      code === 'NO_FOOD_DETECTED' ||
      code === 'INVALID_AI_RESPONSE' ||
      code === 'MISSING_AI_PROVIDER_KEY'
    ) {
      return code;
    }
  }

  return 'UNKNOWN_ERROR';
}

function withTimeout<T>(promise: Promise<T>) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new MealPhotoVisionError('AI_TIMEOUT', 'AI is taking too long. Please try again.'));
      }, CLIENT_TIMEOUT_MS);
    }),
  ]);
}

export async function estimateMealPhoto(imageUri: string): Promise<MealPhotoVisionEstimate> {
  if (!supabase) {
    throw new MealPhotoVisionError('SUPABASE_NOT_CONFIGURED', 'Supabase is not configured.');
  }

  const imageBase64 = await prepareImage(imageUri);
  const { data, error } = await withTimeout(
    supabase.functions.invoke<MealPhotoFunctionResponse>('meal-photo-estimate', {
      body: {
        imageBase64,
        mimeType: 'image/jpeg',
      },
    }),
  );

  if (error) {
    const responseBody = await readFunctionErrorBody(error);
    const code = readErrorCode(responseBody);
    const message =
      responseBody && typeof responseBody === 'object' && 'error' in responseBody && typeof responseBody.error === 'string'
        ? responseBody.error
        : 'Could not estimate this meal photo.';

    if (__DEV__) {
      console.warn('[Meal Photo Vision] estimate failed', {
        code,
        status: error.context?.status,
        responseBody,
        debug:
          responseBody &&
          typeof responseBody === 'object' &&
          'debug' in responseBody
            ? responseBody.debug
            : undefined,
      });
    }

    throw new MealPhotoVisionError(code, message);
  }

  if (!data?.success || !data.data) {
    if (__DEV__) {
      console.warn('[Meal Photo Vision] estimate failed', {
        code: readErrorCode(data),
        status: undefined,
        responseBody: data,
        debug: data?.debug,
      });
    }

    throw new MealPhotoVisionError(readErrorCode(data), data?.error ?? 'Could not estimate this meal photo.');
  }

  return data.data;
}
