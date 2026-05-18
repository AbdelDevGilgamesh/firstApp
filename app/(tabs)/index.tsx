import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/src/components/EmptyState';
import { FoodRow } from '@/src/components/FoodRow';
import { Screen } from '@/src/components/Screen';
import { StatCard } from '@/src/components/StatCard';
import { getDateKey } from '@/src/date';
import { useCalories } from '@/src/context/CalorieContext';

export default function HomeScreen() {
  const { dailyGoal, getEntriesForDate, getTotalForDate, isLoading } = useCalories();
  const today = getDateKey();
  const entries = getEntriesForDate(today);
  const totalCalories = getTotalForDate(today);
  const remainingCalories = dailyGoal - totalCalories;

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Today</Text>
        <Text style={styles.title}>{totalCalories} calories</Text>
        <Text style={styles.subtitle}>Daily goal: {dailyGoal} cal</Text>
      </View>

      <View style={styles.stats}>
        <StatCard label="Eaten" value={`${totalCalories}`} />
        <StatCard
          label={remainingCalories >= 0 ? 'Remaining' : 'Over goal'}
          value={`${Math.abs(remainingCalories)}`}
          tone={remainingCalories >= 0 ? 'success' : 'warning'}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Foods added today</Text>
        <Text style={styles.count}>{entries.length}</Text>
      </View>

      {isLoading ? (
        <EmptyState title="Loading foods" message="Your saved entries will appear here." />
      ) : entries.length === 0 ? (
        <EmptyState title="No foods yet" message="Add your first food to start tracking today." />
      ) : (
        entries.map((entry) => <FoodRow key={entry.id} entry={entry} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 20,
    shadowColor: '#1E1F24',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  eyebrow: {
    color: '#2E7D57',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 8,
    color: '#1E1F24',
    fontSize: 36,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 6,
    color: '#6B6F76',
    fontSize: 15,
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#1E1F24',
    fontSize: 20,
    fontWeight: '900',
  },
  count: {
    minWidth: 32,
    borderRadius: 16,
    backgroundColor: '#E6F1EA',
    color: '#2E7D57',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
  },
});
