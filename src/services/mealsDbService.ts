import { Database, supabase } from '@/src/lib/supabase';

type MealInsert = Database['public']['Tables']['meals']['Insert'];
type MealUpdate = Database['public']['Tables']['meals']['Update'];
type MealIngredientInsert = Database['public']['Tables']['meal_ingredients']['Insert'];
type NewMealIngredientInsert = Omit<MealIngredientInsert, 'meal_id'> & { meal_id?: string };
type MealRow = Database['public']['Tables']['meals']['Row'];
type MealIngredientRow = Database['public']['Tables']['meal_ingredients']['Row'];

type SupabaseTableError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

function warnNotConfigured() {
  console.warn('Supabase is not configured. Meals database service skipped.');
}

function logSupabaseError(table: 'meals' | 'meal_ingredients', action: string, error: SupabaseTableError) {
  console.error(`${table} Supabase ${action} error`, {
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
    .from('meals')
    .select('*, meal_ingredients(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logSupabaseError('meals', 'list', error);
    return [];
  }

  return data ?? [];
}

export async function create(
  meal: MealInsert,
  ingredients: NewMealIngredientInsert[] = [],
): Promise<{ data: MealRow | null; error: SupabaseTableError | null }> {
  if (!supabase) {
    warnNotConfigured();
    return { data: null, error: { message: 'Supabase is not configured.' } };
  }

  const { data, error } = await supabase
    .from('meals')
    .insert({
      user_id: meal.user_id,
      name: meal.name,
      category: meal.category ?? 'Meals',
      source: meal.source ?? 'meal',
      base_quantity: meal.base_quantity ?? 1,
      unit: meal.unit ?? 'meal',
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      keywords: meal.keywords ?? [],
      created_at: meal.created_at,
    })
    .select('*')
    .single();

  if (error) {
    logSupabaseError('meals', 'insert', error);
    return { data: null, error };
  }

  if (ingredients.length > 0) {
    const { error: ingredientsError } = await supabase
      .from('meal_ingredients')
      .insert(ingredients.map((ingredient) => ({ ...ingredient, meal_id: data.id })));

    if (ingredientsError) {
      logSupabaseError('meal_ingredients', 'insert', ingredientsError);
    }
  }

  return { data, error: null };
}

export async function createIngredient(
  ingredient: MealIngredientInsert,
): Promise<{ data: MealIngredientRow | null; error: SupabaseTableError | null }> {
  if (!supabase) {
    warnNotConfigured();
    return { data: null, error: { message: 'Supabase is not configured.' } };
  }

  const { data, error } = await supabase
    .from('meal_ingredients')
    .insert(ingredient)
    .select('*')
    .single();

  if (error) {
    logSupabaseError('meal_ingredients', 'insert', error);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function update(id: string, changes: MealUpdate) {
  if (!supabase) {
    warnNotConfigured();
    return null;
  }

  const { data, error } = await supabase
    .from('meals')
    .update({
      name: changes.name,
      category: changes.category,
      source: changes.source,
      base_quantity: changes.base_quantity,
      unit: changes.unit,
      calories: changes.calories,
      protein: changes.protein,
      carbs: changes.carbs,
      fat: changes.fat,
      keywords: changes.keywords,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    logSupabaseError('meals', 'update', error);
    return null;
  }

  return data;
}

export async function remove(id: string) {
  if (!supabase) {
    warnNotConfigured();
    return false;
  }

  const { error } = await supabase.from('meals').delete().eq('id', id);

  if (error) {
    logSupabaseError('meals', 'delete', error);
    return false;
  }

  return true;
}
