import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { generateMealEstimate } from '../_shared/aiProvider.ts';
import { EdgeFunctionError, readDescription } from '../_shared/gemini.ts';

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
      console.error('[ai-meal-estimate] Request failed', {
        code: error.code,
        message: error.message,
      });
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }

    console.error('[ai-meal-estimate] Unknown error', error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'AI meal estimate failed.',
        code: 'UNKNOWN_ERROR',
      },
      500,
    );
  }
});
