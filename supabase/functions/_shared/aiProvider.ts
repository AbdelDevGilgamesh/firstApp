import {
  callGeminiJson,
  EdgeFunctionError,
  GEMINI_MODEL,
  isQuotaErrorText,
  isTemporaryUnavailableErrorText,
  normalizeConfidence,
  normalizeNotes,
  round,
  toFiniteNumber,
  toOptionalNumber,
} from './gemini.ts';

type AiProvider = 'gemini' | 'openrouter' | 'groq' | 'demo';
type EstimateKind = 'meal' | 'food';

const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.1-8b-instruct:free';
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';

function getProviderModel(provider: AiProvider) {
  if (provider === 'demo') {
    return null;
  }

  if (provider === 'gemini') {
    return GEMINI_MODEL;
  }

  if (provider === 'openrouter') {
    return Deno.env.get('OPENROUTER_MODEL') || DEFAULT_OPENROUTER_MODEL;
  }

  return Deno.env.get('GROQ_MODEL') || DEFAULT_GROQ_MODEL;
}

function withProviderMetadata<T extends Record<string, unknown>>(estimate: T, provider: AiProvider) {
  return {
    ...estimate,
    provider,
    model: getProviderModel(provider),
    isDemo: provider === 'demo',
  };
}

const mealEstimateSchema = {
  type: 'object',
  properties: {
    mealName: { type: 'string' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantityValue: { type: 'number' },
          unit: { type: 'string' },
          calories: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
        },
        required: ['name', 'quantityValue', 'unit', 'calories', 'protein', 'carbs', 'fat'],
      },
    },
    totalCalories: { type: 'number' },
    totalProtein: { type: 'number' },
    totalCarbs: { type: 'number' },
    totalFat: { type: 'number' },
    confidence: { type: 'string', enum: ['low', 'medium'] },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'mealName',
    'ingredients',
    'totalCalories',
    'totalProtein',
    'totalCarbs',
    'totalFat',
    'confidence',
    'notes',
  ],
};

const foodEstimateSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    servingSize: { type: 'string' },
    calories: { type: 'number' },
    protein: { type: 'number' },
    carbs: { type: 'number' },
    fat: { type: 'number' },
    sugar: { type: 'number' },
    salt: { type: 'number' },
    confidence: { type: 'string', enum: ['low', 'medium'] },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'servingSize', 'calories', 'protein', 'carbs', 'fat', 'confidence', 'notes'],
};

function getProvider(): AiProvider {
  const provider = (Deno.env.get('AI_PROVIDER') || 'gemini').toLowerCase();

  if (provider === 'gemini' || provider === 'openrouter' || provider === 'groq' || provider === 'demo') {
    return provider;
  }

  console.error('[AI Provider] Unknown provider', { provider });
  throw new EdgeFunctionError('INVALID_INPUT', `Unsupported AI provider: ${provider}`, 400);
}

function parseJsonText(text: string, provider: AiProvider) {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch (error) {
    console.error('[AI Provider] Invalid JSON response', {
      provider,
      message: error instanceof Error ? error.message : String(error),
      textPreview: withoutFence.slice(0, 240),
    });
    throw new EdgeFunctionError('INVALID_AI_RESPONSE', 'AI provider returned invalid JSON.');
  }
}

async function callOpenAiCompatibleJson(params: {
  provider: 'openrouter' | 'groq';
  apiKey: string;
  model: string;
  url: string;
  prompt: string;
}) {
  const { apiKey, model, prompt, provider, url } = params;

  console.log('[AI Provider] Calling chat completions provider', { provider, model });
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(provider === 'openrouter'
        ? {
            'HTTP-Referer': 'https://supabase.com',
            'X-Title': 'Calorie Tracker',
          }
        : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a nutrition estimation assistant. Return only strict JSON matching the requested schema. Never include markdown.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error?.message ??
      payload?.message ??
      `${provider} request failed with status ${response.status}`;
    const errorText = `${message} ${JSON.stringify(payload ?? {})}`;

    console.error('[AI Provider] Provider HTTP error', {
      provider,
      model,
      status: response.status,
      message,
    });

    if (response.status === 429 || isQuotaErrorText(errorText)) {
      throw new EdgeFunctionError(
        'AI_QUOTA_EXCEEDED',
        'AI usage limit reached. Please try again later.',
        429,
      );
    }

    if (response.status === 503 || isTemporaryUnavailableErrorText(errorText)) {
      throw new EdgeFunctionError(
        'AI_TEMPORARILY_UNAVAILABLE',
        'AI is busy right now. Please try again in a moment or add it manually.',
        503,
      );
    }

    throw new EdgeFunctionError('AI_PROVIDER_ERROR', message);
  }

  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    console.error('[AI Provider] Empty provider response', {
      provider,
      model,
      choiceCount: Array.isArray(payload?.choices) ? payload.choices.length : 0,
    });
    throw new EdgeFunctionError('INVALID_AI_RESPONSE', 'AI provider returned no JSON text.');
  }

  return parseJsonText(content, provider);
}

async function callProviderJson(kind: EstimateKind, prompt: string, provider: Exclude<AiProvider, 'demo'>) {
  if (provider === 'gemini') {
    return callGeminiJson(prompt, kind === 'meal' ? mealEstimateSchema : foodEstimateSchema);
  }

  if (provider === 'openrouter') {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY');

    if (!apiKey) {
      console.error('[AI Provider] Missing OPENROUTER_API_KEY Supabase secret.');
      throw new EdgeFunctionError('MISSING_AI_PROVIDER_KEY', 'OpenRouter API key is not configured.');
    }

    return callOpenAiCompatibleJson({
      provider,
      apiKey,
      model: Deno.env.get('OPENROUTER_MODEL') || DEFAULT_OPENROUTER_MODEL,
      url: 'https://openrouter.ai/api/v1/chat/completions',
      prompt,
    });
  }

  const apiKey = Deno.env.get('GROQ_API_KEY');

  if (!apiKey) {
    console.error('[AI Provider] Missing GROQ_API_KEY Supabase secret.');
    throw new EdgeFunctionError('MISSING_AI_PROVIDER_KEY', 'Groq API key is not configured.');
  }

  return callOpenAiCompatibleJson({
    provider,
    apiKey,
    model: Deno.env.get('GROQ_MODEL') || DEFAULT_GROQ_MODEL,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    prompt,
  });
}

function getMealPrompt(description: string) {
  return [
    'Estimate a meal from the user description.',
    'Return JSON with this shape:',
    '{"mealName":"string","ingredients":[{"name":"string","quantityValue":number,"unit":"string","calories":number,"protein":number,"carbs":number,"fat":number}],"totalCalories":number,"totalProtein":number,"totalCarbs":number,"totalFat":number,"confidence":"low|medium","notes":["string"]}',
    'Use approximate realistic portions. Values must be calories and grams for protein, carbs, and fat.',
    'Keep confidence as low or medium. Never claim exactness. The user will review before saving.',
    `Meal description: ${description}`,
  ].join('\n');
}

function getFoodPrompt(description: string) {
  return [
    'Estimate nutrition for one reusable custom food from the user description.',
    'Return JSON with this shape:',
    '{"name":"string","servingSize":"string","calories":number,"protein":number,"carbs":number,"fat":number,"sugar":number,"salt":number,"confidence":"low|medium","notes":["string"]}',
    'Use a clear servingSize such as "100 g", "1 serving", or "1 sandwich".',
    'Values must be calories and grams for protein, carbs, fat, sugar, and salt when available.',
    'Keep confidence as low or medium. Never claim exactness. The user will review before saving.',
    `Food description: ${description}`,
  ].join('\n');
}

function normalizeIngredient(value: unknown, index: number) {
  const ingredient = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const name = typeof ingredient.name === 'string' ? ingredient.name.trim() : '';

  if (!name) {
    console.error('[AI Provider] Ingredient validation failed', { index });
    throw new EdgeFunctionError('INVALID_AI_RESPONSE', `Ingredient ${index + 1} is missing a name.`);
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

function normalizeMealEstimate(payload: unknown, description: string) {
  const estimate = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const ingredients = Array.isArray(estimate.ingredients)
    ? estimate.ingredients.map(normalizeIngredient).slice(0, 12)
    : [];

  if (ingredients.length === 0) {
    console.error('[AI Provider] Validation failed: no usable ingredients.');
    throw new EdgeFunctionError('INVALID_AI_RESPONSE', 'AI provider returned no usable ingredients.');
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
    mealName: mealName || description.slice(0, 48) || 'AI estimated meal',
    ingredients,
    totalCalories: Math.round(toFiniteNumber(estimate.totalCalories, totals.calories)),
    totalProtein: round(toFiniteNumber(estimate.totalProtein, totals.protein)),
    totalCarbs: round(toFiniteNumber(estimate.totalCarbs, totals.carbs)),
    totalFat: round(toFiniteNumber(estimate.totalFat, totals.fat)),
    confidence: normalizeConfidence(estimate.confidence),
    notes: normalizeNotes(estimate.notes).length
      ? normalizeNotes(estimate.notes)
      : ['Approximate estimate from your description.', 'Review portions before saving.'],
  };
}

function normalizeFoodEstimate(payload: unknown, description: string) {
  const estimate = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const name = typeof estimate.name === 'string' ? estimate.name.trim() : '';
  const calories = Math.round(Math.max(0, toFiniteNumber(estimate.calories, -1)));

  if (!name || calories < 0) {
    console.error('[AI Provider] Food validation failed', {
      hasName: Boolean(name),
      calories,
    });
    throw new EdgeFunctionError('INVALID_AI_RESPONSE', 'AI provider returned no usable food estimate.');
  }

  const sugar = toOptionalNumber(estimate.sugar);
  const salt = toOptionalNumber(estimate.salt);

  return {
    name: name || description.slice(0, 50) || 'AI estimated food',
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
    notes: normalizeNotes(estimate.notes).length
      ? normalizeNotes(estimate.notes)
      : ['Approximate estimate from your description.', 'Edit nutrition values before saving.'],
  };
}

function getDemoMealEstimate() {
  return {
    mealName: 'Demo chicken rice bowl',
    ingredients: [
      {
        name: 'Chicken breast',
        quantityValue: 150,
        unit: 'g',
        calories: 248,
        protein: 46,
        carbs: 0,
        fat: 5,
      },
      {
        name: 'Cooked rice',
        quantityValue: 180,
        unit: 'g',
        calories: 234,
        protein: 5,
        carbs: 51,
        fat: 1,
      },
      {
        name: 'Olive oil',
        quantityValue: 1,
        unit: 'tbsp',
        calories: 119,
        protein: 0,
        carbs: 0,
        fat: 14,
      },
    ],
    totalCalories: 601,
    totalProtein: 51,
    totalCarbs: 51,
    totalFat: 20,
    confidence: 'medium',
    notes: ['Demo estimate for UI testing.', 'Review portions before saving.'],
  };
}

function getDemoFoodEstimate() {
  return {
    name: 'Demo homemade sandwich',
    servingSize: '1 serving',
    calories: 430,
    protein: 28,
    carbs: 46,
    fat: 15,
    sugar: 5,
    salt: 1.2,
    confidence: 'medium',
    notes: ['Demo estimate for UI testing.', 'Edit nutrition values before saving.'],
  };
}

export async function generateMealEstimate(description: string) {
  const provider = getProvider();
  const rawEstimate =
    provider === 'demo'
      ? (console.log('[AI Provider] Using demo provider', { kind: 'meal' }), getDemoMealEstimate())
      : await callProviderJson('meal', getMealPrompt(description), provider);
  return withProviderMetadata(normalizeMealEstimate(rawEstimate, description), provider);
}

export async function generateFoodAutofill(description: string) {
  const provider = getProvider();
  const rawEstimate =
    provider === 'demo'
      ? (console.log('[AI Provider] Using demo provider', { kind: 'food' }), getDemoFoodEstimate())
      : await callProviderJson('food', getFoodPrompt(description), provider);
  return withProviderMetadata(normalizeFoodEstimate(rawEstimate, description), provider);
}
