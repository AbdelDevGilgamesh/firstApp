import AsyncStorage from '@react-native-async-storage/async-storage';

import { FoodEntry, FoodTemplate, MealTemplate } from './types';

const FOOD_ENTRIES_KEY = 'calorie-tracker.food-entries';
const DAILY_GOAL_KEY = 'calorie-tracker.daily-goal';
const FOOD_TEMPLATES_KEY = 'calorie-tracker.food-templates';
const MEAL_TEMPLATES_KEY = 'calorie-tracker.meal-templates';
const PINNED_FOODS_KEY = 'calorie-tracker.pinned-foods';
const FOOD_USAGE_COUNTS_KEY = 'calorie-tracker.food-usage-counts';

export const DEFAULT_DAILY_GOAL = 2000;

export async function loadFoodEntries() {
  try {
    const rawEntries = await AsyncStorage.getItem(FOOD_ENTRIES_KEY);

    if (!rawEntries) {
      return [];
    }

    const parsedEntries = JSON.parse(rawEntries) as FoodEntry[];
    return Array.isArray(parsedEntries) ? parsedEntries : [];
  } catch (error) {
    console.warn('Failed to load food entries from AsyncStorage.', error);
    return [];
  }
}

export async function saveFoodEntries(entries: FoodEntry[]) {
  try {
    await AsyncStorage.setItem(FOOD_ENTRIES_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn('Failed to save food entries to AsyncStorage.', error);
  }
}

export async function loadFoodTemplates() {
  try {
    const rawTemplates = await AsyncStorage.getItem(FOOD_TEMPLATES_KEY);

    if (!rawTemplates) {
      return [];
    }

    const parsedTemplates = JSON.parse(rawTemplates) as FoodTemplate[];

    if (!Array.isArray(parsedTemplates)) {
      return [];
    }

    return parsedTemplates.filter(
      (template) =>
        typeof template.name === 'string' &&
        Number.isFinite(template.baseQuantity) &&
        Number.isFinite(template.baseCalories) &&
        typeof template.unit === 'string',
    );
  } catch (error) {
    console.warn('Failed to load food templates from AsyncStorage.', error);
    return [];
  }
}

export async function saveFoodTemplates(templates: FoodTemplate[]) {
  try {
    await AsyncStorage.setItem(FOOD_TEMPLATES_KEY, JSON.stringify(templates));
  } catch (error) {
    console.warn('Failed to save food templates to AsyncStorage.', error);
  }
}

export async function loadMealTemplates() {
  try {
    const rawTemplates = await AsyncStorage.getItem(MEAL_TEMPLATES_KEY);

    if (!rawTemplates) {
      return [];
    }

    const parsedTemplates = JSON.parse(rawTemplates) as MealTemplate[];

    if (!Array.isArray(parsedTemplates)) {
      return [];
    }

    return parsedTemplates.filter(
      (template) =>
        typeof template.name === 'string' &&
        template.category === 'Meals' &&
        Array.isArray(template.ingredients) &&
        Number.isFinite(template.calories),
    );
  } catch (error) {
    console.warn('Failed to load meal templates from AsyncStorage.', error);
    return [];
  }
}

export async function saveMealTemplates(templates: MealTemplate[]) {
  try {
    await AsyncStorage.setItem(MEAL_TEMPLATES_KEY, JSON.stringify(templates));
  } catch (error) {
    console.warn('Failed to save meal templates to AsyncStorage.', error);
  }
}

export async function loadPinnedFoodKeys() {
  try {
    const rawKeys = await AsyncStorage.getItem(PINNED_FOODS_KEY);

    if (!rawKeys) {
      return [];
    }

    const parsedKeys = JSON.parse(rawKeys) as string[];
    return Array.isArray(parsedKeys) ? parsedKeys.filter((key) => typeof key === 'string') : [];
  } catch (error) {
    console.warn('Failed to load pinned foods from AsyncStorage.', error);
    return [];
  }
}

export async function savePinnedFoodKeys(keys: string[]) {
  try {
    await AsyncStorage.setItem(PINNED_FOODS_KEY, JSON.stringify(keys));
  } catch (error) {
    console.warn('Failed to save pinned foods to AsyncStorage.', error);
  }
}

export async function loadFoodUsageCounts() {
  try {
    const rawCounts = await AsyncStorage.getItem(FOOD_USAGE_COUNTS_KEY);

    if (!rawCounts) {
      return {};
    }

    const parsedCounts = JSON.parse(rawCounts) as Record<string, number>;

    if (!parsedCounts || typeof parsedCounts !== 'object' || Array.isArray(parsedCounts)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsedCounts).filter(
        ([key, value]) => typeof key === 'string' && Number.isFinite(value),
      ),
    );
  } catch (error) {
    console.warn('Failed to load food usage counts from AsyncStorage.', error);
    return {};
  }
}

export async function saveFoodUsageCounts(counts: Record<string, number>) {
  try {
    await AsyncStorage.setItem(FOOD_USAGE_COUNTS_KEY, JSON.stringify(counts));
  } catch (error) {
    console.warn('Failed to save food usage counts to AsyncStorage.', error);
  }
}

export async function loadDailyGoal() {
  try {
    const rawGoal = await AsyncStorage.getItem(DAILY_GOAL_KEY);
    const parsedGoal = rawGoal ? Number(rawGoal) : DEFAULT_DAILY_GOAL;

    return Number.isFinite(parsedGoal) && parsedGoal > 0 ? parsedGoal : DEFAULT_DAILY_GOAL;
  } catch (error) {
    console.warn('Failed to load daily goal from AsyncStorage.', error);
    return DEFAULT_DAILY_GOAL;
  }
}

export async function saveDailyGoal(goal: number) {
  try {
    await AsyncStorage.setItem(DAILY_GOAL_KEY, String(goal));
  } catch (error) {
    console.warn('Failed to save daily goal to AsyncStorage.', error);
  }
}
