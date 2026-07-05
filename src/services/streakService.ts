import AsyncStorage from '@react-native-async-storage/async-storage';

import { FoodEntry } from '@/src/types';
import { supabase } from '@/src/lib/supabase';

const STREAK_CURRENT_KEY = 'loggingStreak.current';
const STREAK_LONGEST_KEY = 'loggingStreak.longest';
const STREAK_LAST_LOGGED_DATE_KEY = 'loggingStreak.lastLoggedDate';
const STREAK_UPDATED_AT_KEY = 'loggingStreak.updatedAt';

export type LoggingStreak = {
  currentStreak: number;
  longestStreak: number;
  lastLoggedDate: string | null;
  isActiveToday: boolean;
  isAtRiskToday: boolean;
  updatedAt: string;
};

function createEmptyStreak(): LoggingStreak {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastLoggedDate: null,
    isActiveToday: false,
    isAtRiskToday: false,
    updatedAt: new Date().toISOString(),
  };
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);

  return getLocalDateKey(date);
}

function getEntryDate(entry: FoodEntry) {
  return entry.date || entry.createdAt.slice(0, 10);
}

export function calculateLoggingStreak(entries: FoodEntry[]): LoggingStreak {
  const today = getLocalDateKey();
  const loggedDates = new Set(entries.map(getEntryDate).filter(Boolean));
  const sortedDates = Array.from(loggedDates).sort((a, b) => b.localeCompare(a));
  const lastLoggedDate = sortedDates[0] ?? null;
  const isActiveToday = loggedDates.has(today);
  const yesterday = addDays(today, -1);
  const isAtRiskToday = !isActiveToday && loggedDates.has(yesterday);
  let startDate: string | null = null;

  if (isActiveToday) {
    startDate = today;
  } else if (loggedDates.has(yesterday)) {
    startDate = yesterday;
  }

  let currentStreak = 0;

  if (startDate) {
    let cursor = startDate;

    while (loggedDates.has(cursor)) {
      currentStreak += 1;
      cursor = addDays(cursor, -1);
    }
  }

  let longestStreak = 0;
  let rollingStreak = 0;
  let previousDate: string | null = null;

  for (const date of [...sortedDates].reverse()) {
    if (previousDate && addDays(previousDate, 1) !== date) {
      rollingStreak = 0;
    }

    rollingStreak += 1;
    longestStreak = Math.max(longestStreak, rollingStreak);
    previousDate = date;
  }

  return {
    currentStreak,
    longestStreak,
    lastLoggedDate,
    isActiveToday,
    isAtRiskToday,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadLoggingStreak(): Promise<LoggingStreak> {
  try {
    const [current, longest, lastLoggedDate, updatedAt] = await Promise.all([
      AsyncStorage.getItem(STREAK_CURRENT_KEY),
      AsyncStorage.getItem(STREAK_LONGEST_KEY),
      AsyncStorage.getItem(STREAK_LAST_LOGGED_DATE_KEY),
      AsyncStorage.getItem(STREAK_UPDATED_AT_KEY),
    ]);

    return {
      currentStreak: Number.isFinite(Number(current)) ? Number(current) : 0,
      longestStreak: Number.isFinite(Number(longest)) ? Number(longest) : 0,
      lastLoggedDate: lastLoggedDate || null,
      isActiveToday: lastLoggedDate === getLocalDateKey(),
      isAtRiskToday: Boolean(lastLoggedDate && lastLoggedDate === addDays(getLocalDateKey(), -1)),
      updatedAt: updatedAt || new Date(0).toISOString(),
    };
  } catch (error) {
    console.warn('Failed to load logging streak.', error);
    return createEmptyStreak();
  }
}

export async function saveLoggingStreak(streak: LoggingStreak) {
  try {
    await Promise.all([
      AsyncStorage.setItem(STREAK_CURRENT_KEY, String(streak.currentStreak)),
      AsyncStorage.setItem(STREAK_LONGEST_KEY, String(streak.longestStreak)),
      streak.lastLoggedDate
        ? AsyncStorage.setItem(STREAK_LAST_LOGGED_DATE_KEY, streak.lastLoggedDate)
        : AsyncStorage.removeItem(STREAK_LAST_LOGGED_DATE_KEY),
      AsyncStorage.setItem(STREAK_UPDATED_AT_KEY, streak.updatedAt),
    ]);
  } catch (error) {
    console.warn('Failed to save logging streak.', error);
  }
}

export async function loadLoggingStreakFromSupabase(userId: string) {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('daily_logging_streaks')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Failed to load logging streak from Supabase.', error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    currentStreak: Number(data.current_streak ?? 0),
    longestStreak: Number(data.longest_streak ?? 0),
    lastLoggedDate: data.last_logged_date ?? null,
    isActiveToday: data.last_logged_date === getLocalDateKey(),
    isAtRiskToday: Boolean(data.last_logged_date && data.last_logged_date === addDays(getLocalDateKey(), -1)),
    updatedAt: data.updated_at ?? new Date(0).toISOString(),
  } satisfies LoggingStreak;
}

export async function syncLoggingStreakToSupabase(streak: LoggingStreak, userId?: string | null) {
  if (!supabase || !userId) {
    return;
  }

  const { error } = await supabase.from('daily_logging_streaks').upsert(
    {
      user_id: userId,
      current_streak: streak.currentStreak,
      longest_streak: streak.longestStreak,
      last_logged_date: streak.lastLoggedDate,
      updated_at: streak.updatedAt,
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.warn('Failed to sync logging streak to Supabase.', error.message);
  }
}

export async function refreshLoggingStreak(entries: FoodEntry[], userId?: string | null) {
  const streak = calculateLoggingStreak(entries);

  await saveLoggingStreak(streak);
  await syncLoggingStreakToSupabase(streak, userId);

  return streak;
}
