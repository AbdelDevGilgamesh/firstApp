import AsyncStorage from '@react-native-async-storage/async-storage';

import { NutritionProfile } from './utils/nutritionTargets';
import { FoodEntry, FoodTemplate, MealTemplate, TodayDashboardStyle, WaterLog } from './types';

const FOOD_ENTRIES_KEY = 'calorie-tracker.food-entries';
const DAILY_GOAL_KEY = 'calorie-tracker.daily-goal';
const FOOD_TEMPLATES_KEY = 'calorie-tracker.food-templates';
const MEAL_TEMPLATES_KEY = 'calorie-tracker.meal-templates';
const PINNED_FOODS_KEY = 'calorie-tracker.pinned-foods';
const FOOD_USAGE_COUNTS_KEY = 'calorie-tracker.food-usage-counts';
const TODAY_DASHBOARD_STYLE_KEY = 'calorie-tracker.today-dashboard-style';
const WATER_INTAKE_PREFIX = 'calorie-tracker.water-intake.';
const WATER_LOG_PREFIX = 'calorie-tracker.water-log.';
const WATER_INTAKE_UNLOCKED_KEY = 'calorie-tracker.water-intake-unlocked';
const WATER_GOAL_GLASSES_KEY = 'calorie-tracker.water-goal-glasses';
const MACRO_GOALS_KEY = 'calorie-tracker.macro-goals';
const NUTRITION_PROFILE_KEY = 'nutritionProfile';

export const DEFAULT_DAILY_GOAL = 2000;
export const DEFAULT_TODAY_DASHBOARD_STYLE: TodayDashboardStyle = 'classic';
export const DEFAULT_WATER_GOAL_GLASSES = 8;
export const DEFAULT_MACRO_GOALS = {
  protein: 120,
  carbs: 250,
  fat: 70,
};

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

export async function loadMacroGoals() {
  try {
    const rawGoals = await AsyncStorage.getItem(MACRO_GOALS_KEY);

    if (!rawGoals) {
      return DEFAULT_MACRO_GOALS;
    }

    const parsedGoals = JSON.parse(rawGoals) as Partial<typeof DEFAULT_MACRO_GOALS>;

    return {
      protein: Number.isFinite(parsedGoals.protein) ? Number(parsedGoals.protein) : DEFAULT_MACRO_GOALS.protein,
      carbs: Number.isFinite(parsedGoals.carbs) ? Number(parsedGoals.carbs) : DEFAULT_MACRO_GOALS.carbs,
      fat: Number.isFinite(parsedGoals.fat) ? Number(parsedGoals.fat) : DEFAULT_MACRO_GOALS.fat,
    };
  } catch (error) {
    console.warn('Failed to load macro goals from AsyncStorage.', error);
    return DEFAULT_MACRO_GOALS;
  }
}

export async function saveMacroGoals(goals: typeof DEFAULT_MACRO_GOALS) {
  try {
    await AsyncStorage.setItem(MACRO_GOALS_KEY, JSON.stringify(goals));
  } catch (error) {
    console.warn('Failed to save macro goals to AsyncStorage.', error);
  }
}

export async function loadNutritionProfile(): Promise<NutritionProfile | null> {
  try {
    const rawProfile = await AsyncStorage.getItem(NUTRITION_PROFILE_KEY);

    if (!rawProfile) {
      return null;
    }

    const parsedProfile = JSON.parse(rawProfile) as NutritionProfile;

    return parsedProfile && typeof parsedProfile === 'object' ? parsedProfile : null;
  } catch (error) {
    console.warn('Failed to load nutrition profile from AsyncStorage.', error);
    return null;
  }
}

export async function saveNutritionProfile(profile: NutritionProfile) {
  try {
    await AsyncStorage.setItem(NUTRITION_PROFILE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.warn('Failed to save nutrition profile to AsyncStorage.', error);
  }
}

export async function loadTodayDashboardStyle(): Promise<TodayDashboardStyle> {
  try {
    const rawStyle = await AsyncStorage.getItem(TODAY_DASHBOARD_STYLE_KEY);

    return rawStyle === 'premiumDark' || rawStyle === 'classic'
      ? rawStyle
      : DEFAULT_TODAY_DASHBOARD_STYLE;
  } catch (error) {
    console.warn('Failed to load Today dashboard style from AsyncStorage.', error);
    return DEFAULT_TODAY_DASHBOARD_STYLE;
  }
}

export async function saveTodayDashboardStyle(style: TodayDashboardStyle) {
  try {
    await AsyncStorage.setItem(TODAY_DASHBOARD_STYLE_KEY, style);
  } catch (error) {
    console.warn('Failed to save Today dashboard style to AsyncStorage.', error);
  }
}

export async function loadWaterIntake(date: string) {
  try {
    const rawCount = await AsyncStorage.getItem(`${WATER_INTAKE_PREFIX}${date}`);
    const parsedCount = rawCount ? Number(rawCount) : 0;

    return Number.isFinite(parsedCount) && parsedCount >= 0 ? Math.min(Math.round(parsedCount), 20) : 0;
  } catch (error) {
    console.warn('Failed to load water intake from AsyncStorage.', error);
    return 0;
  }
}

export async function saveWaterIntake(date: string, count: number) {
  try {
    await AsyncStorage.setItem(`${WATER_INTAKE_PREFIX}${date}`, String(Math.max(0, Math.min(20, count))));
  } catch (error) {
    console.warn('Failed to save water intake to AsyncStorage.', error);
  }
}

export async function loadWaterLog(date: string): Promise<WaterLog> {
  try {
    const rawLog = await AsyncStorage.getItem(`${WATER_LOG_PREFIX}${date}`);

    if (rawLog) {
      const parsedLog = JSON.parse(rawLog) as WaterLog;

      if (parsedLog?.date === date && Array.isArray(parsedLog.entries)) {
        return {
          date,
          entries: parsedLog.entries.filter(
            (entry) =>
              typeof entry.id === 'string' &&
              Number.isFinite(entry.amountMl) &&
              typeof entry.createdAt === 'string',
          ),
        };
      }
    }

    const legacyCount = await loadWaterIntake(date);
    const now = new Date().toISOString();

    return {
      date,
      entries: Array.from({ length: legacyCount }, (_, index) => ({
        id: `legacy-${date}-${index}`,
        amountMl: 250,
        createdAt: now,
      })),
    };
  } catch (error) {
    console.warn('Failed to load water log from AsyncStorage.', error);
    return { date, entries: [] };
  }
}

export async function saveWaterLog(log: WaterLog) {
  try {
    await AsyncStorage.setItem(`${WATER_LOG_PREFIX}${log.date}`, JSON.stringify(log));
  } catch (error) {
    console.warn('Failed to save water log to AsyncStorage.', error);
  }
}

export async function loadWaterIntakeUnlocked() {
  try {
    return (await AsyncStorage.getItem(WATER_INTAKE_UNLOCKED_KEY)) === 'true';
  } catch (error) {
    console.warn('Failed to load water intake unlock from AsyncStorage.', error);
    return false;
  }
}

export async function saveWaterIntakeUnlocked(isUnlocked: boolean) {
  try {
    await AsyncStorage.setItem(WATER_INTAKE_UNLOCKED_KEY, String(isUnlocked));
  } catch (error) {
    console.warn('Failed to save water intake unlock to AsyncStorage.', error);
  }
}

export async function loadWaterGoalGlasses() {
  try {
    const rawGoal = await AsyncStorage.getItem(WATER_GOAL_GLASSES_KEY);
    const parsedGoal = rawGoal ? Number(rawGoal) : DEFAULT_WATER_GOAL_GLASSES;

    return Number.isFinite(parsedGoal)
      ? Math.max(1, Math.min(20, Math.round(parsedGoal)))
      : DEFAULT_WATER_GOAL_GLASSES;
  } catch (error) {
    console.warn('Failed to load water goal from AsyncStorage.', error);
    return DEFAULT_WATER_GOAL_GLASSES;
  }
}

export async function saveWaterGoalGlasses(goal: number) {
  try {
    await AsyncStorage.setItem(WATER_GOAL_GLASSES_KEY, String(Math.max(1, Math.min(20, Math.round(goal)))));
  } catch (error) {
    console.warn('Failed to save water goal to AsyncStorage.', error);
  }
}
