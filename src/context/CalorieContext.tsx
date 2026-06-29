import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { getDateKey } from '@/src/date';
import { Database } from '@/src/lib/supabase';
import {
  create as createFoodEntry,
  listByUserId as listFoodEntriesByUserId,
  remove as removeFoodEntry,
  update as updateFoodEntry,
} from '@/src/services/foodEntriesDbService';
import {
  create as createCustomFood,
  listByUserId as listCustomFoodsByUserId,
  remove as removeCustomFood,
} from '@/src/services/customFoodsDbService';
import { create as createMeal } from '@/src/services/mealsDbService';
import {
  DEFAULT_DAILY_GOAL,
  loadDailyGoal,
  loadFoodUsageCounts,
  loadFoodEntries,
  loadFoodTemplates,
  loadMealTemplates,
  loadPinnedFoodKeys,
  saveDailyGoal,
  saveFoodEntries,
  saveFoodTemplates,
  saveFoodUsageCounts,
  saveMealTemplates,
  savePinnedFoodKeys,
} from '@/src/storage';
import { DaySummary, FoodEntry, FoodTemplate, MealIngredient, MealTemplate } from '@/src/types';

type FoodEntryRow = Database['public']['Tables']['food_entries']['Row'];
type CustomFoodRow = Database['public']['Tables']['custom_foods']['Row'];

type FoodDetailsInput = {
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
};

type AddFoodInput = FoodDetailsInput;

type UpdateFoodInput = AddFoodInput;

type AddTemplateInput = {
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
  servingPresets?: FoodTemplate['servingPresets'];
  source?: 'custom' | 'barcode';
};

type AddMealTemplateInput = {
  name: string;
  ingredients: MealIngredient[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type CalorieContextValue = {
  entries: FoodEntry[];
  foodTemplates: FoodTemplate[];
  mealTemplates: MealTemplate[];
  foodUsageCounts: Record<string, number>;
  pinnedFoodKeys: string[];
  dailyGoal: number;
  isLoading: boolean;
  addFood: (input: AddFoodInput) => Promise<void>;
  updateFood: (id: string, input: UpdateFoodInput) => Promise<void>;
  deleteFood: (id: string) => Promise<void>;
  addFoodTemplate: (input: AddTemplateInput) => Promise<FoodTemplate>;
  deleteFoodTemplate: (id: string) => Promise<void>;
  addMealTemplate: (input: AddMealTemplateInput) => Promise<MealTemplate>;
  togglePinnedFood: (foodKey: string) => Promise<void>;
  updateDailyGoal: (goal: number) => Promise<void>;
  getEntriesForDate: (date: string) => FoodEntry[];
  getTotalForDate: (date: string) => number;
  daySummaries: DaySummary[];
};

const CalorieContext = createContext<CalorieContextValue | undefined>(undefined);
const TEST_PROFILE_ID_KEY = 'testProfileId';
const LEGACY_TEST_PROFILE_ID_KEY = 'calorie-tracker.test-profile-id';

async function loadTestProfileId() {
  try {
    return (
      (await AsyncStorage.getItem(TEST_PROFILE_ID_KEY)) ??
      (await AsyncStorage.getItem(LEGACY_TEST_PROFILE_ID_KEY))
    );
  } catch (error) {
    console.warn('Failed to load testProfileId for food entry sync.', error);
    return null;
  }
}

function getEntrySource(input: FoodDetailsInput) {
  if (input.source) {
    return input.source;
  }

  if (input.foodKey?.startsWith('meal:')) {
    return 'meal';
  }

  if (input.foodKey) {
    return 'food';
  }

  return 'manual';
}

function normalizeFoodKey(value?: string) {
  return value?.trim() || `manual:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTemplateKey(template: FoodTemplate) {
  return (
    template.supabaseId ??
    template.foodKey ??
    template.id ??
    template.name
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
  );
}

function toFiniteNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isUuid(value: unknown) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function getRemoteId(item?: { id?: string; supabaseId?: string }) {
  if (!item) {
    return null;
  }

  return item.supabaseId ?? (isUuid(item.id) ? item.id : null);
}

function mapDbFoodEntry(row: FoodEntryRow): FoodEntry {
  const createdAt = row.created_at;

  return {
    id: row.id,
    localId: row.id,
    supabaseId: row.id,
    remoteId: row.id,
    foodKey: row.food_key ?? undefined,
    name: row.name,
    calories: row.calories,
    quantity: row.quantity ?? undefined,
    quantityValue: row.quantity_value ?? undefined,
    unit: row.unit ?? undefined,
    protein: row.protein ?? undefined,
    carbs: row.carbs ?? undefined,
    fat: row.fat ?? undefined,
    baseQuantity: row.base_quantity ?? undefined,
    baseCalories: row.base_calories ?? undefined,
    baseProtein: row.base_protein ?? undefined,
    baseCarbs: row.base_carbs ?? undefined,
    baseFat: row.base_fat ?? undefined,
    source: row.source ?? undefined,
    date: row.entry_date ?? createdAt.slice(0, 10),
    createdAt,
  };
}

function mapDbCustomFood(row: CustomFoodRow): FoodTemplate {
  const servingPresets = Array.isArray(row.serving_presets)
    ? (row.serving_presets as FoodTemplate['servingPresets'])
    : undefined;

  return {
    id: row.id,
    localId: row.id,
    supabaseId: row.id,
    foodKey: row.food_key ?? undefined,
    barcode: row.barcode ?? undefined,
    name: row.name,
    category: row.category ?? 'Custom foods',
    baseQuantity: Number(row.base_quantity ?? 100),
    unit: row.unit ?? 'g',
    baseCalories: Math.round(Number(row.calories ?? row.base_calories ?? 0)),
    protein: Number(row.protein ?? 0),
    carbs: Number(row.carbs ?? 0),
    fat: Number(row.fat ?? 0),
    keywords: row.keywords ?? [],
    servingPresets,
    source: row.source ?? 'custom',
    createdAt: row.created_at,
  };
}

function mergeFoodTemplates(localTemplates: FoodTemplate[], remoteTemplates: FoodTemplate[]) {
  const templatesByKey = new Map<string, FoodTemplate>();

  for (const template of localTemplates) {
    templatesByKey.set(normalizeTemplateKey(template), template);
  }

  for (const template of remoteTemplates) {
    templatesByKey.set(normalizeTemplateKey(template), template);
  }

  return Array.from(templatesByKey.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

function mapCustomFoodToDbInsert(customFood: FoodTemplate, userId: string) {
  const generatedKey = customFood.foodKey ?? customFood.id ?? normalizeFoodKey(customFood.name);

  return {
    user_id: userId,
    food_key: customFood.foodKey ?? customFood.id ?? generatedKey,
    name: customFood.name,
    category: customFood.category ?? 'Custom foods',
    base_quantity: Number(customFood.baseQuantity ?? 100),
    unit: customFood.unit ?? 'g',
    calories: Math.round(customFood.baseCalories),
    protein: Number(customFood.protein ?? 0),
    carbs: Number(customFood.carbs ?? 0),
    fat: Number(customFood.fat ?? 0),
    source: 'custom' as const,
    keywords: customFood.keywords ?? [],
    created_at: customFood.createdAt,
  };
}

function mapFoodEntryToDbInsert(entry: FoodEntry, userId: string) {
  const flexibleEntry = entry as FoodEntry & Record<string, unknown>;
  const quantityValue = toFiniteNumber(
    entry.quantityValue ?? flexibleEntry.quantityValue ?? flexibleEntry.quantity,
    1,
  );
  const quantityText =
    typeof flexibleEntry.quantityText === 'string'
      ? flexibleEntry.quantityText
      : typeof entry.quantity === 'string'
        ? entry.quantity
        : `${quantityValue} ${entry.unit ?? ''}`.trim();
  const entryDate =
    typeof flexibleEntry.entryDate === 'string'
      ? flexibleEntry.entryDate
      : typeof flexibleEntry.entry_date === 'string'
        ? flexibleEntry.entry_date
        : entry.date ?? new Date().toISOString().slice(0, 10);

  return {
    user_id: userId,
    food_key:
      entry.foodKey ??
      (typeof flexibleEntry.foodId === 'string' ? flexibleEntry.foodId : undefined) ??
      entry.remoteId ??
      entry.id,
    name: entry.name,
    source: entry.source ?? null,
    calories: Math.round(entry.calories),
    quantity: quantityText,
    quantity_value: quantityValue,
    unit: entry.unit ?? 'serving',
    protein: Number(entry.protein ?? 0),
    carbs: Number(entry.carbs ?? 0),
    fat: Number(entry.fat ?? 0),
    base_quantity: toFiniteNumber(entry.baseQuantity ?? entry.quantityValue, quantityValue),
    base_calories: Math.round(entry.baseCalories ?? entry.calories),
    base_protein: Number(entry.baseProtein ?? entry.protein ?? 0),
    base_carbs: Number(entry.baseCarbs ?? entry.carbs ?? 0),
    base_fat: Number(entry.baseFat ?? entry.fat ?? 0),
    entry_date: entryDate,
    created_at: entry.createdAt,
  };
}

function mapFoodDetailsToDbUpdate(input: UpdateFoodInput) {
  const quantityValue = Number(input.quantityValue ?? 1);

  return {
    food_key: input.foodKey ?? normalizeFoodKey(input.name),
    name: input.name.trim(),
    source: getEntrySource(input),
    calories: Math.round(input.calories),
    quantity: input.quantity?.trim() || `${quantityValue} ${input.unit ?? ''}`.trim(),
    quantity_value: Number.isFinite(quantityValue) ? quantityValue : 1,
    unit: input.unit?.trim() || 'serving',
    protein: Number(input.protein ?? 0),
    carbs: Number(input.carbs ?? 0),
    fat: Number(input.fat ?? 0),
    base_quantity: Number(input.baseQuantity ?? input.quantityValue ?? 1),
    base_calories: Math.round(input.baseCalories ?? input.calories),
    base_protein: Number(input.baseProtein ?? input.protein ?? 0),
    base_carbs: Number(input.baseCarbs ?? input.carbs ?? 0),
    base_fat: Number(input.baseFat ?? input.fat ?? 0),
  };
}

export function CalorieProvider({ children }: PropsWithChildren) {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [foodTemplates, setFoodTemplates] = useState<FoodTemplate[]>([]);
  const [mealTemplates, setMealTemplates] = useState<MealTemplate[]>([]);
  const [foodUsageCounts, setFoodUsageCounts] = useState<Record<string, number>>({});
  const [pinnedFoodKeys, setPinnedFoodKeys] = useState<string[]>([]);
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      try {
        const [
          storedEntries,
          storedGoal,
          storedTemplates,
          storedMealTemplates,
          storedPinnedKeys,
          storedUsageCounts,
        ] =
          await Promise.all([
          loadFoodEntries(),
          loadDailyGoal(),
          loadFoodTemplates(),
          loadMealTemplates(),
          loadPinnedFoodKeys(),
          loadFoodUsageCounts(),
        ]);

        if (isMounted) {
          setEntries(storedEntries);
          setDailyGoal(storedGoal);
          setFoodTemplates(storedTemplates);
          setMealTemplates(storedMealTemplates);
          setPinnedFoodKeys(storedPinnedKeys);
          setFoodUsageCounts(storedUsageCounts);
          setIsLoading(false);
        }

        const testProfileId = await loadTestProfileId();

        if (!testProfileId) {
          return;
        }

        const dbEntries = await listFoodEntriesByUserId(testProfileId);

        if (dbEntries !== null && isMounted) {
          const syncedEntries = dbEntries.map(mapDbFoodEntry);
          setEntries(syncedEntries);
          await saveFoodEntries(syncedEntries);
        }

        const dbCustomFoods = await listCustomFoodsByUserId(testProfileId);

        if (dbCustomFoods !== null && isMounted) {
          const syncedTemplates = mergeFoodTemplates(
            storedTemplates,
            dbCustomFoods.map(mapDbCustomFood),
          );
          setFoodTemplates(syncedTemplates);
          await saveFoodTemplates(syncedTemplates);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  async function addFood(input: AddFoodInput) {
    const now = new Date();
    const nextEntry: FoodEntry = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      foodKey: normalizeFoodKey(input.foodKey ?? input.name),
      name: input.name.trim(),
      calories: input.calories,
      quantity: input.quantity?.trim() || undefined,
      quantityValue: input.quantityValue,
      unit: input.unit?.trim() || undefined,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      baseQuantity: input.baseQuantity,
      baseCalories: input.baseCalories,
      baseProtein: input.baseProtein,
      baseCarbs: input.baseCarbs,
      baseFat: input.baseFat,
      source: getEntrySource(input),
      date: getDateKey(now),
      createdAt: now.toISOString(),
    };
    const nextEntries = [nextEntry, ...entries];

    setEntries(nextEntries);
    await saveFoodEntries(nextEntries);

    if (input.foodKey) {
      await incrementFoodUsage(input.foodKey);
    }

    const testProfileId = await loadTestProfileId();

    if (!testProfileId) {
      return;
    }

    const foodEntryPayload = mapFoodEntryToDbInsert(nextEntry, testProfileId);
    const { data: dbEntry, error } = await createFoodEntry(foodEntryPayload);

    if (!dbEntry) {
      if (error) {
        console.error('Food entry Supabase sync error', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
      }
      return;
    }

    const syncedEntry = mapDbFoodEntry(dbEntry as FoodEntryRow);
    const syncedEntries = nextEntries.map((entry) =>
      entry.id === nextEntry.id
        ? {
            ...syncedEntry,
            localId: entry.localId ?? entry.id,
          }
        : entry,
    );

    setEntries(syncedEntries);
    await saveFoodEntries(syncedEntries);
  }

  async function addFoodTemplate(input: AddTemplateInput) {
    const now = new Date();
    const foodKey = normalizeFoodKey(input.name);
    const nextTemplate: FoodTemplate = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      foodKey,
      barcode: input.barcode,
      name: input.name.trim(),
      category: input.category,
      baseQuantity: input.baseQuantity,
      unit: input.unit.trim(),
      baseCalories: input.baseCalories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      keywords: input.keywords,
      servingPresets: input.servingPresets,
      source: input.source ?? 'custom',
      createdAt: now.toISOString(),
    };
    const nextTemplates = [nextTemplate, ...foodTemplates];

    setFoodTemplates(nextTemplates);
    await saveFoodTemplates(nextTemplates);

    if ((input.source ?? 'custom') !== 'custom') {
      return nextTemplate;
    }

    const testProfileId = await loadTestProfileId();

    if (!testProfileId) {
      return nextTemplate;
    }

    const customFoodPayload = mapCustomFoodToDbInsert(nextTemplate, testProfileId);
    const { data: dbCustomFood, error } = await createCustomFood(customFoodPayload);

    if (!dbCustomFood) {
      if (error) {
        console.error('Custom food Supabase error', error);
      }
      return nextTemplate;
    }

    const syncedTemplate = {
      ...mapDbCustomFood(dbCustomFood as CustomFoodRow),
      localId: nextTemplate.localId ?? nextTemplate.id,
    };
    const syncedTemplates = nextTemplates.map((template) =>
      template.id === nextTemplate.id ? syncedTemplate : template,
    );

    setFoodTemplates(syncedTemplates);
    await saveFoodTemplates(syncedTemplates);

    return syncedTemplate;
  }

  async function deleteFoodTemplate(id: string) {
    const targetTemplate = foodTemplates.find((template) => template.id === id);
    const nextTemplates = foodTemplates.filter((template) => template.id !== id);

    setFoodTemplates(nextTemplates);
    await saveFoodTemplates(nextTemplates);

    const remoteId = getRemoteId(targetTemplate);

    if (!remoteId) {
      return;
    }

    const removed = await removeCustomFood(remoteId);

    void removed;
  }

  async function addMealTemplate(input: AddMealTemplateInput) {
    const now = new Date();
    const keywords = Array.from(
      new Set([
        ...input.name.toLowerCase().split(/\s+/).filter(Boolean),
        ...input.ingredients.flatMap((ingredient) =>
          ingredient.name.toLowerCase().split(/\s+/).filter(Boolean),
        ),
        'meal',
      ]),
    );
    const nextTemplate: MealTemplate = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      name: input.name.trim(),
      category: 'Meals',
      ingredients: input.ingredients,
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      baseQuantity: 1,
      unit: 'meal',
      keywords,
      createdAt: now.toISOString(),
    };
    const nextTemplates = [nextTemplate, ...mealTemplates];

    setMealTemplates(nextTemplates);
    await saveMealTemplates(nextTemplates);

    const testProfileId = await loadTestProfileId();

    if (!testProfileId) {
      return nextTemplate;
    }

    const mealPayload = {
      user_id: testProfileId,
      name: nextTemplate.name,
      category: nextTemplate.category,
      source: 'meal',
      base_quantity: nextTemplate.baseQuantity,
      unit: nextTemplate.unit,
      calories: nextTemplate.calories,
      protein: nextTemplate.protein,
      carbs: nextTemplate.carbs,
      fat: nextTemplate.fat,
      keywords: nextTemplate.keywords,
      created_at: nextTemplate.createdAt,
    };
    const ingredientPayloads = nextTemplate.ingredients.map((ingredient) => ({
      user_id: testProfileId,
      meal_id: nextTemplate.id,
      food_id: ingredient.foodId,
      source: ingredient.foodId.split(':')[0] || 'local',
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      calories: ingredient.calories,
      protein: ingredient.protein,
      carbs: ingredient.carbs,
      fat: ingredient.fat,
      base_quantity: ingredient.baseQuantity ?? ingredient.quantity,
      base_calories: ingredient.baseCalories ?? ingredient.calories,
      base_protein: ingredient.baseProtein ?? ingredient.protein,
      base_carbs: ingredient.baseCarbs ?? ingredient.carbs,
      base_fat: ingredient.baseFat ?? ingredient.fat,
      created_at: nextTemplate.createdAt,
    }));
    const mealIngredientPayloads = ingredientPayloads.map(({ meal_id: _mealId, ...ingredient }) => ingredient);

    const { data: dbMeal, error } = await createMeal(mealPayload, mealIngredientPayloads);

    if (!dbMeal) {
      if (error) {
        console.error('Meal Supabase sync error', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
      }
      return nextTemplate;
    }

    const syncedMeal: MealTemplate = {
      ...nextTemplate,
      localId: nextTemplate.localId ?? nextTemplate.id,
      supabaseId: dbMeal.id,
      ingredients: nextTemplate.ingredients,
    };
    const syncedTemplates = nextTemplates.map((template) =>
      template.id === nextTemplate.id ? syncedMeal : template,
    );

    setMealTemplates(syncedTemplates);
    await saveMealTemplates(syncedTemplates);

    return syncedMeal;
  }

  async function togglePinnedFood(foodKey: string) {
    const nextPinnedKeys = pinnedFoodKeys.includes(foodKey)
      ? pinnedFoodKeys.filter((key) => key !== foodKey)
      : [foodKey, ...pinnedFoodKeys];

    setPinnedFoodKeys(nextPinnedKeys);
    await savePinnedFoodKeys(nextPinnedKeys);
  }

  async function incrementFoodUsage(foodKey: string) {
    const nextUsageCounts = {
      ...foodUsageCounts,
      [foodKey]: (foodUsageCounts[foodKey] ?? 0) + 1,
    };

    setFoodUsageCounts(nextUsageCounts);
    await saveFoodUsageCounts(nextUsageCounts);
  }

  async function updateFood(id: string, input: UpdateFoodInput) {
    const nextEntries = entries.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            foodKey: input.foodKey ?? entry.foodKey,
            name: input.name.trim(),
            calories: input.calories,
            quantity: input.quantity?.trim() || undefined,
            quantityValue: input.quantityValue,
            unit: input.unit?.trim() || undefined,
            protein: input.protein,
            carbs: input.carbs,
            fat: input.fat,
            baseQuantity: input.baseQuantity,
            baseCalories: input.baseCalories,
            baseProtein: input.baseProtein,
            baseCarbs: input.baseCarbs,
            baseFat: input.baseFat,
            source: getEntrySource(input),
          }
        : entry,
    );

    setEntries(nextEntries);
    await saveFoodEntries(nextEntries);

    if (input.foodKey) {
      await incrementFoodUsage(input.foodKey);
    }

    const targetEntry = entries.find((entry) => entry.id === id);
    const updatedLocalEntry = nextEntries.find((entry) => entry.id === id);
    const remoteId = getRemoteId(targetEntry);
    let dbEntry = null;

    if (remoteId) {
      const updatePayload = mapFoodDetailsToDbUpdate(input);
      dbEntry = await updateFoodEntry(remoteId, updatePayload);
    } else if (updatedLocalEntry) {
      const testProfileId = await loadTestProfileId();

      if (testProfileId) {
        const payload = mapFoodEntryToDbInsert(updatedLocalEntry, testProfileId);
        const result = await createFoodEntry(payload);
        dbEntry = result.data;
      }
    }

    if (!dbEntry) {
      return;
    }

    const syncedEntry = mapDbFoodEntry(dbEntry as FoodEntryRow);
    const syncedEntries = nextEntries.map((entry) =>
      entry.id === id ? { ...syncedEntry, localId: entry.localId ?? entry.id } : entry,
    );

    setEntries(syncedEntries);
    await saveFoodEntries(syncedEntries);
  }

  async function deleteFood(id: string) {
    const targetEntry = entries.find((entry) => entry.id === id);
    const nextEntries = entries.filter((entry) => entry.id !== id);

    setEntries(nextEntries);
    await saveFoodEntries(nextEntries);

    const remoteId = getRemoteId(targetEntry);

    if (!remoteId) {
      return;
    }

    const removed = await removeFoodEntry(remoteId);
    void removed;
  }

  async function updateDailyGoal(goal: number) {
    setDailyGoal(goal);
    await saveDailyGoal(goal);
  }

  function getEntriesForDate(date: string) {
    return entries.filter((entry) => entry.date === date);
  }

  function getTotalForDate(date: string) {
    return getEntriesForDate(date).reduce((total, entry) => total + entry.calories, 0);
  }

  const daySummaries = useMemo(() => {
    const summaries = entries.reduce<Record<string, DaySummary>>((accumulator, entry) => {
      if (!accumulator[entry.date]) {
        accumulator[entry.date] = {
          date: entry.date,
          totalCalories: 0,
          entries: [],
        };
      }

      accumulator[entry.date].entries.push(entry);
      accumulator[entry.date].totalCalories += entry.calories;

      return accumulator;
    }, {});

    return Object.values(summaries).sort((a, b) => b.date.localeCompare(a.date));
  }, [entries]);

  const value = useMemo(
    () => ({
      entries,
      foodTemplates,
      mealTemplates,
      foodUsageCounts,
      pinnedFoodKeys,
      dailyGoal,
      isLoading,
      addFood,
      updateFood,
      deleteFood,
      addFoodTemplate,
      deleteFoodTemplate,
      addMealTemplate,
      togglePinnedFood,
      updateDailyGoal,
      getEntriesForDate,
      getTotalForDate,
      daySummaries,
    }),
    [
      dailyGoal,
      daySummaries,
      entries,
      foodTemplates,
      foodUsageCounts,
      isLoading,
      mealTemplates,
      pinnedFoodKeys,
    ],
  );

  return <CalorieContext.Provider value={value}>{children}</CalorieContext.Provider>;
}

export function useCalories() {
  const context = useContext(CalorieContext);

  if (!context) {
    throw new Error('useCalories must be used inside CalorieProvider');
  }

  return context;
}
