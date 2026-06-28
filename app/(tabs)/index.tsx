import { router } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/src/components/EmptyState';
import { FoodRow } from '@/src/components/FoodRow';
import { Screen } from '@/src/components/Screen';
import { StatCard } from '@/src/components/StatCard';
import { getDateKey } from '@/src/date';
import { useCalories } from '@/src/context/CalorieContext';
import { FoodEntry } from '@/src/types';

export default function HomeScreen() {
  const { dailyGoal, deleteFood, getEntriesForDate, getTotalForDate, isLoading } = useCalories();
  const today = getDateKey();
  const entries = getEntriesForDate(today);
  const totalCalories = getTotalForDate(today);
  const remainingCalories = dailyGoal - totalCalories;
  const progressPercent = dailyGoal > 0 ? Math.round((totalCalories / dailyGoal) * 100) : 0;
  const progressBarPercent = Math.min(progressPercent, 100);
  const calorieStatus =
    remainingCalories >= 0
      ? `${remainingCalories} calories remaining`
      : `${Math.abs(remainingCalories)} calories over goal`;

  function handleEdit(entry: FoodEntry) {
    router.push({ pathname: '/add', params: { entryId: entry.id } });
  }

  function handleDelete(entry: FoodEntry) {
    Alert.alert('Delete food?', `Remove ${entry.name} from today?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteFood(entry.id);
        },
      },
    ]);
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Today</Text>
        <Text style={styles.title}>{totalCalories} calories</Text>
        <Text style={styles.subtitle}>
          {totalCalories} / {dailyGoal} cal = {progressPercent}%
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              remainingCalories < 0 && styles.progressFillOver,
              { width: `${progressBarPercent}%` },
            ]}
          />
        </View>
        <Text style={[styles.status, remainingCalories < 0 && styles.statusOver]}>
          {calorieStatus}
        </Text>
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
        entries.map((entry) => (
          <FoodRow key={entry.id} entry={entry} onDelete={handleDelete} onEdit={handleEdit} />
        ))
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
  progressTrack: {
    height: 12,
    marginTop: 18,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  progressFill: {
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  progressFillOver: {
    backgroundColor: '#B95C3A',
  },
  status: {
    marginTop: 10,
    color: '#2E7D57',
    fontSize: 15,
    fontWeight: '800',
  },
  statusOver: {
    color: '#B95C3A',
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
