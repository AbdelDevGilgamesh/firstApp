import { Database, supabase } from '@/src/lib/supabase';

type CustomFoodInsert = Database['public']['Tables']['custom_foods']['Insert'];
type CustomFoodUpdate = Database['public']['Tables']['custom_foods']['Update'];
function warnNotConfigured() {
  console.warn('Supabase is not configured. Custom foods database service skipped.');
}

function logCustomFoodError(label: string, error: unknown) {
  console.error(label, error);
}

export async function listByUserId(userId: string) {
  if (!supabase) {
    warnNotConfigured();
    return null;
  }

  const { data, error } = await supabase
    .from('custom_foods')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logCustomFoodError('Custom food Supabase error', error);
    return null;
  }

  return data ?? [];
}

export async function create(food: CustomFoodInsert) {
  if (!supabase) {
    warnNotConfigured();
    return { data: null, error: null };
  }

  const { data, error } = await supabase.from('custom_foods').insert(food).select('*').single();

  if (error) {
    logCustomFoodError('Custom food Supabase error', error);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function update(id: string, changes: CustomFoodUpdate) {
  if (!supabase) {
    warnNotConfigured();
    return null;
  }

  const { data, error } = await supabase
    .from('custom_foods')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    logCustomFoodError('Custom food Supabase error', error);
    return null;
  }

  return data;
}

export async function remove(id: string) {
  if (!supabase) {
    warnNotConfigured();
    return false;
  }

  const { error } = await supabase.from('custom_foods').delete().eq('id', id);

  if (error) {
    logCustomFoodError('Custom food Supabase error', error);
    return false;
  }

  return true;
}
