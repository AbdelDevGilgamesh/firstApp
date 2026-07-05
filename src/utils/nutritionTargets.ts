export type NutritionGoal =
  | 'maintain'
  | 'build_muscle'
  | 'cut'
  | 'performance'
  | 'eat_healthier'
  | 'custom';

export type NutritionStyle =
  | 'balanced'
  | 'high_protein'
  | 'low_carb'
  | 'keto'
  | 'mediterranean'
  | 'vegetarian'
  | 'bulking'
  | 'cutting'
  | 'custom';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active' | 'athlete';
export type NutritionSex = 'male' | 'female' | 'unspecified';
export type TargetPace = 'slow' | 'moderate' | 'aggressive';

export type NutritionTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  explanation: string[];
  warnings: string[];
};

export type NutritionProfile = {
  goal: NutritionGoal;
  style: NutritionStyle;
  age?: number;
  sex?: NutritionSex;
  heightCm?: number;
  weightKg?: number;
  activityLevel?: ActivityLevel;
  targetPace?: TargetPace;
  targets?: NutritionTargets;
  updatedAt?: string;
};

export const DEFAULT_NUTRITION_PROFILE: NutritionProfile = {
  goal: 'maintain',
  style: 'balanced',
  sex: 'unspecified',
  activityLevel: 'moderate',
};

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
  athlete: 1.9,
};

function roundToNearest(value: number, nearest: number) {
  return Math.round(value / nearest) * nearest;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getProteinGramsPerKg(goal: NutritionGoal, style: NutritionStyle) {
  if (style === 'high_protein' || goal === 'build_muscle' || style === 'bulking') {
    return 1.9;
  }

  if (goal === 'cut' || style === 'cutting') {
    return 2;
  }

  if (goal === 'performance') {
    return 1.7;
  }

  if (style === 'keto') {
    return 1.6;
  }

  return 1.6;
}

function getGoalAdjustment(goal: NutritionGoal, style: NutritionStyle, age?: number, pace?: TargetPace) {
  const isUnder18 = typeof age === 'number' && age < 18;

  if (isUnder18 && (goal === 'cut' || style === 'cutting')) {
    return 0;
  }

  if (goal === 'build_muscle' || style === 'bulking') {
    return pace === 'aggressive' ? 350 : 300;
  }

  if (goal === 'cut' || style === 'cutting') {
    if (pace === 'aggressive') {
      return -400;
    }

    return pace === 'slow' ? -250 : -325;
  }

  if (goal === 'performance') {
    return pace === 'aggressive' ? 250 : 150;
  }

  return 0;
}

function estimateBmr({
  age,
  heightCm,
  sex,
  weightKg,
}: {
  age: number;
  heightCm: number;
  sex: NutritionSex;
  weightKg: number;
}) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;

  if (sex === 'male') {
    return base + 5;
  }

  if (sex === 'female') {
    return base - 161;
  }

  return ((base + 5) + (base - 161)) / 2;
}

function getFatCalories(calories: number, style: NutritionStyle) {
  if (style === 'keto') {
    return calories * 0.7;
  }

  if (style === 'low_carb') {
    return calories * 0.4;
  }

  if (style === 'mediterranean') {
    return calories * 0.33;
  }

  return calories * 0.28;
}

export function estimateNutritionTargets(profile: NutritionProfile): NutritionTargets | null {
  const age = Number(profile.age);
  const heightCm = Number(profile.heightCm);
  const weightKg = Number(profile.weightKg);

  if (
    !Number.isFinite(age) ||
    !Number.isFinite(heightCm) ||
    !Number.isFinite(weightKg) ||
    age < 13 ||
    heightCm < 100 ||
    weightKg < 30
  ) {
    return null;
  }

  const sex = profile.sex ?? 'unspecified';
  const style = profile.style;
  const goal = profile.goal;
  const activityLevel = profile.activityLevel ?? 'moderate';
  const warnings: string[] = [];
  const explanation = [
    'Estimated from your body info, activity level, and selected goal.',
    'Targets are estimates. Adjust based on your progress and how you feel.',
  ];

  const bmr = estimateBmr({ age, heightCm, sex, weightKg });
  const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel];
  const adjustment = getGoalAdjustment(goal, style, age, profile.targetPace);
  let calories = roundToNearest(tdee + adjustment, 25);

  if (age < 18 && (goal === 'cut' || style === 'cutting')) {
    warnings.push(
      'Because you are under 18, avoid calorie restriction without guidance from a qualified professional.',
    );
  }

  if (age >= 18 && calories < 1400) {
    warnings.push('Estimated calories are low. Consider professional guidance before using a low target.');
    calories = Math.max(calories, 1400);
  }

  const protein = Math.round(weightKg * getProteinGramsPerKg(goal, style));
  let fat = Math.round(getFatCalories(calories, style) / 9);
  let carbs = Math.round((calories - protein * 4 - fat * 9) / 4);

  if (style === 'keto') {
    carbs = clamp(carbs, 20, 50);
    fat = Math.round((calories - protein * 4 - carbs * 4) / 9);
    explanation.push('Keto style keeps carbs very low and uses fat as the main calorie source.');
  } else if (style === 'low_carb') {
    const carbCalories = calories * 0.25;
    carbs = Math.round(carbCalories / 4);
    fat = Math.round((calories - protein * 4 - carbs * 4) / 9);
    explanation.push('Low carb style lowers carbs while keeping protein steady.');
  } else if (style === 'bulking' || goal === 'build_muscle') {
    explanation.push('Bulking targets add a moderate calorie surplus with higher protein.');
  } else if (style === 'cutting' || goal === 'cut') {
    explanation.push('Cutting targets use a moderate deficit with protein support.');
  } else if (style === 'vegetarian') {
    explanation.push('Vegetarian targets are balanced; plan protein from beans, dairy, eggs, tofu, or grains.');
  }

  return {
    calories,
    protein: Math.max(0, protein),
    carbs: Math.max(0, carbs),
    fat: Math.max(0, fat),
    explanation,
    warnings,
  };
}

export function validateNutritionProfileNumber(
  value: string,
  label: string,
  min: number,
  max: number,
) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return `${label} should be between ${min} and ${max}.`;
  }

  return null;
}
