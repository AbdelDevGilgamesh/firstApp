import { Database, supabase } from '@/src/lib/supabase';

type ScannedFoodInsert = Database['public']['Tables']['scanned_foods_cache']['Insert'];
type ScannedFoodUpdate = Database['public']['Tables']['scanned_foods_cache']['Update'];
type ScannedFoodRow = Database['public']['Tables']['scanned_foods_cache']['Row'];

type SupabaseTableError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

function warnNotConfigured() {
  console.warn('Supabase is not configured. Scanned foods database service skipped.');
}

function logSupabaseError(action: string, error: SupabaseTableError) {
  console.error(`Scanned food Supabase ${action} error`, {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
  });
}

export async function listByUserId(userId: string) {
  if (!supabase) {
    warnNotConfigured();
    return [];
  }

  const { data, error } = await supabase
    .from('scanned_foods_cache')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logSupabaseError('list', error);
    return [];
  }

  return data ?? [];
}

export async function create(
  food: ScannedFoodInsert,
): Promise<{ data: ScannedFoodRow | null; error: SupabaseTableError | null }> {
  if (!supabase) {
    warnNotConfigured();
    return { data: null, error: { message: 'Supabase is not configured.' } };
  }

  const { data, error } = await supabase
    .from('scanned_foods_cache')
    .upsert(food, { onConflict: 'user_id,barcode' })
    .select('*')
    .single();

  if (error) {
    logSupabaseError('insert', error);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function update(id: string, changes: ScannedFoodUpdate) {
  if (!supabase) {
    warnNotConfigured();
    return null;
  }

  const { data, error } = await supabase
    .from('scanned_foods_cache')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    logSupabaseError('update', error);
    return null;
  }

  return data;
}

export async function remove(id: string) {
  if (!supabase) {
    warnNotConfigured();
    return false;
  }

  const { error } = await supabase.from('scanned_foods_cache').delete().eq('id', id);

  if (error) {
    logSupabaseError('delete', error);
    return false;
  }

  return true;
}
