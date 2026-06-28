import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { getDateKey } from '@/src/date';
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
      foodKey: input.foodKey,
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
      date: getDateKey(now),
      createdAt: now.toISOString(),
    };
    const nextEntries = [nextEntry, ...entries];

    setEntries(nextEntries);
    await saveFoodEntries(nextEntries);

    if (input.foodKey) {
      await incrementFoodUsage(input.foodKey);
    }
  }

  async function addFoodTemplate(input: AddTemplateInput) {
    const now = new Date();
    const nextTemplate: FoodTemplate = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
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
      source: input.source ?? 'custom',
      createdAt: now.toISOString(),
    };
    const nextTemplates = [nextTemplate, ...foodTemplates];

    setFoodTemplates(nextTemplates);
    await saveFoodTemplates(nextTemplates);

    return nextTemplate;
  }

  async function deleteFoodTemplate(id: string) {
    const nextTemplates = foodTemplates.filter((template) => template.id !== id);

    setFoodTemplates(nextTemplates);
    await saveFoodTemplates(nextTemplates);
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

    return nextTemplate;
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
          }
        : entry,
    );

    setEntries(nextEntries);
    await saveFoodEntries(nextEntries);

    if (input.foodKey) {
      await incrementFoodUsage(input.foodKey);
    }
  }

  async function deleteFood(id: string) {
    const nextEntries = entries.filter((entry) => entry.id !== id);

    setEntries(nextEntries);
    await saveFoodEntries(nextEntries);
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
