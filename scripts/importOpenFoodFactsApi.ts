import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  generic_name?: string;
  brands?: string;
  categories?: string;
  categories_tags?: string[];
  nutriments?: Record<string, unknown>;
};

type SearchResponse = {
  products?: OpenFoodFactsProduct[];
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

const OUTPUT_PATH = resolve('assets/data/foods.json');
const TARGET_FOODS = 100;
const PAGE_SIZE = 20;
const MAX_PAGES_PER_TERM = 1;
const API_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const REQUEST_DELAY_MS = 3000;
const RETRY_DELAYS_MS = [2000, 5000];
const USER_AGENT = 'CalorieTrackerApp/1.0 contact:dev@example.com';
const SEARCH_TERMS = [
  'basmati rice',
  'white rice',
  'chicken breast',
  'whole milk',
  'greek yogurt',
  'tuna canned',
  'eggs',
  'whole wheat bread',
  'banana',
  'apple',
];
const FIELDS = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'categories',
  'categories_tags',
  'nutriments',
].join(',');

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function similarityKey(value: string) {
  return normalizeText(value)
    .replace(/\b(the|and|with|fresh|organic|bio|natural)\b/g, '')
    .replace(/_+/g, '_')
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

function sleep(ms: number) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
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

async function fetchSearchPage(term: string, page: number) {
  const params = new URLSearchParams({
    action: 'process',
    fields: FIELDS,
    json: '1',
    page: String(page),
    page_size: String(PAGE_SIZE),
    search_terms: term,
  });
  const url = `${API_URL}?${params.toString()}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
        },
      });

      if (response.ok) {
        return (await response.json()) as SearchResponse;
      }

      lastError = new Error(
        `Open Food Facts request failed (${response.status}) for "${term}" page ${page}`,
      );
    } catch (error) {
      lastError = error;
    }

    const retryDelay = RETRY_DELAYS_MS[attempt];

    if (retryDelay !== undefined) {
      console.warn(
        `Request failed for "${term}" page ${page}. Retrying in ${retryDelay / 1000}s...`,
      );
      await sleep(retryDelay);
    }
  }

  console.warn(`Skipping "${term}" page ${page} after retries.`, lastError);
  return null;
}

async function importFoodsFromApi() {
  const foods: AppFood[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  let skippedFoods = 0;
  const failedSearchTerms = new Set<string>();
  const successfulSearchTerms = new Set<string>();

  for (let termIndex = 0; termIndex < SEARCH_TERMS.length; termIndex += 1) {
    const term = SEARCH_TERMS[termIndex];

    if (foods.length >= TARGET_FOODS) {
      break;
    }

    if (termIndex > 0) {
      await sleep(REQUEST_DELAY_MS);
    }

    for (let page = 1; page <= MAX_PAGES_PER_TERM; page += 1) {
      if (foods.length >= TARGET_FOODS) {
        break;
      }

      if (page > 1) {
        await sleep(REQUEST_DELAY_MS);
      }

      const result = await fetchSearchPage(term, page);

      if (!result) {
        failedSearchTerms.add(term);
        break;
      }

      const products = result.products ?? [];
      successfulSearchTerms.add(term);

      if (products.length === 0) {
        break;
      }

      for (const product of products) {
        if (foods.length >= TARGET_FOODS) {
          break;
        }

        const food = mapProduct(product);

        if (!food) {
          skippedFoods += 1;
          continue;
        }

        const idKey = food.id;
        const nameKey = similarityKey(food.name);

        if (seenIds.has(idKey) || seenNames.has(nameKey)) {
          skippedFoods += 1;
          continue;
        }

        seenIds.add(idKey);
        seenNames.add(nameKey);
        foods.push(food);
      }
    }
  }

  if (foods.length > 0) {
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(foods, null, 2)}\n`, 'utf8');
  } else {
    console.warn('No valid foods found. Existing foods.json was not overwritten.');
  }

  console.log(`Successful search terms: ${Array.from(successfulSearchTerms).join(', ') || 'none'}`);
  console.log(`Failed search terms: ${Array.from(failedSearchTerms).join(', ') || 'none'}`);
  console.log(`Valid foods exported: ${foods.length}`);
  console.log(`Skipped foods: ${skippedFoods}`);
  if (foods.length > 0) {
    console.log(`Output path: ${OUTPUT_PATH}`);
  }
}

importFoodsFromApi().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
