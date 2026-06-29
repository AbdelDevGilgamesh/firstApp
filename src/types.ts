export type ServingPreset = {
  label: string;
  quantity: number;
  unit: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
};

export type FoodEntry = {
  id: string;
  localId?: string;
  supabaseId?: string;
  remoteId?: string;
  foodKey?: string;
  name: string;
  calories: number;
  quantity?: string;
  quantityValue?: number;
  unit?: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  baseQuantity?: number;
  baseCalories?: number;
  baseProtein?: number;
  baseCarbs?: number;
  baseFat?: number;
  source?: string;
  date: string;
  createdAt: string;
};

export type FoodTemplate = {
  id: string;
  localId?: string;
  supabaseId?: string;
  foodKey?: string;
  barcode?: string;
  name: string;
  category?: string;
  baseQuantity: number;
  unit: string;
  baseCalories: number;
  protein: number;
  carbs: number;
  fat: number;
  keywords?: string[];
  servingPresets?: ServingPreset[];
  source?: 'custom' | 'barcode';
  createdAt: string;
};

export type MealIngredient = {
  id?: string;
  localId?: string;
  supabaseId?: string;
  foodId: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  baseQuantity?: number;
  baseCalories?: number;
  baseProtein?: number;
  baseCarbs?: number;
  baseFat?: number;
};

export type MealTemplate = {
  id: string;
  localId?: string;
  supabaseId?: string;
  name: string;
  category: 'Meals';
  ingredients: MealIngredient[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  baseQuantity: 1;
  unit: 'meal';
  keywords: string[];
  createdAt: string;
};

export type DaySummary = {
  date: string;
  totalCalories: number;
  entries: FoodEntry[];
};
