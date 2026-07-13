import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import {
  callGeminiWithFallback,
  EdgeFunctionError,
  extractGeminiText,
  getGeminiVisionModels,
  normalizeConfidence,
  normalizeNotes,
  round,
  toFiniteNumber,
} from '../_shared/gemini.ts';

type Confidence = 'low' | 'medium' | 'high';
type MealPhotoItem = {
  name: string;
  estimatedQuantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: Confidence;
  notes: string[];
};

const MAX_BASE64_LENGTH = 2_500_000;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

const responseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['estimated', 'failed'] },
    code: { type: 'string' },
    error: { type: 'string' },
    mealName: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          estimatedQuantity: { type: 'string' },
          calories: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          notes: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'estimatedQuantity', 'calories', 'protein', 'carbs', 'fat', 'confidence', 'notes'],
      },
    },
    totals: {
      type: 'object',
      properties: {
        calories: { type: 'number' },
        protein: { type: 'number' },
        carbs: { type: 'number' },
        fat: { type: 'number' },
      },
      required: ['calories', 'protein', 'carbs', 'fat'],
    },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['status'],
};

function getProvider() {
  return (Deno.env.get('MEAL_PHOTO_PROVIDER') || Deno.env.get('AI_PROVIDER') || 'gemini').toLowerCase();
}

function getPrompt(languageHint?: string) {
  return [
    'You are estimating a meal from a photo for a calorie tracker app.',
    'Return JSON only. No markdown. No explanations outside JSON.',
    'Do not make medical claims. Do not mention certainty as fact.',
    'Estimate visible foods and portions. Do not invent hidden ingredients.',
    'If any visible edible items are present, return a low-confidence estimate.',
    'Do not fail just because the exact food type is uncertain.',
    'Use generic names when uncertain: bread, spread, milk/yogurt drink, small round food item, seeds.',
    'Only return {"status":"failed","code":"NO_FOOD_DETECTED","error":"No meal was detected."} when there is clearly no food.',
    'Always include an "items" array. Do not return totals only.',
    'If exact items are uncertain, create generic visible items with low confidence.',
    'Max 5 items. Use simple food names. Calories and macros must be numeric when visible; missing macros may be omitted.',
    'JSON keys: status, mealName, items, totals, confidence, notes.',
    'Each item keys: name, estimatedQuantity, calories, protein, carbs, fat, confidence, notes.',
    languageHint ? `Language hint: ${languageHint}` : '',
  ].filter(Boolean).join('\n');
}

function getDemoEstimate() {
  return {
    status: 'estimated',
    mealName: 'Chicken rice plate',
    items: [
      {
        name: 'Chicken breast',
        estimatedQuantity: '150g',
        calories: 240,
        protein: 45,
        carbs: 0,
        fat: 5,
        confidence: 'medium',
        notes: [],
      },
      {
        name: 'Cooked rice',
        estimatedQuantity: '200g',
        calories: 260,
        protein: 5,
        carbs: 56,
        fat: 1,
        confidence: 'medium',
        notes: [],
      },
      {
        name: 'Salad',
        estimatedQuantity: '80g',
        calories: 25,
        protein: 1,
        carbs: 5,
        fat: 0,
        confidence: 'low',
        notes: ['Dressing is not visible.'],
      },
    ],
    totals: {
      calories: 525,
      protein: 51,
      carbs: 61,
      fat: 6,
    },
    confidence: 'medium',
    notes: ['Demo estimate - for testing only.'],
    provider: 'demo',
    model: null,
    isDemo: true,
  };
}

function safeParseMealJsonText(rawText: string) {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const candidates = [
    cleaned,
    firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next repair strategy.
    }
  }

  throw new SyntaxError('No valid JSON object found in Gemini response.');
}

function normalizeItem(value: unknown, index: number): MealPhotoItem | null {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const name = typeof item.name === 'string' ? item.name.trim() : '';

  if (!name) {
    return null;
  }

  return {
    name,
    estimatedQuantity:
      typeof item.estimatedQuantity === 'string' && item.estimatedQuantity.trim()
        ? item.estimatedQuantity.trim()
        : '1 serving',
    calories: Math.round(Math.max(0, toFiniteNumber(item.calories, 0))),
    protein: round(Math.max(0, toFiniteNumber(item.protein, 0))),
    carbs: round(Math.max(0, toFiniteNumber(item.carbs, 0))),
    fat: round(Math.max(0, toFiniteNumber(item.fat, 0))),
    confidence: item.confidence === 'high' ? 'high' : normalizeConfidence(item.confidence),
    notes: normalizeNotes(item.notes).slice(0, 2),
  };
}

function normalizeMealPhotoEstimate(payload: unknown) {
  const estimate = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};

  if (estimate.status === 'failed' && estimate.code === 'NO_FOOD_DETECTED') {
    throw new EdgeFunctionError('NO_FOOD_DETECTED', 'No meal was detected.', 422);
  }

  let items = Array.isArray(estimate.items)
    ? estimate.items.map(normalizeItem).filter((item): item is MealPhotoItem => Boolean(item)).slice(0, 4)
    : [];
  const itemTotals = items.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      protein: sum.protein + item.protein,
      carbs: sum.carbs + item.carbs,
      fat: sum.fat + item.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const inputTotals = estimate.totals && typeof estimate.totals === 'object'
    ? estimate.totals as Record<string, unknown>
    : {};
  const totalCalories = Math.round(Math.max(0, toFiniteNumber(inputTotals.calories, itemTotals.calories)));
  const totalProtein = round(Math.max(0, toFiniteNumber(inputTotals.protein, itemTotals.protein)));
  const totalCarbs = round(Math.max(0, toFiniteNumber(inputTotals.carbs, itemTotals.carbs)));
  const totalFat = round(Math.max(0, toFiniteNumber(inputTotals.fat, itemTotals.fat)));
  const mealName =
    typeof estimate.mealName === 'string' && estimate.mealName.trim()
      ? estimate.mealName.trim()
      : 'Estimated meal';
  const fallbackItemNote = 'AI estimated totals but did not separate individual items. Please review before saving.';

  if (items.length === 0) {
    if (totalCalories <= 0 || !mealName) {
      throw new EdgeFunctionError('INVALID_AI_RESPONSE', 'AI returned no usable meal estimate.', 422);
    }

    items = [
      {
        name: mealName || 'Estimated meal',
        estimatedQuantity: '1 serving',
        calories: totalCalories,
        protein: totalProtein,
        carbs: totalCarbs,
        fat: totalFat,
        confidence: 'low',
        notes: [fallbackItemNote],
      },
    ];
  }

  const notes = normalizeNotes(estimate.notes);
  const hasFallbackItem = items.length === 1 && items[0].notes.includes(fallbackItemNote);

  return {
    status: 'estimated',
    mealName,
    items,
    totals: {
      calories: totalCalories,
      protein: totalProtein,
      carbs: totalCarbs,
      fat: totalFat,
    },
    confidence: hasFallbackItem ? 'low' : estimate.confidence === 'high' ? 'high' : normalizeConfidence(estimate.confidence),
    notes: notes.length
      ? [...notes.slice(0, 3), ...(hasFallbackItem ? [fallbackItemNote] : [])].slice(0, 4)
      : ['Some items are uncertain. Please review before saving.'],
  };
}

function readRequestBody(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const imageBase64 = typeof input.imageBase64 === 'string' ? input.imageBase64.trim() : '';
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType : '';

  if (!imageBase64) {
    throw new EdgeFunctionError('INVALID_INPUT', 'Meal photo image is missing.', 400);
  }

  if (imageBase64.length > MAX_BASE64_LENGTH) {
    throw new EdgeFunctionError('INVALID_INPUT', 'Image is too large. Please choose a smaller photo.', 413, {
      base64Length: imageBase64.length,
    });
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new EdgeFunctionError('INVALID_INPUT', 'Unsupported image type.', 415, { mimeType });
  }

  return {
    imageBase64,
    mimeType,
    languageHint: typeof input.languageHint === 'string' ? input.languageHint.slice(0, 32) : undefined,
  };
}

function errorResponse(error: EdgeFunctionError) {
  const code = error.code === 'MISSING_AI_PROVIDER_KEY' ? 'MISSING_AI_PROVIDER_KEY' : error.code;
  const debug = Deno.env.get('DEBUG_AI') === 'true' ? error.debug : undefined;

  console.warn('[meal-photo-estimate] failed', {
    code,
    status: error.status,
    message: error.message,
    debug,
  });

  return jsonResponse(
    {
      success: false,
      status: 'failed',
      code,
      error:
        code === 'AI_TIMEOUT'
          ? 'AI is taking too long. Please try again.'
          : error.message,
      ...(debug ? { debug } : {}),
    },
    error.status,
  );
}

Deno.serve(async (request) => {
  const options = handleOptions(request);

  if (options) {
    return options;
  }

  if (request.method !== 'POST') {
    return errorResponse(new EdgeFunctionError('INVALID_INPUT', 'Method not allowed.', 405));
  }

  try {
    const body = await request.json().catch(() => null);

    if (getProvider() === 'demo') {
      return jsonResponse({ success: true, data: getDemoEstimate() });
    }

    const input = readRequestBody(body);
    const models = getGeminiVisionModels(Deno.env.get('GEMINI_VISION_MODEL') || Deno.env.get('GEMINI_MODEL'));
    console.log('[Meal Photo Vision] request received', {
      imageBase64Length: input.imageBase64.length,
      mimeType: input.mimeType,
      modelCount: models.length,
      models,
    });
    const result = await callGeminiWithFallback({
      taskType: 'meal-photo-estimate',
      models,
      timeoutMs: 30_000,
      onAttempt: ({ attempt, model }) => {
        console.log('[Meal Photo Vision] Gemini attempt', {
          model,
          attempt,
        });
      },
      onFailure: ({ attempt, error, model }) => {
        console.warn('[Meal Photo Vision] Gemini model failed', {
          model,
          attempt,
          code: error.code,
          status: error.status,
          messagePreview: error.message.slice(0, 200),
        });
      },
      onSuccess: ({ model }) => {
        console.log('[Meal Photo Vision] Gemini success', { model });
      },
      payloadBuilder: () => ({
        contents: [
          {
            role: 'user',
            parts: [
              { text: getPrompt(input.languageHint) },
              {
                inline_data: {
                  mime_type: input.mimeType,
                  data: input.imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 700,
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
      parseResponse: (payload, model) => {
        const { candidateCount, finishReason, text } = extractGeminiText(payload);
        const rawPreview = text.slice(0, 1000);

        if (!text.trim()) {
          throw new EdgeFunctionError('INVALID_AI_RESPONSE', 'Gemini returned no meal estimate.', 422, {
            model,
            candidateCount,
            finishReason,
            finalReason: 'empty_response',
          });
        }

        let parsed: unknown;

        try {
          parsed = safeParseMealJsonText(text);
        } catch (error) {
          console.warn('[Meal Photo Vision] Invalid Gemini response preview', {
            model,
            rawPreview,
            rawLength: text.length,
          });

          throw new EdgeFunctionError('INVALID_AI_RESPONSE', 'Gemini returned invalid meal JSON.', 422, {
            model,
            finishReason,
            rawPreview: Deno.env.get('DEBUG_AI') === 'true' ? rawPreview : undefined,
            finalReason: 'json_parse_failed',
          });
        }

        try {
          return normalizeMealPhotoEstimate(parsed);
        } catch (error) {
          if (error instanceof EdgeFunctionError) {
            const parsedPreview = JSON.stringify(parsed).slice(0, 1000);

            if (error.code === 'INVALID_AI_RESPONSE') {
              console.warn('[Meal Photo Vision] Invalid Gemini response preview', {
                model,
                rawPreview,
                rawLength: text.length,
              });
            }

            error.debug = {
              ...error.debug,
              model,
              finishReason,
              rawPreview: Deno.env.get('DEBUG_AI') === 'true' ? rawPreview : undefined,
              parsedPreview: Deno.env.get('DEBUG_AI') === 'true' ? parsedPreview : undefined,
              finalReason:
                error.code === 'NO_FOOD_DETECTED'
                  ? 'model_reported_no_food'
                  : 'validation_failed',
            };
            throw error;
          }

          console.warn('[Meal Photo Vision] Invalid Gemini response preview', {
            model,
            rawPreview,
            rawLength: text.length,
          });

          throw new EdgeFunctionError('INVALID_AI_RESPONSE', 'Gemini returned invalid meal JSON.', 422, {
            model,
            finishReason,
            rawPreview: Deno.env.get('DEBUG_AI') === 'true' ? rawPreview : undefined,
            parsedPreview: Deno.env.get('DEBUG_AI') === 'true' ? JSON.stringify(parsed).slice(0, 1000) : undefined,
            finalReason: 'normalization_exception',
          });
        }
      },
    });

    return jsonResponse({ success: true, data: result });
  } catch (error) {
    if (error instanceof EdgeFunctionError) {
      return errorResponse(error);
    }

    return errorResponse(
      new EdgeFunctionError(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Meal photo estimate failed.',
        500,
      ),
    );
  }
});
