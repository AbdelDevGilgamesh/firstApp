export type MealPhotoPortionSize = 'small' | 'medium' | 'large';
export type MealPhotoCookingFat = 'none' | 'little' | 'lot';
export type MealPhotoSauce = 'none' | 'light' | 'heavy';
export type MealPhotoFoodType = 'rice_chicken' | 'pasta' | 'salad' | 'sandwich' | 'mixed' | 'other';

export type MealPhotoEstimateInput = {
  portionSize: MealPhotoPortionSize;
  cookingFat: MealPhotoCookingFat;
  sauce: MealPhotoSauce;
  foodType: MealPhotoFoodType;
};

export type MealPhotoEstimate = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: 'Low estimate confidence' | 'Medium estimate confidence';
  explanation: string;
};

const BASE_ESTIMATES: Record<
  MealPhotoFoodType,
  { calories: number; protein: number; carbs: number; fat: number }
> = {
  rice_chicken: { calories: 600, protein: 40, carbs: 60, fat: 18 },
  pasta: { calories: 700, protein: 25, carbs: 90, fat: 20 },
  salad: { calories: 350, protein: 20, carbs: 20, fat: 18 },
  sandwich: { calories: 550, protein: 25, carbs: 55, fat: 22 },
  mixed: { calories: 650, protein: 35, carbs: 65, fat: 25 },
  other: { calories: 500, protein: 25, carbs: 50, fat: 20 },
};

const PORTION_MULTIPLIERS: Record<MealPhotoPortionSize, number> = {
  small: 0.75,
  medium: 1,
  large: 1.35,
};

const OIL_ADDITIONS: Record<MealPhotoCookingFat, { calories: number; fat: number }> = {
  none: { calories: 0, fat: 0 },
  little: { calories: 120, fat: 13 },
  lot: { calories: 250, fat: 28 },
};

const SAUCE_ADDITIONS: Record<MealPhotoSauce, { calories: number; carbs: number; fat: number }> = {
  none: { calories: 0, carbs: 0, fat: 0 },
  light: { calories: 80, carbs: 8, fat: 4 },
  heavy: { calories: 180, carbs: 18, fat: 10 },
};

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export function estimateMealFromPhoto(input: MealPhotoEstimateInput): MealPhotoEstimate {
  const base = BASE_ESTIMATES[input.foodType];
  const portionMultiplier = PORTION_MULTIPLIERS[input.portionSize];
  const oil = OIL_ADDITIONS[input.cookingFat];
  const sauce = SAUCE_ADDITIONS[input.sauce];

  return {
    name: 'Estimated meal',
    calories: Math.round(base.calories * portionMultiplier + oil.calories + sauce.calories),
    protein: round(base.protein * portionMultiplier),
    carbs: round(base.carbs * portionMultiplier + sauce.carbs),
    fat: round(base.fat * portionMultiplier + oil.fat + sauce.fat),
    confidence:
      input.foodType === 'other' || input.portionSize === 'large'
        ? 'Low estimate confidence'
        : 'Medium estimate confidence',
    explanation: 'Photo estimates can be inaccurate. Confirm portion and ingredients before saving.',
  };
}
