import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { EmptyState } from '@/src/components/EmptyState';
import { FoodRow } from '@/src/components/FoodRow';
import { Screen } from '@/src/components/Screen';
import { StatCard } from '@/src/components/StatCard';
import { useCalories } from '@/src/context/CalorieContext';
import { useTokens } from '@/src/context/TokenContext';
import { getDateKey } from '@/src/date';
import { FoodEntry } from '@/src/types';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function HomeScreen() {
  const { dailyGoal, deleteFood, getEntriesForDate, getTotalForDate, isLoading } = useCalories();
  const { tokenBalance } = useTokens();
  const today = getDateKey();
  const entries = getEntriesForDate(today);
  const totalCalories = getTotalForDate(today);
  const remainingCalories = dailyGoal - totalCalories;
  const progressPercent = dailyGoal > 0 ? Math.round((totalCalories / dailyGoal) * 100) : 0;
  const calorieStatus =
    remainingCalories >= 0
      ? `${remainingCalories} calories remaining`
      : `${Math.abs(remainingCalories)} calories over goal`;

  function handleEdit(entry: FoodEntry) {
    router.push({ pathname: '/add', params: { entryId: entry.id } });
  }

  function handleDelete(entry: FoodEntry) {
    deleteFood(entry.id);
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <Text style={styles.eyebrow}>Today</Text>
          <View style={styles.tokenBar}>
            <Text style={styles.tokenText}>{tokenBalance} tokens</Text>
            <Pressable
              accessibilityLabel="Get more tokens"
              accessibilityRole="button"
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [styles.tokenButton, pressed && styles.tokenButtonPressed]}>
              <Text style={styles.tokenButtonText}>+</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.title}>{totalCalories} calories</Text>
        <Text style={styles.subtitle}>
          {totalCalories} / {dailyGoal} cal = {progressPercent}%
        </Text>
        <View style={styles.ringSection}>
          <CalorieRing
            dailyGoal={dailyGoal}
            isOverGoal={remainingCalories < 0}
            totalCalories={totalCalories}
          />
          <View style={styles.goalDetails}>
            <Text style={styles.goalLabel}>Daily goal</Text>
            <Text style={styles.goalValue}>{dailyGoal} cal</Text>
            {remainingCalories < 0 ? <Text style={styles.overGoalText}>Over goal</Text> : null}
          </View>
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

function CalorieRing({
  dailyGoal,
  isOverGoal,
  totalCalories,
}: {
  dailyGoal: number;
  isOverGoal: boolean;
  totalCalories: number;
}) {
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const size = 152;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = dailyGoal > 0 ? Math.min(totalCalories / dailyGoal, 1) : 0;
  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  useEffect(() => {
    Animated.timing(animatedProgress, {
      duration: 650,
      toValue: progress,
      useNativeDriver: false,
    }).start();
  }, [animatedProgress, progress]);

  return (
    <View style={styles.ringWrap}>
      <Svg height={size} width={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={isOverGoal ? '#B95C3A' : '#2563eb'}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringCalories}>{totalCalories}</Text>
        <Text style={styles.ringLabel}>calories</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tokenBar: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderColor: '#DADDD4',
    borderRadius: 18,
    backgroundColor: '#F7FAFF',
    paddingLeft: 12,
    paddingRight: 4,
  },
  tokenText: {
    color: '#1E1F24',
    fontSize: 13,
    fontWeight: '900',
  },
  tokenButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#2563eb',
  },
  tokenButtonPressed: {
    opacity: 0.82,
  },
  tokenButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
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
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
  ringSection: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  ringWrap: {
    width: 152,
    height: 152,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringCalories: {
    color: '#1E1F24',
    fontSize: 34,
    fontWeight: '900',
  },
  ringLabel: {
    color: '#6B6F76',
    fontSize: 13,
    fontWeight: '800',
  },
  goalDetails: {
    flex: 1,
    gap: 4,
  },
  goalLabel: {
    color: '#6B6F76',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  goalValue: {
    color: '#1E1F24',
    fontSize: 22,
    fontWeight: '900',
  },
  overGoalText: {
    color: '#B95C3A',
    fontSize: 14,
    fontWeight: '900',
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
