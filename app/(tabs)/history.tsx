import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/src/components/EmptyState';
import { FoodRow } from '@/src/components/FoodRow';
import { Screen } from '@/src/components/Screen';
import { formatDateLabel } from '@/src/date';
import { useCalories } from '@/src/context/CalorieContext';

export default function HistoryScreen() {
  const { daySummaries, isLoading } = useCalories();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const activeDate = selectedDate ?? daySummaries[0]?.date ?? null;

  const selectedDay = useMemo(
    () => daySummaries.find((summary) => summary.date === activeDate),
    [activeDate, daySummaries],
  );

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
        <EmptyState title="No history yet" message="Saved foods are grouped by day automatically." />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Previous days</Text>
        {daySummaries.map((summary) => {
          const isSelected = summary.date === activeDate;

          return (
            <Pressable
              accessibilityRole="button"
              key={summary.date}
              onPress={() => setSelectedDate(summary.date)}
              style={({ pressed }) => [
                styles.dayRow,
                isSelected && styles.dayRowSelected,
                pressed && styles.dayRowPressed,
              ]}>
              <View>
                <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                  {formatDateLabel(summary.date)}
                </Text>
                <Text style={styles.dayMeta}>{summary.entries.length} foods</Text>
              </View>
              <Text style={[styles.dayCalories, isSelected && styles.dayCaloriesSelected]}>
                {summary.totalCalories} cal
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selectedDay ? (
        <View style={styles.section}>
          <View style={styles.detailHeader}>
            <Text style={styles.sectionTitle}>{formatDateLabel(selectedDay.date)}</Text>
            <Text style={styles.total}>{selectedDay.totalCalories} cal</Text>
          </View>
          {selectedDay.entries.map((entry) => (
            <FoodRow key={entry.id} entry={entry} />
          ))}
        </View>
      ) : null}
    </Screen>
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
});
