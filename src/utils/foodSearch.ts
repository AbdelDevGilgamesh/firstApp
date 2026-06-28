import { ServingPreset } from '@/src/types';

export type Food = {
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
  source?: 'local' | 'custom' | 'meal' | 'barcode';
};

type SearchFoodsInput<T extends Food> = {
  foods: T[];
  query: string;
  category?: string;
  limit?: number;
  usageCounts?: Record<string, number>;
  getFoodKey?: (food: T) => string;
};

const DEFAULT_LIMIT = 25;

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function scoreFood(food: Food, query: string): number {
  const normalizedQuery = normalizeText(query);
  const tokens = normalizedQuery.split(' ').filter(Boolean);

  const name = normalizeText(food.name);
  const category = normalizeText(food.category);
  const id = normalizeText(food.id);
  const keywords = food.keywords.map(normalizeText);

  let score = 0;

  for (const token of tokens) {
    if (name === token) score += 1000;
    if (name.startsWith(token)) score += 800;
    if (name.includes(token)) score += 600;

    for (const keyword of keywords) {
      if (keyword === token) score += 500;
      if (keyword.startsWith(token)) score += 400;
      if (keyword.includes(token)) score += 300;
    }

    if (category === token) score += 250;
    if (category.includes(token)) score += 150;
    if (id.includes(token)) score += 50;
  }

  if (name === normalizedQuery) score += 1200;
  if (name.startsWith(normalizedQuery)) score += 900;
  if (name.includes(normalizedQuery)) score += 700;

  return score;
}

export function searchFoods<T extends Food>({
  foods,
  query,
  category = 'All',
  limit = DEFAULT_LIMIT,
  usageCounts = {},
  getFoodKey = (food) => food.id,
}: SearchFoodsInput<T>): T[] {
  const normalizedQuery = normalizeText(query);
  const normalizedCategory = normalizeText(category);

  if (!normalizedQuery) {
    return [];
  }

  return foods
    .filter((food) => {
      if (!normalizedCategory || normalizedCategory === 'all') {
        return true;
      }

      return normalizeText(food.category) === normalizedCategory;
    })
    .map((food) => ({
      food,
      score: scoreFood(food, normalizedQuery),
      usageCount: usageCounts[getFoodKey(food)] ?? 0,
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (b.usageCount !== a.usageCount) {
        return b.usageCount - a.usageCount;
      }

      return a.food.name.localeCompare(b.food.name);
    })
    .slice(0, limit)
    .map((result) => result.food);
}
