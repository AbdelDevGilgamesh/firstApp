import { supabase } from '@/src/lib/supabase';

export type AiAutofillConfidence = 'low' | 'medium';
export type AiAutofillProvider = 'unknown' | 'gemini' | 'openrouter' | 'groq' | 'demo';

type AiAutofillMetadata = {
  provider: AiAutofillProvider;
  model: string | null;
  isDemo: boolean;
};

export type AiMealIngredientEstimate = {
  name: string;
  quantityValue: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type AiMealEstimate = AiAutofillMetadata & {
  mealName: string;
  ingredients: AiMealIngredientEstimate[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  confidence: AiAutofillConfidence;
  notes: string[];
};

export type AiFoodEstimate = AiAutofillMetadata & {
  name: string;
  servingSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
  salt?: number;
  confidence: AiAutofillConfidence;
  notes: string[];
};

type AiFunctionName = 'ai-meal-estimate' | 'ai-food-autofill';
type AiAutofillErrorCode = 'AI_QUOTA_EXCEEDED' | 'AI_TEMPORARILY_UNAVAILABLE';
type SupabaseFunctionError = Error & {
  context?: unknown;
};
type FunctionErrorBody = {
  error?: string;
  code?: string;
};

export class AiAutofillError extends Error {
  code: AiAutofillErrorCode;

  constructor(code: AiAutofillErrorCode, message: string) {
    super(message);
    this.name = 'AiAutofillError';
    this.code = code;
  }
}

export function isAiQuotaExceededError(error: unknown) {
  return error instanceof AiAutofillError && error.code === 'AI_QUOTA_EXCEEDED';
}

export function isAiTemporarilyUnavailableError(error: unknown) {
  return error instanceof AiAutofillError && error.code === 'AI_TEMPORARILY_UNAVAILABLE';
}

function getSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  return supabase;
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toOptionalNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeConfidence(value: unknown): AiAutofillConfidence {
  return value === 'medium' ? 'medium' : 'low';
}

function normalizeNotes(value: unknown) {
  return Array.isArray(value)
    ? value.filter((note): note is string => typeof note === 'string').slice(0, 4)
    : [];
}

function normalizeProvider(value: unknown): AiAutofillProvider {
  return value === 'gemini' || value === 'openrouter' || value === 'groq' || value === 'demo'
    ? value
    : 'unknown';
}

function normalizeMetadata(value: Record<string, unknown>): AiAutofillMetadata {
  const provider = normalizeProvider(value.provider ?? value.aiProvider);

  return {
    provider,
    model: typeof value.model === 'string' && value.model.trim() ? value.model.trim() : null,
    isDemo: value.isDemo === true || provider === 'demo',
  };
}

function normalizeIngredient(value: unknown, index: number): AiMealIngredientEstimate {
  const ingredient = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const name = typeof ingredient.name === 'string' ? ingredient.name.trim() : '';

  if (!name) {
    throw new Error(`AI meal estimate ingredient ${index + 1} is missing a name.`);
  }

  return {
    name,
    quantityValue: round(Math.max(0, toFiniteNumber(ingredient.quantityValue, 1))),
    unit: typeof ingredient.unit === 'string' && ingredient.unit.trim() ? ingredient.unit.trim() : 'serving',
    calories: Math.round(Math.max(0, toFiniteNumber(ingredient.calories))),
    protein: round(Math.max(0, toFiniteNumber(ingredient.protein))),
    carbs: round(Math.max(0, toFiniteNumber(ingredient.carbs))),
    fat: round(Math.max(0, toFiniteNumber(ingredient.fat))),
  };
}

function normalizeMealEstimate(value: unknown): AiMealEstimate {
  const estimate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const ingredients = Array.isArray(estimate.ingredients)
    ? estimate.ingredients.map(normalizeIngredient)
    : [];

  if (ingredients.length === 0) {
    throw new Error('AI meal estimate returned no usable ingredients.');
  }

  const totals = ingredients.reduce(
    (sum, ingredient) => ({
      calories: sum.calories + ingredient.calories,
      protein: sum.protein + ingredient.protein,
      carbs: sum.carbs + ingredient.carbs,
      fat: sum.fat + ingredient.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const mealName = typeof estimate.mealName === 'string' ? estimate.mealName.trim() : '';

  return {
    mealName: mealName || 'AI estimated meal',
    ingredients,
    totalCalories: Math.round(toFiniteNumber(estimate.totalCalories, totals.calories)),
    totalProtein: round(toFiniteNumber(estimate.totalProtein, totals.protein)),
    totalCarbs: round(toFiniteNumber(estimate.totalCarbs, totals.carbs)),
    totalFat: round(toFiniteNumber(estimate.totalFat, totals.fat)),
    confidence: normalizeConfidence(estimate.confidence),
    notes: normalizeNotes(estimate.notes),
    ...normalizeMetadata(estimate),
  };
}

function normalizeFoodEstimate(value: unknown): AiFoodEstimate {
  const estimate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const name = typeof estimate.name === 'string' ? estimate.name.trim() : '';
  const calories = Math.round(Math.max(0, toFiniteNumber(estimate.calories, -1)));

  if (!name || calories < 0) {
    throw new Error('AI food estimate returned no usable nutrition data.');
  }

  const sugar = toOptionalNumber(estimate.sugar);
  const salt = toOptionalNumber(estimate.salt);

  return {
    name,
    servingSize:
      typeof estimate.servingSize === 'string' && estimate.servingSize.trim()
        ? estimate.servingSize.trim()
        : '1 serving',
    calories,
    protein: round(Math.max(0, toFiniteNumber(estimate.protein))),
    carbs: round(Math.max(0, toFiniteNumber(estimate.carbs))),
    fat: round(Math.max(0, toFiniteNumber(estimate.fat))),
    sugar: sugar === undefined ? undefined : round(Math.max(0, sugar)),
    salt: salt === undefined ? undefined : round(Math.max(0, salt)),
    confidence: normalizeConfidence(estimate.confidence),
    notes: normalizeNotes(estimate.notes),
    ...normalizeMetadata(estimate),
  };
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

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (_error) {
      return text;
    }
  } catch (bodyError) {
    return {
      readError: bodyError instanceof Error ? bodyError.message : String(bodyError),
    };
  }
}

function getFunctionErrorCode(responseBody: unknown) {
  if (!responseBody || typeof responseBody !== 'object') {
    return null;
  }

  const body = responseBody as FunctionErrorBody;
  return typeof body.code === 'string' ? body.code : null;
}

async function logFunctionInvokeError(
  functionName: AiFunctionName,
  error: SupabaseFunctionError,
  responseBody: unknown,
) {
  const context = error.context && typeof error.context === 'object'
    ? (error.context as Partial<Response>)
    : null;

  console.error('[AI Autofill] Supabase function error', {
    functionName,
    name: error.name,
    message: error.message,
    status: context?.status,
    statusText: context?.statusText,
    responseBody,
    context: error.context,
  });
}

async function invokeAiAutofillFunction(functionName: AiFunctionName, description: string) {
  const trimmedDescription = description.trim();

  if (trimmedDescription.length < 5) {
    throw new Error('Description is too short for AI autofill.');
  }

  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke(functionName, {
    body: { description: trimmedDescription },
  });

  if (error) {
    const functionError = error as SupabaseFunctionError;
    const responseBody = await getFunctionErrorResponseBody(functionError);
    await logFunctionInvokeError(functionName, functionError, responseBody);

    const functionErrorCode = getFunctionErrorCode(responseBody);

    if (functionErrorCode === 'AI_QUOTA_EXCEEDED') {
      const body = responseBody as FunctionErrorBody | null;
      const message =
        body && typeof body.error === 'string'
          ? body.error
          : 'AI usage limit reached. Please try again later.';
      throw new AiAutofillError('AI_QUOTA_EXCEEDED', message);
    }

    if (functionErrorCode === 'AI_TEMPORARILY_UNAVAILABLE') {
      const body = responseBody as FunctionErrorBody | null;
      const message =
        body && typeof body.error === 'string'
          ? body.error
          : 'AI is busy right now. Please try again in a moment or add it manually.';
      throw new AiAutofillError('AI_TEMPORARILY_UNAVAILABLE', message);
    }

    throw error;
  }

  if (!data) {
    throw new Error('AI autofill returned no data.');
  }

  return data;
}

export async function generateMealFromDescription(description: string): Promise<AiMealEstimate> {
  const data = await invokeAiAutofillFunction('ai-meal-estimate', description);
  return normalizeMealEstimate(data);
}

export async function generateFoodFromDescription(description: string): Promise<AiFoodEstimate> {
  const data = await invokeAiAutofillFunction('ai-food-autofill', description);
  return normalizeFoodEstimate(data);
}
