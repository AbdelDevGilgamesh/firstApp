import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { generateMealEstimate } from '../_shared/aiProvider.ts';
import { EdgeFunctionError, readDescription } from '../_shared/gemini.ts';

function errorResponse(error: EdgeFunctionError) {
  const debug = Deno.env.get('DEBUG_AI') === 'true'
    ? {
      provider: Deno.env.get('AI_PROVIDER') || 'gemini',
      ...error.debug,
    }
    : undefined;

  console.error('[ai-meal-estimate] Request failed', {
    code: error.code,
    message: error.message,
    status: error.status,
    debug,
  });

  return jsonResponse(
    {
      status: 'failed',
      error: error.message,
      code: error.code,
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

  try {
    const description = await readDescription(request);
    return jsonResponse(await generateMealEstimate(description));
  } catch (error) {
    if (error instanceof EdgeFunctionError) {
      return errorResponse(error);
    }

    console.error('[ai-meal-estimate] Unknown error', error);
    return jsonResponse(
      {
        status: 'failed',
        error: error instanceof Error ? error.message : 'AI meal estimate failed.',
        code: 'UNKNOWN_ERROR',
        ...(Deno.env.get('DEBUG_AI') === 'true'
          ? {
            debug: {
              provider: Deno.env.get('AI_PROVIDER') || 'gemini',
              finalReason: 'unknown_exception',
            },
          }
          : {}),
      },
      500,
    );
  }
});
