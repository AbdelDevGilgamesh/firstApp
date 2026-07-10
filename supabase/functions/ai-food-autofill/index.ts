import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { generateFoodAutofill } from '../_shared/aiProvider.ts';
import {
  EdgeFunctionError,
  listAvailableGeminiModels,
  normalizeGeminiModelName,
  pickBestGenerateContentModel,
  probeGeminiModels,
  readDescription,
  type GeminiModelInfo,
} from '../_shared/gemini.ts';

const AI_FOOD_MODEL_PRIORITY = [
  'gemini-3.1-flash-lite',
  'gemini-3-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
];
const AI_FOOD_AUTOFILL_DISCOVERY_FALLBACK_MODEL = AI_FOOD_MODEL_PRIORITY[0];
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;

type ModelResolution = {
  model: string;
  fallbackModels: string[];
  availableModels: GeminiModelInfo[];
  discoveryError: string | null;
};

let cachedModelResolution: (ModelResolution & { expiresAt: number }) | null = null;

function getConfiguredAiFoodAutofillModel() {
  const configuredModel = normalizeGeminiModelName(Deno.env.get('AI_FOOD_AUTOFILL_MODEL'), '');

  if (
    configuredModel &&
    configuredModel !== 'gemini-2.5-flash' &&
    configuredModel !== 'gemini-2.5-flash-lite'
  ) {
    return configuredModel;
  }

  return null;
}

function supportsGenerateContent(model: GeminiModelInfo, normalizedName: string) {
  return normalizeGeminiModelName(model.name, model.name) === normalizedName &&
    Array.isArray(model.supportedGenerationMethods) &&
    model.supportedGenerationMethods.includes('generateContent');
}

function isTextGenerationModel(model: GeminiModelInfo) {
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

function pickAiFoodModelFromPriority(models: GeminiModelInfo[]) {
  const availableModelNames = models
    .filter((model) => {
      const normalizedName = normalizeGeminiModelName(model.name, model.name);
      return supportsGenerateContent(model, normalizedName) && isTextGenerationModel(model);
    })
    .map((model) => normalizeGeminiModelName(model.name, model.name));

  return AI_FOOD_MODEL_PRIORITY.find((model) => availableModelNames.includes(model)) ?? null;
}

function getAiFoodPriorityFallbackModels(selectedModel: string, models: GeminiModelInfo[]) {
  const availableModelNames = models
    .filter((model) => {
      const normalizedName = normalizeGeminiModelName(model.name, model.name);
      return supportsGenerateContent(model, normalizedName) && isTextGenerationModel(model);
    })
    .map((model) => normalizeGeminiModelName(model.name, model.name));

  return AI_FOOD_MODEL_PRIORITY.filter((model) => model !== selectedModel && availableModelNames.includes(model));
}

async function resolveAiFoodAutofillModel() {
  const startedAt = Date.now();
  const cached = cachedModelResolution;

  if (cached && cached.expiresAt > Date.now()) {
    console.log('[AI Autofill] model discovery cache hit', {
      selectedModel: cached.model,
      durationMs: Date.now() - startedAt,
    });
    return {
      model: cached.model,
      fallbackModels: cached.fallbackModels,
      availableModels: cached.availableModels,
      discoveryError: cached.discoveryError,
    };
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const configuredModel = getConfiguredAiFoodAutofillModel();

  if (!apiKey) {
    return {
      model: configuredModel ?? AI_FOOD_AUTOFILL_DISCOVERY_FALLBACK_MODEL,
      fallbackModels: AI_FOOD_MODEL_PRIORITY.filter((model) => model !== (configuredModel ?? AI_FOOD_AUTOFILL_DISCOVERY_FALLBACK_MODEL)),
      availableModels: [] as GeminiModelInfo[],
      discoveryError: 'GEMINI_API_KEY is not configured.',
    };
  }

  try {
    const availableModels = await listAvailableGeminiModels(apiKey);
    const selectedFromPriority = pickAiFoodModelFromPriority(availableModels);
    const selectedFromDiscovery = selectedFromPriority ?? pickBestGenerateContentModel(availableModels);
    const configuredIsAvailable = configuredModel
      ? availableModels.some((model) => supportsGenerateContent(model, configuredModel))
      : false;
    const model = configuredModel && configuredIsAvailable
      ? configuredModel
      : selectedFromDiscovery ?? AI_FOOD_AUTOFILL_DISCOVERY_FALLBACK_MODEL;
    const fallbackModels = getAiFoodPriorityFallbackModels(model, availableModels);

    console.log('[AI Autofill] available models', {
      count: availableModels.length,
      generateContentModels: availableModels
        .filter((candidate) => Array.isArray(candidate.supportedGenerationMethods) &&
          candidate.supportedGenerationMethods.includes('generateContent'))
        .map((candidate) => ({
          name: candidate.name,
          supportedGenerationMethods: candidate.supportedGenerationMethods,
        })),
    });
    console.log('[AI Autofill] selected model', {
      configuredModel,
      selectedFromPriority,
      selectedFromDiscovery,
      selectedModel: model,
      durationMs: Date.now() - startedAt,
    });

    const resolution = {
      model,
      fallbackModels,
      availableModels,
      discoveryError: null,
    };

    cachedModelResolution = {
      ...resolution,
      expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
    };

    return resolution;
  } catch (error) {
    console.warn('[AI Autofill] model discovery failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    console.log('[AI Autofill] model discovery duration', {
      durationMs: Date.now() - startedAt,
      failed: true,
    });
    return {
      model: AI_FOOD_AUTOFILL_DISCOVERY_FALLBACK_MODEL,
      fallbackModels: AI_FOOD_MODEL_PRIORITY.filter((model) => model !== AI_FOOD_AUTOFILL_DISCOVERY_FALLBACK_MODEL),
      availableModels: [] as GeminiModelInfo[],
      discoveryError: error instanceof Error ? error.message : String(error),
    };
  }
}

function clearModelCache() {
  cachedModelResolution = null;
}

Deno.serve(async (request) => {
  const functionStartedAt = Date.now();
  const options = handleOptions(request);

  if (options) {
    return options;
  }

  try {
    const body = await request.clone().json().catch(() => null);

    if (body?.debugModelProbe === true) {
      const resolved = await resolveAiFoodAutofillModel();
      const results = await probeGeminiModels(AI_FOOD_MODEL_PRIORITY);
      return jsonResponse({
        success: true,
        selectedModel: resolved.model,
        modelPriority: AI_FOOD_MODEL_PRIORITY,
        discoveryError: resolved.discoveryError,
        availableModels: resolved.availableModels.map((model) => ({
          name: model.name,
          displayName: model.displayName,
          supportedGenerationMethods: model.supportedGenerationMethods,
        })),
        results,
      });
    }

    const description = await readDescription(request);
    const resolved = await resolveAiFoodAutofillModel();
    console.log('[AI Autofill] resolved model', {
      aiFoodAutofillModel: Deno.env.get('AI_FOOD_AUTOFILL_MODEL'),
      geminiModel: Deno.env.get('GEMINI_MODEL'),
      resolvedModel: resolved.model,
      discoveryError: resolved.discoveryError,
    });
    const result = await generateFoodAutofill(description, {
      model: resolved.model,
      fallbackModels: resolved.fallbackModels,
    });
    console.log('[AI Autofill] function complete', {
      durationMs: Date.now() - functionStartedAt,
    });
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof EdgeFunctionError) {
      if (error.code === 'AI_MODEL_UNAVAILABLE') {
        clearModelCache();
      }
      console.error('[ai-food-autofill] Request failed', {
        code: error.code,
        message: error.message,
        debug: error.debug,
        durationMs: Date.now() - functionStartedAt,
      });
      return jsonResponse({ error: error.message, code: error.code, debug: error.debug }, error.status);
    }

    console.error('[ai-food-autofill] Unknown error', error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'AI food autofill failed.',
        code: 'UNKNOWN_ERROR',
      },
      500,
    );
  }
});
