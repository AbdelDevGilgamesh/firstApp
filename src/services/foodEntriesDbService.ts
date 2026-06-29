import { Database, supabase } from '@/src/lib/supabase';

type FoodEntryInsert = Database['public']['Tables']['food_entries']['Insert'];
type FoodEntryRow = Database['public']['Tables']['food_entries']['Row'];
type FoodEntryUpdate = Database['public']['Tables']['food_entries']['Update'];

function warnNotConfigured() {
  console.warn('Supabase is not configured. Food entries database service skipped.');
}

type SupabaseFoodEntryError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

function logSupabaseError(action: string, error: SupabaseFoodEntryError) {
  console.error(`Food entry Supabase ${action} error`, {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
  });
}

export async function listByUserId(userId: string) {
  if (!supabase) {
    warnNotConfigured();
    return null;
  }

  const { data, error } = await supabase
    .from('food_entries')
    .select('*')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    logSupabaseError('list', error);
    return null;
  }

  return data ?? [];
}

export async function create(entry: FoodEntryInsert): Promise<{
  data: FoodEntryRow | null;
  error: SupabaseFoodEntryError | null;
}> {
  if (!supabase) {
    warnNotConfigured();
    return { data: null, error: { message: 'Supabase is not configured.' } };
  }

  const { data, error } = await supabase.from('food_entries').insert(entry).select('*').single();

  if (error) {
    logSupabaseError('insert', error);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function update(id: string, changes: FoodEntryUpdate) {
  if (!supabase) {
    warnNotConfigured();
    return null;
  }

  const { data, error } = await supabase
    .from('food_entries')
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

  const { error } = await supabase.from('food_entries').delete().eq('id', id);

  if (error) {
    logSupabaseError('delete', error);
    return false;
  }

  return true;
}
