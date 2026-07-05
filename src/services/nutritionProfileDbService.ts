import { Database, supabase } from '@/src/lib/supabase';
import { NutritionProfile } from '@/src/utils/nutritionTargets';

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

function warnNotConfigured() {
  console.warn('Supabase is not configured. Nutrition profile sync skipped.');
}

export function mapNutritionProfileToProfileUpdate(profile: NutritionProfile): ProfileUpdate {
  return {
    nutrition_goal: profile.goal,
    nutrition_style: profile.style,
    age: profile.age ?? null,
    sex: profile.sex ?? null,
    height_cm: profile.heightCm ?? null,
    weight_kg: profile.weightKg ?? null,
    activity_level: profile.activityLevel ?? null,
    target_calories: profile.targets?.calories ?? null,
    target_protein: profile.targets?.protein ?? null,
    target_carbs: profile.targets?.carbs ?? null,
    target_fat: profile.targets?.fat ?? null,
    nutrition_profile_updated_at: profile.updatedAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function updateProfileNutrition(userId: string, profile: NutritionProfile) {
  if (!supabase) {
    warnNotConfigured();
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(mapNutritionProfileToProfileUpdate(profile))
    .eq('id', userId)
    .select('*')
    .single();

  if (error) {
    console.warn('Failed to sync nutrition profile to Supabase.', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return null;
  }

  return data;
}
