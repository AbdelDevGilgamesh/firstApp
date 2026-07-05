import { handleOptions, jsonResponse } from '../_shared/cors.ts';

function isValidBarcode(value: unknown) {
  return typeof value === 'string' && /^[0-9A-Za-z-]{6,32}$/.test(value.trim());
}

Deno.serve(async (request) => {
  const options = handleOptions(request);

  if (options) {
    return options;
  }

  try {
    if (request.method !== 'POST') {
      return jsonResponse(
        {
          status: 'error',
          code: 'INVALID_INPUT',
          error: 'Method not allowed.',
        },
        400,
      );
    }

    const body = await request.json().catch(() => null);
    const barcode = typeof body?.barcode === 'string' ? body.barcode.trim() : '';

    if (!isValidBarcode(barcode)) {
      console.error('[product-barcode-lookup] Invalid barcode input', {
        barcodeType: typeof body?.barcode,
        barcodeLength: barcode.length,
      });
      return jsonResponse(
        {
          status: 'error',
          code: 'INVALID_INPUT',
          error: 'A valid barcode is required.',
        },
        400,
      );
    }

    console.log('[product-barcode-lookup] Lookup requested', {
      barcode,
      provider: Deno.env.get('PRODUCT_LOOKUP_PROVIDER') || 'placeholder',
    });

    // Placeholder: keep the contract stable until an approved external product source is configured.
    // Do not ask AI to infer product nutrition from barcode alone.
    return jsonResponse({
      status: 'not_found',
      code: 'PRODUCT_NOT_FOUND',
    });
  } catch (error) {
    console.error('[product-barcode-lookup] Lookup failed', error);
    return jsonResponse(
      {
        status: 'error',
        code: 'LOOKUP_ERROR',
        error: 'Could not check product database.',
      },
      500,
    );
  }
});
