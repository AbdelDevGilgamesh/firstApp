import foodsJson from '@/assets/data/foods.json';
import { FoodTemplate, MealTemplate, ServingPreset } from '@/src/types';
import { Food } from '@/src/utils/foodSearch';

export type FoodDatabaseItem = {
  id: string;
  barcode?: string;
  name: string;
  category: string;
  baseQuantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  keywords: string[];
  servingPresets?: ServingPreset[];
} & Food;

export type FoodDefinition = Food & {
  baseCalories: number;
  source: 'local' | 'custom' | 'meal' | 'barcode';
  ingredients?: MealTemplate['ingredients'];
};

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function preferBaseFood(current: FoodDefinition, next: FoodDefinition) {
  const currentIs100g = current.unit === 'g' && current.baseQuantity === 100;
  const nextIs100g = next.unit === 'g' && next.baseQuantity === 100;

  if (nextIs100g && !currentIs100g) {
    return next;
  }

  return current;
}

export const DEFAULT_FOODS: FoodDefinition[] = Array.from(
  (foodsJson as FoodDatabaseItem[])
    .map((food) => ({
      id: food.id,
      barcode: food.barcode,
      name: food.name,
      category: food.category,
      baseQuantity: food.baseQuantity,
      unit: food.unit,
      calories: food.calories,
      baseCalories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      keywords: food.keywords,
      servingPresets: food.servingPresets,
      source: 'local' as const,
    }))
    .reduce<Map<string, FoodDefinition>>((foodsByName, food) => {
      const key = normalizeName(food.name);
      const existingFood = foodsByName.get(key);

      foodsByName.set(key, existingFood ? preferBaseFood(existingFood, food) : food);
      return foodsByName;
    }, new Map())
    .values(),
);

export function templateToFoodDefinition(template: FoodTemplate): FoodDefinition {
  return {
    ...template,
    barcode: template.barcode,
    category: template.category ?? 'My foods',
    calories: template.baseCalories,
    keywords: template.keywords ?? [template.name],
    servingPresets: template.servingPresets,
    source: template.source ?? 'custom',
  };
}

export function mealToFoodDefinition(template: MealTemplate): FoodDefinition {
  return {
    id: template.id,
    name: template.name,
    category: 'Meals',
    baseQuantity: 1,
    unit: 'meal',
    calories: template.calories,
    baseCalories: template.calories,
    protein: template.protein,
    carbs: template.carbs,
    fat: template.fat,
    keywords: template.keywords,
    servingPresets: [
      {
        label: '1 meal',
        quantity: 1,
        unit: 'meal',
        calories: template.calories,
        protein: template.protein,
        carbs: template.carbs,
        fat: template.fat,
      },
    ],
    ingredients: template.ingredients,
    source: 'meal',
  };
}
