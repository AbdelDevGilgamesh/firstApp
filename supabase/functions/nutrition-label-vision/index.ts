import { handleOptions, jsonResponse } from '../_shared/cors.ts';

type Confidence = 'high' | 'medium' | 'low';
type NutritionLabelData = {
  productName: string | null;
  servingSize: number | null;
  baseUnit: 'g' | 'ml' | 'serving' | null;
  servingUnit: 'g' | 'ml' | 'serving' | null;
  baseQuantity: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sugars: number | null;
  saturatedFat: number | null;
  fiber: number | null;
  salt: number | null;
  confidence: Confidence;
  notes: string[];
};

type FunctionErrorCode =
  | 'MISSING_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'UNSUPPORTED_IMAGE_TYPE'
  | 'GEMINI_API_KEY_MISSING'
  | 'GEMINI_API_ERROR'
  | 'GEMINI_EMPTY_RESPONSE'
  | 'INVALID_INPUT'
  | 'AI_TEMPORARILY_UNAVAILABLE'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_RESPONSE_TRUNCATED'
  | 'INVALID_AI_RESPONSE'
  | 'NO_NUTRITION_VALUES_FOUND';

class FunctionError extends Error {
  code: FunctionErrorCode;
  status: number;
  stage: string;
  debug?: Record<string, unknown>;

  constructor(code: FunctionErrorCode, message: string, status = 500, stage = 'unknown', debug?: Record<string, unknown>) {
    super(message);
    this.name = 'FunctionError';
    this.code = code;
    this.status = status;
    this.stage = stage;
    this.debug = debug;
  }
}

const MAX_BASE64_LENGTH = 5_000_000;
const MAX_OUTPUT_TOKENS = 1024;
const PRIMARY_MODEL = Deno.env.get('GEMINI_VISION_MODEL') || 'gemini-2.5-flash-lite';
const FALLBACK_MODEL = Deno.env.get('GEMINI_VISION_FALLBACK_MODEL') || 'gemini-2.5-flash';

const responseSchema = {
  type: 'object',
  properties: {
    productName: { type: 'string' },
    servingSize: { type: 'number' },
    baseUnit: { type: 'string', enum: ['g', 'ml', 'serving', 'unknown'] },
    baseQuantity: { type: 'number' },
    calories: { type: 'number' },
    protein: { type: 'number' },
    carbs: { type: 'number' },
    fat: { type: 'number' },
    sugars: { type: 'number' },
    saturatedFat: { type: 'number' },
    fiber: { type: 'number' },
    salt: { type: 'number' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'baseQuantity',
    'confidence',
    'notes',
  ],
};

function errorResponse(error: FunctionError) {
  const rawPreview = typeof error.debug?.rawPreview === 'string'
    ? error.debug.rawPreview.slice(0, 300)
    : undefined;

  console.warn('[Nutrition Vision] failed', {
    code: error.code,
    stage: error.stage,
    status: error.status,
    message: error.message,
    ...error.debug,
    rawPreview,
  });

  return jsonResponse(
    {
      success: false,
      code: error.code,
      error: error.message,
      debug: {
        stage: error.stage,
        ...(typeof error.debug?.model === 'string' ? { model: error.debug.model } : {}),
        ...(typeof error.debug?.finishReason === 'string' ? { finishReason: error.debug.finishReason } : {}),
        ...(typeof error.debug?.textLength === 'number' ? { textLength: error.debug.textLength } : {}),
        ...(rawPreview ? { rawPreview, textPreview: rawPreview } : {}),
      },
    },
    error.status,
  );
}

function isQuotaErrorText(value: string) {
  const normalized = value.toLowerCase();
  return normalized.includes('quota') || normalized.includes('resource_exhausted') || normalized.includes('rate limit');
}

function isTemporaryUnavailableText(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('high demand') ||
    normalized.includes('temporarily') ||
    normalized.includes('try again later') ||
    normalized.includes('overloaded') ||
    normalized.includes('unavailable') ||
    normalized.includes('503')
  );
}

function stripMarkdownFences(raw: string) {
  return raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractFirstJsonObject(raw: string) {
  const start = raw.indexOf('{');

  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }

  return null;
}

function safeJsonParse(raw: string) {
  const firstObject = extractFirstJsonObject(raw);
  const firstToLastObject =
    raw.includes('{') && raw.includes('}')
      ? raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
      : null;
  const attempts = [raw.trim(), stripMarkdownFences(raw), firstObject, firstToLastObject].filter(
    (value): value is string => Boolean(value),
  );

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // Try the next repair strategy.
    }
  }

  return null;
}

function isTruncatedJsonResponse(raw: string, finishReason?: string) {
  const cleaned = stripMarkdownFences(raw);
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  return (
    finishReason === 'MAX_TOKENS' ||
    (firstBrace >= 0 && (lastBrace < firstBrace || !cleaned.slice(lastBrace).trim().endsWith('}')))
  );
}

function buildCompactPrompt() {
  return `Extract nutrition values from this food label image.

Return ONLY valid compact JSON. No markdown. No explanation.
Use the per 100g or per 100ml column if visible.
Numbers only. No units in numeric fields.
Use kcal for calories. If only kJ is visible, convert kJ / 4.184.
Omit fields that are not visible. Do not invent values.
baseQuantity should be 100 when values are per 100g or per 100ml.
Limit notes to at most 2 short strings.

Map labels:
Energy / Energie / Valeur energetique -> calories
Protein / Proteines -> protein
Carbohydrates / Glucides -> carbs
Sugars / Sucres -> sugars
Fat / Lipides -> fat
Saturated fat / Acides gras satures -> saturatedFat
Fiber / Fibres -> fiber
Salt / Sel -> salt

JSON keys:
baseQuantity, baseUnit, calories, protein, carbs, fat, sugars, saturatedFat, fiber, salt, confidence, notes`;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalizedString =
    typeof value === 'string'
      ? value.replace(',', '.').match(/-?\d+(?:\.\d+)?/)?.[0]
      : null;
  const numberValue = normalizedString === null ? Number(value) : Number(normalizedString);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeNutritionData(value: unknown): NutritionLabelData | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = value as Record<string, unknown>;
  const servingUnit =
    input.servingUnit === 'ml' || input.servingUnit === 'serving'
      ? input.servingUnit
      : input.servingUnit === 'g'
        ? 'g'
        : null;
  const baseUnit =
    input.baseUnit === 'ml'
      ? 'ml'
      : input.baseUnit === 'g'
        ? 'g'
        : input.baseUnit === 'serving'
          ? 'serving'
          : null;
  const confidence: Confidence =
    input.confidence === 'high' || input.confidence === 'medium' ? input.confidence : 'low';
  const notes = Array.isArray(input.notes)
    ? input.notes.filter((note): note is string => typeof note === 'string').slice(0, 4)
    : [];
  const baseQuantity = toNullableNumber(input.baseQuantity) ?? 100;
  const normalized: NutritionLabelData = {
    productName: typeof input.productName === 'string' && input.productName.trim() ? input.productName.trim() : null,
    servingSize: toNullableNumber(input.servingSize),
    baseUnit,
    servingUnit: servingUnit ?? baseUnit,
    baseQuantity: baseQuantity > 0 ? baseQuantity : 100,
    calories: toNullableNumber(input.calories),
    protein: toNullableNumber(input.protein),
    carbs: toNullableNumber(input.carbs),
    fat: toNullableNumber(input.fat),
    sugars: toNullableNumber(input.sugars),
    saturatedFat: toNullableNumber(input.saturatedFat),
    fiber: toNullableNumber(input.fiber),
    salt: toNullableNumber(input.salt),
    confidence,
    notes,
  };

  if (normalized.calories !== null) {
    normalized.calories = Math.round(normalized.calories);
  }

  for (const key of ['protein', 'carbs', 'fat', 'sugars', 'saturatedFat', 'fiber', 'salt'] as const) {
    if (normalized[key] !== null) {
      normalized[key] = round(normalized[key]);
    }
  }

  return normalized;
}

function hasUsableData(data: NutritionLabelData | null) {
  if (!data) {
    return false;
  }

  const macroCount = [data.protein, data.carbs, data.fat, data.sugars, data.saturatedFat, data.fiber, data.salt].filter(
    (value) => typeof value === 'number',
  ).length;
  return typeof data.calories === 'number' || macroCount >= 1;
}

function buildPrompt(productName?: string, barcode?: string) {
  return `You are extracting nutrition facts from a food label image.
Return ONLY valid JSON.
Do not include markdown.
Do not include explanations outside JSON.

Extract nutrition values from the label.
Prefer the column for 100g or 100ml.
If the label contains both "per 100g" and "per serving", use per 100g.
If values are in French, Arabic, or English, map them correctly. Important label map:
- Energie / Valeur energetique / Energy -> calories
- Proteines / Protein -> protein
- Glucides / Carbohydrates -> carbs
- Dont sucres / Sugars -> sugars
- Lipides / Fat -> fat
- Dont acides gras satures / Saturated fat -> saturatedFat
- Fibres / Fiber -> fiber
- Sel / Salt -> salt
- énergie / energy / valeur énergétique -> calories
- protéines / protein -> protein
- glucides / carbohydrates -> carbs
- sucres / sugars -> sugars
- lipides / fat -> fat
- acides gras saturés / saturated fat -> saturatedFat
- fibres / fiber -> fiber
- sel / salt -> salt

Return JSON with:
productName, servingSize, baseUnit, baseQuantity, calories, protein, carbs, fat, sugars, saturatedFat, fiber, salt, confidence, notes.

Rules:
- baseQuantity must be 100 when values are per 100g/100ml.
- baseUnit must be "g" for per 100g values, "ml" for per 100ml values, or omitted when not visible.
- Use numbers only, no units in numeric fields.
- Omit fields that are not visible.
- Do not invent values.
- kcal only for calories.
- If only kJ is visible, convert to kcal using kcal = kJ / 4.184 and round.
- confidence high only when the relevant values are clearly readable.
- Keep notes short, maximum 4 notes.

Context:
Product name hint: ${productName || 'unknown'}
Barcode hint: ${barcode || 'unknown'}`;
}

async function callGeminiVision({
  imageBase64,
  mimeType,
  model,
  productName,
  barcode,
}: {
  imageBase64: string;
  mimeType: string;
  model: string;
  productName?: string;
  barcode?: string;
}): Promise<{
  data: NutritionLabelData | null;
  invalidJson: boolean;
  model: string;
  rawPreview?: string;
  truncated?: boolean;
  finishReason?: string;
  textLength?: number;
}> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');

  if (!apiKey) {
    throw new FunctionError(
      'GEMINI_API_KEY_MISSING',
      'AI is not configured yet.',
      500,
      'config',
    );
  }

  console.log('[nutrition-label-vision] Calling Gemini', { model });
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${buildCompactPrompt()}\n\nProduct name hint: ${productName || 'unknown'}\nBarcode hint: ${barcode || 'unknown'}` },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message ?? `Gemini request failed with status ${response.status}`;
    const errorText = `${message} ${JSON.stringify(payload ?? {})}`;

    if (isQuotaErrorText(errorText)) {
      throw new FunctionError('AI_QUOTA_EXCEEDED', 'AI usage limit reached. Please try again later.', 429, 'gemini_api', {
        model,
        status: response.status,
      });
    }

    if (isTemporaryUnavailableText(errorText)) {
      throw new FunctionError(
        'AI_TEMPORARILY_UNAVAILABLE',
        'AI is busy right now. Please try again in a moment or add it manually.',
        503,
        'gemini_api',
        { model, status: response.status },
      );
    }

    throw new FunctionError('GEMINI_API_ERROR', 'Gemini could not process the nutrition label.', 502, 'gemini_api', {
      model,
      status: response.status,
      message,
    });
  }

  const candidate = payload?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  console.warn('[Nutrition Vision] Gemini response debug', {
    model,
    jsonMode: true,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    textLength: typeof text === 'string' ? text.length : 0,
    finishReason: candidate?.finishReason,
    textPreview: typeof text === 'string' ? text.slice(0, 500) : null,
  });

  if (typeof text !== 'string' || !text.trim()) {
    throw new FunctionError('GEMINI_EMPTY_RESPONSE', 'Gemini returned no nutrition response.', 422, 'gemini_response', {
      model,
      candidatesLength: Array.isArray(payload?.candidates) ? payload.candidates.length : 0,
      finishReason: payload?.candidates?.[0]?.finishReason,
    });
  }

  const finishReason = typeof candidate?.finishReason === 'string' ? candidate.finishReason : undefined;
  const parsed = safeJsonParse(text);

  if (!parsed) {
    const truncated = isTruncatedJsonResponse(text, finishReason);
    console.warn('[Nutrition Vision] Invalid Gemini JSON', {
      model,
      finishReason,
      truncated,
      rawPreview: text.slice(0, 300),
      rawLength: text.length,
    });
    return {
      data: null,
      invalidJson: !truncated,
      truncated,
      model,
      finishReason,
      textLength: text.length,
      rawPreview: text.slice(0, 300),
    };
  }

  return { data: normalizeNutritionData(parsed), invalidJson: false, model, finishReason, textLength: text.length };
}

async function readRequest(request: Request) {
  if (request.method !== 'POST') {
    throw new FunctionError('INVALID_INPUT', 'Method not allowed.', 400, 'validate_request');
  }

  const body = await request.json().catch(() => null);
  const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/jpeg';

  if (!imageBase64) {
    throw new FunctionError('MISSING_IMAGE', 'Nutrition label image is missing.', 400, 'validate_request');
  }

  if (imageBase64.length > MAX_BASE64_LENGTH) {
    throw new FunctionError(
      'IMAGE_TOO_LARGE',
      'Image is too large. Please retake closer to the label.',
      413,
      'validate_request',
      { base64Length: imageBase64.length },
    );
  }

  if (!mimeType.startsWith('image/')) {
    throw new FunctionError('UNSUPPORTED_IMAGE_TYPE', 'Unsupported image type.', 415, 'validate_request', {
      mimeType,
    });
  }

  return {
    imageBase64,
    mimeType,
    productName: typeof body?.productName === 'string' ? body.productName.slice(0, 120) : undefined,
    barcode: typeof body?.barcode === 'string' ? body.barcode.slice(0, 64) : undefined,
  };
}

Deno.serve(async (request) => {
  const options = handleOptions(request);

  if (options) {
    return options;
  }

  try {
    const input = await readRequest(request);
    const liteResult = await callGeminiVision({ ...input, model: PRIMARY_MODEL });

    if (hasUsableData(liteResult.data) && liteResult.data?.confidence !== 'low') {
      return jsonResponse({ success: true, model: liteResult.model, data: liteResult.data });
    }

    let flashResult: {
      data: NutritionLabelData | null;
      invalidJson: boolean;
      model: string;
      rawPreview?: string;
      truncated?: boolean;
      finishReason?: string;
      textLength?: number;
    } | null = null;

    if (FALLBACK_MODEL && FALLBACK_MODEL !== PRIMARY_MODEL) {
      if (liteResult.invalidJson || liteResult.truncated || !hasUsableData(liteResult.data)) {
        console.warn('[Nutrition Vision] Flash Lite failed, retrying Flash', {
          code: liteResult.truncated
            ? 'AI_RESPONSE_TRUNCATED'
            : liteResult.invalidJson
              ? 'INVALID_AI_RESPONSE'
              : 'NO_NUTRITION_VALUES_FOUND',
          stage: liteResult.truncated || liteResult.invalidJson ? 'parse_response' : 'no_values',
          finishReason: liteResult.finishReason,
        });
      }

      flashResult = await callGeminiVision({ ...input, model: FALLBACK_MODEL }).catch((error) => {
        if (error instanceof FunctionError && error.code === 'AI_TEMPORARILY_UNAVAILABLE') {
          console.warn('[nutrition-label-vision] Fallback model temporarily unavailable.');
          return null;
        }

        throw error;
      });
    }

    if (hasUsableData(flashResult?.data ?? null)) {
      return jsonResponse({ success: true, model: flashResult?.model, data: flashResult?.data });
    }

    if (hasUsableData(liteResult.data)) {
      return jsonResponse({ success: true, model: liteResult.model, data: liteResult.data });
    }

    if (liteResult.truncated || flashResult?.truncated) {
      const truncatedResult = flashResult?.truncated ? flashResult : liteResult;
      return errorResponse(
        new FunctionError(
          'AI_RESPONSE_TRUNCATED',
          'AI response was incomplete. Please try again.',
          422,
          'parse_response',
          {
            model: truncatedResult.model,
            finishReason: truncatedResult.finishReason,
            textLength: truncatedResult.textLength,
            rawPreview: truncatedResult.rawPreview,
          },
        ),
      );
    }

    if (liteResult.invalidJson || flashResult?.invalidJson) {
      return errorResponse(
        new FunctionError(
          'INVALID_AI_RESPONSE',
          'Gemini returned invalid nutrition JSON.',
          422,
          'parse_response',
          {
            model: flashResult?.invalidJson ? flashResult.model : liteResult.model,
            finishReason: flashResult?.invalidJson ? flashResult.finishReason : liteResult.finishReason,
            textLength: flashResult?.invalidJson ? flashResult.textLength : liteResult.textLength,
            rawPreview: flashResult?.rawPreview ?? liteResult.rawPreview,
          },
        ),
      );
    }

    return errorResponse(
      new FunctionError(
        'NO_NUTRITION_VALUES_FOUND',
        'No nutrition values were found. Try a clearer photo or add it manually.',
        422,
        'normalize_response',
        { model: flashResult?.model ?? liteResult.model },
      ),
    );
  } catch (error) {
    if (error instanceof FunctionError) {
      return errorResponse(error);
    }

    const message = error instanceof Error ? error.message : 'Unexpected nutrition vision failure.';
    return errorResponse(
      new FunctionError(
        'GEMINI_API_ERROR',
        'Could not read nutrition label.',
        500,
        'unknown',
        { message },
      ),
    );
  }
});
