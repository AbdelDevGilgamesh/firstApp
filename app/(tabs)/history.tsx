import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/src/components/EmptyState';
import { FoodRow } from '@/src/components/FoodRow';
import { Screen } from '@/src/components/Screen';
import { formatDateLabel, getDateKey } from '@/src/date';
import { useCalories } from '@/src/context/CalorieContext';
import { FoodEntry } from '@/src/types';
import { useAppTheme } from '@/src/theme/appTheme';

type GoalStatus = 'Under goal' | 'Goal reached' | 'Over goal';

type WeeklyDay = {
  date: string;
  label: string;
  totalCalories: number;
  status: GoalStatus;
};

type WeeklyStats = {
  averageCalories: number;
  days: WeeklyDay[];
  highestDay: WeeklyDay | null;
  trackedDaysCount: number;
  totalCalories: number;
};

function getStartOfWeek(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + mondayOffset);

  return start;
}

function getGoalStatus(totalCalories: number, dailyGoal: number): GoalStatus {
  if (totalCalories > dailyGoal) {
    return 'Over goal';
  }

  if (totalCalories === dailyGoal) {
    return 'Goal reached';
  }

  return 'Under goal';
}

export default function HistoryScreen() {
  const theme = useAppTheme();
  const { dailyGoal, daySummaries, deleteFood, entries, isLoading } = useCalories();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const activeDate = selectedDate ?? daySummaries[0]?.date ?? null;

  const selectedDay = useMemo(
    () => daySummaries.find((summary) => summary.date === activeDate),
    [activeDate, daySummaries],
  );

  const weeklyStats = useMemo(() => {
    const totalsByDate = entries.reduce<Record<string, number>>((accumulator, entry) => {
      accumulator[entry.date] = (accumulator[entry.date] ?? 0) + entry.calories;
      return accumulator;
    }, {});
    const startOfWeek = getStartOfWeek();
    const days: WeeklyDay[] = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + index);

      const dateKey = getDateKey(date);
      const totalCalories = totalsByDate[dateKey] ?? 0;

      return {
        date: dateKey,
        label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date),
        totalCalories,
        status: getGoalStatus(totalCalories, dailyGoal),
      };
    });
    const trackedDays = days.filter((day) => day.totalCalories > 0);
    const totalCalories = days.reduce((total, day) => total + day.totalCalories, 0);
    const highestDay = trackedDays.reduce<WeeklyDay | null>(
      (highest, day) => (!highest || day.totalCalories > highest.totalCalories ? day : highest),
      null,
    );

    return {
      averageCalories: trackedDays.length > 0 ? Math.round(totalCalories / trackedDays.length) : 0,
      days,
      highestDay,
      trackedDaysCount: trackedDays.length,
      totalCalories,
    };
  }, [dailyGoal, entries]);

  function handleEdit(entry: FoodEntry) {
    router.push({ pathname: '/add', params: { entryId: entry.id } });
  }

  function handleDelete(entry: FoodEntry) {
    deleteFood(entry.id);
  }

  if (isLoading) {
    return (
      <Screen>
        <EmptyState title="Loading history" message="Your previous days will appear here." />
      </Screen>
    );
  }

  if (daySummaries.length === 0) {
    return (
      <Screen>
        <WeeklyStatsSection stats={weeklyStats} />
        <EmptyState title="No history yet" message="Saved foods are grouped by day automatically." />
      </Screen>
    );
  }

  return (
    <Screen>
      <WeeklyStatsSection stats={weeklyStats} />

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Previous days</Text>
        {daySummaries.map((summary) => {
          const isSelected = summary.date === activeDate;

          return (
            <Pressable
              accessibilityRole="button"
              key={summary.date}
              onPress={() => setSelectedDate(summary.date)}
              style={({ pressed }) => [
                styles.dayRow,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
                isSelected && styles.dayRowSelected,
                pressed && styles.dayRowPressed,
              ]}>
              <View>
                <Text style={[styles.dayLabel, { color: theme.text }, isSelected && styles.dayLabelSelected]}>
                  {formatDateLabel(summary.date)}
                </Text>
                <Text style={[styles.dayMeta, { color: theme.mutedText }]}>{summary.entries.length} foods</Text>
              </View>
              <Text style={[styles.dayCalories, { color: theme.success }, isSelected && styles.dayCaloriesSelected]}>
                {summary.totalCalories} cal
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selectedDay ? (
        <View style={styles.section}>
          <View style={styles.detailHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{formatDateLabel(selectedDay.date)}</Text>
            <Text style={[styles.total, { color: theme.success }]}>{selectedDay.totalCalories} cal</Text>
          </View>
          {selectedDay.entries.map((entry) => (
            <FoodRow
              key={entry.id}
              entry={entry}
              onDelete={handleDelete}
              onEdit={handleEdit}
              variant={theme.isDark ? 'dark' : 'light'}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function WeeklyStatsSection({ stats }: { stats: WeeklyStats }) {
  const theme = useAppTheme();

  return (
    <View style={[styles.weeklyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <View style={styles.weeklyHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>This week</Text>
        <Text style={[styles.weeklySubtle, { color: theme.mutedText }]}>{stats.trackedDaysCount} days tracked</Text>
      </View>

      <View style={styles.statGrid}>
        <View style={[styles.statTile, { backgroundColor: theme.cardAlt }]}>
          <Text style={[styles.statLabel, { color: theme.mutedText }]}>Total</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{stats.totalCalories} cal</Text>
        </View>
        <View style={[styles.statTile, { backgroundColor: theme.cardAlt }]}>
          <Text style={[styles.statLabel, { color: theme.mutedText }]}>Average/day</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{stats.averageCalories} cal</Text>
        </View>
        <View style={[styles.statTile, { backgroundColor: theme.cardAlt }]}>
          <Text style={[styles.statLabel, { color: theme.mutedText }]}>Highest day</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {stats.highestDay ? `${stats.highestDay.label}: ${stats.highestDay.totalCalories}` : 'None yet'}
          </Text>
        </View>
        <View style={[styles.statTile, { backgroundColor: theme.cardAlt }]}>
          <Text style={[styles.statLabel, { color: theme.mutedText }]}>Tracked</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{stats.trackedDaysCount} / 7 days</Text>
        </View>
      </View>

      <View style={styles.weekList}>
        {stats.days.map((day) => (
          <View key={day.date} style={[styles.weekDayRow, { backgroundColor: theme.cardAlt }]}>
            <Text style={[styles.weekDayLabel, { color: theme.text }]}>{day.label}</Text>
            <View style={styles.weekDayMeta}>
              <Text style={[styles.weekDayCalories, { color: theme.text }]}>{day.totalCalories} cal</Text>
              <Text
                style={[
                  styles.goalStatus,
                  { color: theme.success },
                  day.status === 'Goal reached' && { color: theme.primary },
                  day.status === 'Over goal' && { color: theme.warning },
                ]}>
                {day.status}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: '#1E1F24',
    fontSize: 20,
    fontWeight: '900',
  },
  dayRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  dayRowSelected: {
    backgroundColor: '#1E1F24',
  },
  dayRowPressed: {
    opacity: 0.86,
  },
  dayLabel: {
    color: '#1E1F24',
    fontSize: 16,
    fontWeight: '900',
  },
  dayLabelSelected: {
    color: '#FFFFFF',
  },
  dayMeta: {
    marginTop: 4,
    color: '#8B9098',
    fontSize: 13,
    fontWeight: '600',
  },
  dayCalories: {
    color: '#2E7D57',
    fontSize: 16,
    fontWeight: '900',
  },
  dayCaloriesSelected: {
    color: '#A8E1BE',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  total: {
    color: '#2E7D57',
    fontSize: 16,
    fontWeight: '900',
  },
  weeklyCard: {
    gap: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 16,
    shadowColor: '#1E1F24',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  weeklyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  weeklySubtle: {
    color: '#6B6F76',
    fontSize: 13,
    fontWeight: '800',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statTile: {
    minWidth: '47%',
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#F7F7F2',
    padding: 12,
  },
  statLabel: {
    color: '#6B6F76',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statValue: {
    marginTop: 6,
    color: '#1E1F24',
    fontSize: 16,
    fontWeight: '900',
  },
  weekList: {
    gap: 8,
  },
  weekDayRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 8,
    backgroundColor: '#FAFAF7',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  weekDayLabel: {
    color: '#1E1F24',
    fontSize: 15,
    fontWeight: '900',
  },
  weekDayMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  weekDayCalories: {
    color: '#1E1F24',
    fontSize: 14,
    fontWeight: '800',
  },
  goalStatus: {
    color: '#2E7D57',
    fontSize: 12,
    fontWeight: '800',
  },
  goalStatusReached: {
    color: '#2563eb',
  },
  goalStatusOver: {
    color: '#B95C3A',
  },
});
