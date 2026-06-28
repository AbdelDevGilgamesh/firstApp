import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

type FoodCategory =
  | 'Meat'
  | 'Seafood'
  | 'Dairy and eggs'
  | 'Grains'
  | 'Bakery'
  | 'Fruit'
  | 'Vegetables'
  | 'Legumes'
  | 'Nuts'
  | 'Fats and oils'
  | 'Drinks'
  | 'Prepared meals'
  | 'Moroccan foods'
  | 'Fast food'
  | 'Snacks';

type BaseFood = {
  name: string;
  category: FoodCategory;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  unit?: string;
  baseQuantity?: number;
  keywords?: string[];
  styles?: string[];
};

type Food = {
  id: string;
  name: string;
  category: FoodCategory;
  baseQuantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  keywords: string[];
  servingPresets?: ServingPreset[];
};

type ServingPreset = {
  label: string;
  quantity: number;
  unit: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
};

const OUTPUT_PATH = resolve('assets/data/foods.json');
const TARGET_FOODS = 500;
const DEFAULT_STYLES = ['raw', 'cooked', 'grilled', 'boiled', 'fried', 'baked', 'canned', 'with oil', 'without oil'];
const STYLE_FACTORS: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {
  raw: { calories: 1, protein: 1, carbs: 1, fat: 1 },
  cooked: { calories: 1.05, protein: 1.02, carbs: 1.03, fat: 1.02 },
  grilled: { calories: 1.08, protein: 1.08, carbs: 1, fat: 0.95 },
  boiled: { calories: 0.95, protein: 0.98, carbs: 0.98, fat: 0.9 },
  fried: { calories: 1.45, protein: 1, carbs: 1.05, fat: 2.2 },
  baked: { calories: 1.12, protein: 1.03, carbs: 1.04, fat: 1.08 },
  canned: { calories: 1.02, protein: 0.98, carbs: 1.02, fat: 1.05 },
  'with oil': { calories: 1.3, protein: 1, carbs: 1, fat: 1.8 },
  'without oil': { calories: 0.9, protein: 1, carbs: 1, fat: 0.65 },
};
const SERVING_UNITS = [
  { label: '100g', baseQuantity: 100, unit: 'g', factor: 1 },
  { label: '150g', baseQuantity: 150, unit: 'g', factor: 1.5 },
  { label: '200g', baseQuantity: 200, unit: 'g', factor: 2 },
  { label: '1 cup', baseQuantity: 1, unit: 'cup', factor: 1.6 },
  { label: '1 plate', baseQuantity: 1, unit: 'plate', factor: 2.5 },
];
const BASE_FOODS: BaseFood[] = [
  { name: 'chicken breast', category: 'Meat', calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { name: 'chicken thigh', category: 'Meat', calories: 209, protein: 26, carbs: 0, fat: 10.9 },
  { name: 'beef', category: 'Meat', calories: 250, protein: 26, carbs: 0, fat: 15 },
  { name: 'turkey breast', category: 'Meat', calories: 135, protein: 30, carbs: 0, fat: 1.5 },
  { name: 'lamb', category: 'Meat', calories: 294, protein: 25, carbs: 0, fat: 21 },
  { name: 'eggs', category: 'Dairy and eggs', calories: 150, protein: 13, carbs: 1, fat: 10, baseQuantity: 2, unit: 'eggs' },
  { name: 'tuna', category: 'Seafood', calories: 132, protein: 29, carbs: 0, fat: 1 },
  { name: 'salmon', category: 'Seafood', calories: 208, protein: 20, carbs: 0, fat: 13 },
  { name: 'sardines', category: 'Seafood', calories: 208, protein: 25, carbs: 0, fat: 11.5 },
  { name: 'shrimp', category: 'Seafood', calories: 99, protein: 24, carbs: 0.2, fat: 0.3 },
  { name: 'rice', category: 'Grains', calories: 130, protein: 2.7, carbs: 28, fat: 0.3, keywords: ['white rice', 'basmati rice'] },
  { name: 'pasta', category: 'Grains', calories: 158, protein: 5.8, carbs: 31, fat: 0.9 },
  { name: 'oats', category: 'Grains', calories: 389, protein: 16.9, carbs: 66, fat: 6.9 },
  { name: 'couscous grain', category: 'Grains', calories: 112, protein: 3.8, carbs: 23, fat: 0.2, keywords: ['couscous'] },
  { name: 'quinoa', category: 'Grains', calories: 120, protein: 4.4, carbs: 21.3, fat: 1.9 },
  { name: 'bread', category: 'Bakery', calories: 100, protein: 4, carbs: 18, fat: 1.5, baseQuantity: 1, unit: 'slice' },
  { name: 'whole wheat bread', category: 'Bakery', calories: 90, protein: 4, carbs: 15, fat: 1.5, baseQuantity: 1, unit: 'slice' },
  { name: 'baguette', category: 'Bakery', calories: 270, protein: 8.7, carbs: 56, fat: 1.5 },
  { name: 'croissant', category: 'Bakery', calories: 406, protein: 8, carbs: 45, fat: 21 },
  { name: 'milk', category: 'Dairy and eggs', calories: 120, protein: 8, carbs: 12, fat: 5, baseQuantity: 250, unit: 'ml' },
  { name: 'yogurt', category: 'Dairy and eggs', calories: 100, protein: 9, carbs: 12, fat: 2, baseQuantity: 170, unit: 'g' },
  { name: 'greek yogurt', category: 'Dairy and eggs', calories: 97, protein: 10, carbs: 3.6, fat: 5 },
  { name: 'cheese', category: 'Dairy and eggs', calories: 120, protein: 7, carbs: 1, fat: 10, baseQuantity: 30, unit: 'g' },
  { name: 'apple', category: 'Fruit', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, baseQuantity: 1, unit: 'apple' },
  { name: 'banana', category: 'Fruit', calories: 105, protein: 1.3, carbs: 27, fat: 0.4, baseQuantity: 1, unit: 'banana' },
  { name: 'orange', category: 'Fruit', calories: 62, protein: 1.2, carbs: 15.4, fat: 0.2, baseQuantity: 1, unit: 'orange' },
  { name: 'strawberries', category: 'Fruit', calories: 32, protein: 0.7, carbs: 7.7, fat: 0.3 },
  { name: 'dates', category: 'Fruit', calories: 282, protein: 2.5, carbs: 75, fat: 0.4 },
  { name: 'potato', category: 'Vegetables', calories: 87, protein: 1.9, carbs: 20, fat: 0.1 },
  { name: 'sweet potato', category: 'Vegetables', calories: 86, protein: 1.6, carbs: 20, fat: 0.1 },
  { name: 'carrot', category: 'Vegetables', calories: 41, protein: 0.9, carbs: 10, fat: 0.2 },
  { name: 'broccoli', category: 'Vegetables', calories: 35, protein: 2.4, carbs: 7.2, fat: 0.4 },
  { name: 'tomato', category: 'Vegetables', calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  { name: 'lentils', category: 'Legumes', calories: 116, protein: 9, carbs: 20, fat: 0.4 },
  { name: 'chickpeas', category: 'Legumes', calories: 164, protein: 8.9, carbs: 27, fat: 2.6 },
  { name: 'beans', category: 'Legumes', calories: 127, protein: 8.7, carbs: 22.8, fat: 0.5 },
  { name: 'peas', category: 'Legumes', calories: 84, protein: 5.4, carbs: 15.6, fat: 0.4 },
  { name: 'olive oil', category: 'Fats and oils', calories: 119, protein: 0, carbs: 0, fat: 13.5, baseQuantity: 1, unit: 'tbsp', styles: ['raw'] },
  { name: 'butter', category: 'Fats and oils', calories: 102, protein: 0.1, carbs: 0, fat: 11.5, baseQuantity: 1, unit: 'tbsp', styles: ['raw'] },
  { name: 'almonds', category: 'Nuts', calories: 579, protein: 21, carbs: 22, fat: 50, styles: ['raw', 'roasted'] },
  { name: 'peanuts', category: 'Nuts', calories: 567, protein: 26, carbs: 16, fat: 49, styles: ['raw', 'roasted'] },
  { name: 'walnuts', category: 'Nuts', calories: 654, protein: 15, carbs: 14, fat: 65, styles: ['raw', 'roasted'] },
  { name: 'coffee', category: 'Drinks', calories: 2, protein: 0.3, carbs: 0, fat: 0, baseQuantity: 1, unit: 'cup', styles: ['raw'] },
  { name: 'orange juice', category: 'Drinks', calories: 112, protein: 1.7, carbs: 26, fat: 0.5, baseQuantity: 250, unit: 'ml', styles: ['raw'] },
  { name: 'soda', category: 'Drinks', calories: 105, protein: 0, carbs: 27, fat: 0, baseQuantity: 250, unit: 'ml', styles: ['raw'] },
  { name: 'chicken salad', category: 'Prepared meals', calories: 400, protein: 32, carbs: 18, fat: 22, baseQuantity: 1, unit: 'bowl' },
  { name: 'pizza slice', category: 'Fast food', calories: 285, protein: 12, carbs: 36, fat: 10.4, baseQuantity: 1, unit: 'slice' },
  { name: 'burger', category: 'Fast food', calories: 354, protein: 17, carbs: 29, fat: 18, baseQuantity: 1, unit: 'burger' },
  { name: 'fries', category: 'Fast food', calories: 312, protein: 3.4, carbs: 41, fat: 15 },
  { name: 'chips', category: 'Snacks', calories: 536, protein: 7, carbs: 53, fat: 35 },
  { name: 'popcorn', category: 'Snacks', calories: 387, protein: 12, carbs: 78, fat: 4.5 },
  { name: 'dark chocolate', category: 'Snacks', calories: 546, protein: 4.9, carbs: 61, fat: 31 },
  { name: 'harira', category: 'Moroccan foods', calories: 150, protein: 7, carbs: 22, fat: 3.5, baseQuantity: 1, unit: 'bowl', styles: ['cooked'] },
  { name: 'couscous', category: 'Moroccan foods', calories: 350, protein: 14, carbs: 55, fat: 8, baseQuantity: 1, unit: 'plate', styles: ['cooked', 'with oil', 'without oil'] },
  { name: 'tajine', category: 'Moroccan foods', calories: 420, protein: 28, carbs: 25, fat: 22, baseQuantity: 1, unit: 'plate', styles: ['cooked', 'with oil', 'without oil'] },
  { name: 'msemen', category: 'Moroccan foods', calories: 300, protein: 6, carbs: 38, fat: 14, baseQuantity: 1, unit: 'piece', styles: ['cooked', 'with oil'] },
  { name: 'baghrir', category: 'Moroccan foods', calories: 170, protein: 5, carbs: 34, fat: 1.5, baseQuantity: 1, unit: 'piece', styles: ['cooked'] },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function words(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function createServingPreset(baseFood: BaseFood, styleFactor: (typeof STYLE_FACTORS)[string], serving: (typeof SERVING_UNITS)[number]): ServingPreset {
  return {
    label: serving.label,
    quantity: serving.baseQuantity,
    unit: serving.unit,
    calories: Math.max(1, Math.round(baseFood.calories * styleFactor.calories * serving.factor)),
    protein: round(baseFood.protein * styleFactor.protein * serving.factor),
    carbs: round(baseFood.carbs * styleFactor.carbs * serving.factor),
    fat: round(baseFood.fat * styleFactor.fat * serving.factor),
  };
}

function createFood(baseFood: BaseFood, style: string): Food {
  const styleFactor = STYLE_FACTORS[style] ?? STYLE_FACTORS.raw;
  const name = style === 'raw' ? baseFood.name : `${style} ${baseFood.name}`;
  const calories = Math.max(1, Math.round(baseFood.calories * styleFactor.calories));
  const protein = round(baseFood.protein * styleFactor.protein);
  const carbs = round(baseFood.carbs * styleFactor.carbs);
  const fat = round(baseFood.fat * styleFactor.fat);
  const baseQuantity = baseFood.baseQuantity ?? 100;
  const unit = baseFood.unit ?? 'g';
  const servingPresets =
    baseFood.baseQuantity || baseFood.unit
      ? [
          {
            label: `${baseQuantity} ${unit}`,
            quantity: baseQuantity,
            unit,
            calories,
            protein,
            carbs,
            fat,
          },
          { label: `2 ${unit}`, quantity: 2, unit },
          { label: `3 ${unit}`, quantity: 3, unit },
        ]
      : SERVING_UNITS.map((serving) => createServingPreset(baseFood, styleFactor, serving));

  return {
    id: slugify(name),
    name,
    category: baseFood.category,
    baseQuantity,
    unit,
    calories,
    protein,
    carbs,
    fat,
    servingPresets,
    keywords: Array.from(
      new Set([
        ...words(baseFood.name),
        ...words(name),
        ...words(baseFood.category),
        ...words(style),
        ...(baseFood.keywords ?? []),
      ]),
    ),
  };
}

async function generateFoodDatabase() {
  const foods: Food[] = [];
  const seenIds = new Set<string>();

  for (const baseFood of BASE_FOODS) {
    const styles = baseFood.styles ?? DEFAULT_STYLES;

    for (const style of styles) {
      if (foods.length >= TARGET_FOODS) {
        break;
      }

      const food = createFood(baseFood, style);

      if (seenIds.has(food.id)) {
        continue;
      }

      seenIds.add(food.id);
      foods.push(food);
    }
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(foods, null, 2)}\n`, 'utf8');
  console.log(`Generated foods: ${foods.length}`);
  console.log(`Output path: ${OUTPUT_PATH}`);
}

generateFoodDatabase().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
