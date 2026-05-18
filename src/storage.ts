import AsyncStorage from '@react-native-async-storage/async-storage';

import { FoodEntry } from './types';

const FOOD_ENTRIES_KEY = 'calorie-tracker.food-entries';
const DAILY_GOAL_KEY = 'calorie-tracker.daily-goal';

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
