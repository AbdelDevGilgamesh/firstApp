import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

import { supabase } from '@/src/lib/supabase';
import { ParsedNutritionFacts } from '@/src/utils/nutritionFactsParser';

const MAX_IMAGE_WIDTH = 1280;
const JPEG_QUALITY = 0.82;

export type NutritionVisionErrorCode =
  | 'SUPABASE_NOT_CONFIGURED'
  | 'MISSING_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'UNSUPPORTED_IMAGE_TYPE'
  | 'GEMINI_API_KEY_MISSING'
  | 'GEMINI_API_ERROR'
  | 'GEMINI_EMPTY_RESPONSE'
  | 'MISSING_GEMINI_KEY'
  | 'INVALID_IMAGE'
  | 'INVALID_INPUT'
  | 'AI_TEMPORARILY_UNAVAILABLE'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_RESPONSE_TRUNCATED'
  | 'INVALID_AI_RESPONSE'
  | 'LABEL_NOT_READABLE'
  | 'NO_NUTRITION_VALUES_FOUND'
  | 'UNKNOWN_ERROR';

export class NutritionVisionError extends Error {
  code: NutritionVisionErrorCode;

  constructor(code: NutritionVisionErrorCode, message: string) {
    super(message);
    this.name = 'NutritionVisionError';
    this.code = code;
  }
}

type NutritionVisionFunctionData = {
  success?: boolean;
  data?: {
    productName?: string | null;
    servingSize?: number | null;
    baseUnit?: 'g' | 'ml' | null;
    servingUnit?: 'g' | 'ml' | 'serving' | null;
    baseQuantity?: number | null;
    calories?: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
    sugars?: number | null;
    saturatedFat?: number | null;
    fiber?: number | null;
    salt?: number | null;
    confidence?: 'high' | 'medium' | 'low';
    notes?: string[];
  };
  code?: NutritionVisionErrorCode;
  error?: string;
  debug?: {
    stage?: string;
    model?: string;
    finishReason?: string;
    textLength?: number;
    rawPreview?: string;
    textPreview?: string;
  };
};

type ParseNutritionLabelImageParams = {
  imageUri: string;
  productName?: string;
  barcode?: string | null;
};

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
    throw new NutritionVisionError('INVALID_IMAGE', 'Could not prepare image for nutrition scan.');
  }

  if (__DEV__) {
    console.log('[Nutrition Vision] Image prepared', {
      sourceWidth: size?.width,
      sourceHeight: size?.height,
      outputWidth: result.width,
      outputHeight: result.height,
      base64Length: result.base64.length,
    });
  }

  return result.base64;
}

function readFunctionErrorCode(value: unknown): NutritionVisionErrorCode {
  if (value && typeof value === 'object' && 'code' in value && typeof value.code === 'string') {
    const code = value.code;

    if (
      code === 'MISSING_IMAGE' ||
      code === 'IMAGE_TOO_LARGE' ||
      code === 'UNSUPPORTED_IMAGE_TYPE' ||
      code === 'GEMINI_API_KEY_MISSING' ||
      code === 'GEMINI_API_ERROR' ||
      code === 'GEMINI_EMPTY_RESPONSE' ||
      code === 'AI_TEMPORARILY_UNAVAILABLE' ||
      code === 'AI_QUOTA_EXCEEDED' ||
      code === 'AI_RESPONSE_TRUNCATED' ||
      code === 'INVALID_AI_RESPONSE' ||
      code === 'LABEL_NOT_READABLE' ||
      code === 'NO_NUTRITION_VALUES_FOUND' ||
      code === 'MISSING_GEMINI_KEY' ||
      code === 'INVALID_INPUT' ||
      code === 'INVALID_IMAGE'
    ) {
      return code;
    }
  }

  return 'UNKNOWN_ERROR';
}

function isControlledVisionError(code: NutritionVisionErrorCode) {
  return (
    code === 'MISSING_IMAGE' ||
    code === 'IMAGE_TOO_LARGE' ||
    code === 'UNSUPPORTED_IMAGE_TYPE' ||
    code === 'GEMINI_API_KEY_MISSING' ||
    code === 'GEMINI_API_ERROR' ||
    code === 'GEMINI_EMPTY_RESPONSE' ||
    code === 'AI_TEMPORARILY_UNAVAILABLE' ||
    code === 'AI_QUOTA_EXCEEDED' ||
    code === 'AI_RESPONSE_TRUNCATED' ||
    code === 'INVALID_AI_RESPONSE' ||
    code === 'LABEL_NOT_READABLE' ||
    code === 'NO_NUTRITION_VALUES_FOUND' ||
    code === 'INVALID_INPUT'
  );
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

function toOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeParsedNutrition(data: NonNullable<NutritionVisionFunctionData['data']>): ParsedNutritionFacts {
  const calories = toOptionalNumber(data.calories);
  const protein = toOptionalNumber(data.protein);
  const carbs = toOptionalNumber(data.carbs);
  const fat = toOptionalNumber(data.fat);
  const sugar = toOptionalNumber(data.sugars);
  const salt = toOptionalNumber(data.salt);
  const saturatedFat = toOptionalNumber(data.saturatedFat);
  const unit = data.baseUnit === 'ml' || data.servingUnit === 'ml' ? 'ml' : 'g';
  const baseQuantity = toOptionalNumber(data.baseQuantity) ?? 100;
  const missingFields = [
    calories === undefined ? 'calories' : null,
    protein === undefined ? 'protein' : null,
    carbs === undefined ? 'carbs' : null,
    fat === undefined ? 'fat' : null,
  ].filter((field): field is string => Boolean(field));

  return {
    calories,
    protein,
    carbs,
    fat,
    sugar,
    salt,
    saturatedFat,
    servingSize: data.servingSize && data.servingUnit ? `${data.servingSize}${data.servingUnit}` : undefined,
    baseQuantity,
    unit,
    confidence: data.confidence === 'high' ? 'medium' : data.confidence === 'medium' ? 'medium' : 'low',
    missingFields,
    rawText: Array.isArray(data.notes) ? data.notes.join('\n') : 'Extracted with Gemini Vision.',
  };
}

export async function parseNutritionLabelImage({
  imageUri,
  productName,
  barcode,
}: ParseNutritionLabelImageParams): Promise<{
  parsed: ParsedNutritionFacts;
  productName?: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
}> {
  if (!supabase) {
    throw new NutritionVisionError('SUPABASE_NOT_CONFIGURED', 'Supabase is not configured.');
  }

  const imageBase64 = await prepareImage(imageUri);
  const { data, error } = await supabase.functions.invoke<NutritionVisionFunctionData>('nutrition-label-vision', {
    body: {
      imageBase64,
      mimeType: 'image/jpeg',
      productName,
      barcode,
    },
  });

  if (error) {
    const responseBody = await readFunctionErrorBody(error);
    const code = readFunctionErrorCode(responseBody);
    const message =
      responseBody && typeof responseBody === 'object' && 'error' in responseBody && typeof responseBody.error === 'string'
        ? responseBody.error
        : 'Could not read nutrition label.';

    if (__DEV__) {
      const debug =
        responseBody &&
        typeof responseBody === 'object' &&
        'debug' in responseBody &&
        responseBody.debug &&
        typeof responseBody.debug === 'object'
          ? responseBody.debug
          : null;

      if (
        debug &&
        'rawPreview' in debug &&
        typeof debug.rawPreview === 'string'
      ) {
        console.warn('[Nutrition Vision] Debug preview', debug.rawPreview);
      } else if (
        debug &&
        'textPreview' in debug &&
        typeof debug.textPreview === 'string'
      ) {
        console.warn('[Nutrition Vision] Debug preview', debug.textPreview);
      }

      if (isControlledVisionError(code)) {
        console.warn('[Nutrition Vision] extraction failed', {
          code,
          stage: 'stage' in (debug ?? {}) ? debug?.stage : undefined,
          model: 'model' in (debug ?? {}) ? debug?.model : undefined,
          finishReason: 'finishReason' in (debug ?? {}) ? debug?.finishReason : undefined,
          textLength: 'textLength' in (debug ?? {}) ? debug?.textLength : undefined,
        });
      } else {
        console.warn('[Nutrition Vision] Function failed', {
          code,
          message,
          errorMessage: error.message,
        });
      }
    }

    throw new NutritionVisionError(code, message);
  }

  if (!data?.success || !data.data) {
    throw new NutritionVisionError(
      readFunctionErrorCode(data),
      data?.error ?? 'Could not read nutrition label.',
    );
  }

  const parsed = normalizeParsedNutrition(data.data);
  return {
    parsed,
    productName: typeof data.data.productName === 'string' ? data.data.productName : undefined,
    confidence: data.data.confidence ?? 'low',
    notes: Array.isArray(data.data.notes) ? data.data.notes : [],
  };
}
