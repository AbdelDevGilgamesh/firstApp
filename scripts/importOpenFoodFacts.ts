import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';

type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  generic_name?: string;
  brands?: string;
  categories?: string;
  categories_tags?: string[];
  nutriments?: Record<string, unknown>;
};

type AppFood = {
  id: string;
  name: string;
  category: string;
  baseQuantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  keywords: string[];
};

const SOURCE_PATH = resolve('data/openfoodfacts-products.jsonl');
const OUTPUT_PATH = resolve('assets/data/foods.json');
const MAX_FOODS = 5000;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toWords(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
}

function toNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanCategory(value: string) {
  return value
    .replace(/^[a-z]{2}:/i, '')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getCategory(product: OpenFoodFactsProduct) {
  const tag = product.categories_tags?.find((category) => {
    const cleaned = cleanCategory(category);
    return cleaned.length > 0 && !['Unknown', 'En'].includes(cleaned);
  });

  if (tag) {
    return cleanCategory(tag);
  }

  const category = product.categories
    ?.split(',')
    .map((value) => cleanCategory(value))
    .find(Boolean);

  return category || 'Packaged foods';
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function mapProduct(product: OpenFoodFactsProduct): AppFood | null {
  const name = (product.product_name || product.generic_name || '').trim();

  if (!name) {
    return null;
  }

  const nutriments = product.nutriments ?? {};
  const calories = toNumber(nutriments['energy-kcal_100g']);
  const protein = toNumber(nutriments['proteins_100g']);
  const carbs = toNumber(nutriments['carbohydrates_100g']);
  const fat = toNumber(nutriments['fat_100g']);

  if (
    calories === null ||
    protein === null ||
    carbs === null ||
    fat === null ||
    calories <= 0 ||
    calories > 900
  ) {
    return null;
  }

  const category = getCategory(product);
  const id = product.code?.trim() || normalizeText(name);
  const keywords = unique([
    ...toWords(name),
    ...toWords(category),
    ...toWords(product.brands ?? ''),
  ]).slice(0, 20);

  return {
    id,
    name,
    category,
    baseQuantity: 100,
    unit: 'g',
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    keywords,
  };
}

async function importFoods() {
  const foods: AppFood[] = [];
  const seenNames = new Set<string>();
  let totalLinesRead = 0;
  let skippedFoods = 0;
  const lines = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(SOURCE_PATH, { encoding: 'utf8' }),
  });

  for await (const line of lines) {
    if (foods.length >= MAX_FOODS) {
      break;
    }

    totalLinesRead += 1;
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      skippedFoods += 1;
      continue;
    }

    try {
      const product = JSON.parse(trimmedLine) as OpenFoodFactsProduct;
      const food = mapProduct(product);

      if (!food) {
        skippedFoods += 1;
        continue;
      }

      const nameKey = normalizeText(food.name);

      if (seenNames.has(nameKey)) {
        skippedFoods += 1;
        continue;
      }

      seenNames.add(nameKey);
      foods.push(food);
    } catch (error) {
      skippedFoods += 1;
    }
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(foods, null, 2)}\n`, 'utf8');
  console.log(`Total lines read: ${totalLinesRead}`);
  console.log(`Valid foods exported: ${foods.length}`);
  console.log(`Skipped foods: ${skippedFoods}`);
  console.log(`Output path: ${OUTPUT_PATH}`);
}

importFoods().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
