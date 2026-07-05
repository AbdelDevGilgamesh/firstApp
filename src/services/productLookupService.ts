import { supabase } from '@/src/lib/supabase';

export type OnlineProductLookupProduct = {
  barcode: string;
  name: string;
  brand?: string;
  servingSize?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
  sodium?: number;
};

export type OnlineProductLookupResult =
  | {
      status: 'found';
      source: 'openfoodfacts' | 'external' | 'ai_normalized';
      product: OnlineProductLookupProduct;
    }
  | {
      status: 'not_found';
      code: 'PRODUCT_NOT_FOUND';
    }
  | {
      status: 'error';
      code: 'LOOKUP_ERROR' | 'INVALID_INPUT';
      error: string;
    };

export async function lookupBarcodeOnline(barcode: string): Promise<OnlineProductLookupResult> {
  if (!supabase) {
    return {
      status: 'error',
      code: 'LOOKUP_ERROR',
      error: 'Supabase is not configured.',
    };
  }

  const { data, error } = await supabase.functions.invoke('product-barcode-lookup', {
    body: { barcode },
  });

  if (error) {
    console.error('[Product lookup] Supabase function failed', {
      name: error.name,
      message: error.message,
      context: 'context' in error ? error.context : undefined,
    });
    return {
      status: 'error',
      code: 'LOOKUP_ERROR',
      error: 'Could not check product database.',
    };
  }

  if (!data || typeof data !== 'object') {
    return {
      status: 'error',
      code: 'LOOKUP_ERROR',
      error: 'Product lookup returned no data.',
    };
  }

  return data as OnlineProductLookupResult;
}

export async function lookupBarcodeFromDatabases(barcode: string) {
  return lookupBarcodeOnline(barcode);
}
