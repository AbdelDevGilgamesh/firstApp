import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { getDateKey } from '@/src/date';
import {
  DEFAULT_DAILY_GOAL,
  loadDailyGoal,
  loadFoodEntries,
  saveDailyGoal,
  saveFoodEntries,
} from '@/src/storage';
import { DaySummary, FoodEntry } from '@/src/types';

type AddFoodInput = {
  name: string;
  calories: number;
  quantity?: string;
};

type CalorieContextValue = {
  entries: FoodEntry[];
  dailyGoal: number;
  isLoading: boolean;
  addFood: (input: AddFoodInput) => Promise<void>;
  updateDailyGoal: (goal: number) => Promise<void>;
  getEntriesForDate: (date: string) => FoodEntry[];
  getTotalForDate: (date: string) => number;
  daySummaries: DaySummary[];
};

const CalorieContext = createContext<CalorieContextValue | undefined>(undefined);

export function CalorieProvider({ children }: PropsWithChildren) {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      try {
        const [storedEntries, storedGoal] = await Promise.all([loadFoodEntries(), loadDailyGoal()]);

        if (isMounted) {
          setEntries(storedEntries);
          setDailyGoal(storedGoal);
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
      name: input.name.trim(),
      calories: input.calories,
      quantity: input.quantity?.trim() || undefined,
      date: getDateKey(now),
      createdAt: now.toISOString(),
    };
    const nextEntries = [nextEntry, ...entries];

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
      dailyGoal,
      isLoading,
      addFood,
      updateDailyGoal,
      getEntriesForDate,
      getTotalForDate,
      daySummaries,
    }),
    [dailyGoal, daySummaries, entries, isLoading],
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
