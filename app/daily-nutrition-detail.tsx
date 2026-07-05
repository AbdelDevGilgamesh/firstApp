import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useCalories } from '@/src/context/CalorieContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { getDateKey } from '@/src/date';
import { loadWaterLog } from '@/src/storage';
import { useAppTheme } from '@/src/theme/appTheme';
import { FoodEntry, WaterLogEntry } from '@/src/types';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const FIBER_GOAL = 30;
const WATER_GLASS_ML = 250;

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type MacroTotals = {
  protein: number;
  carbs: number;
  fat: number;
};

type MealSection = {
  id: string;
  title: string;
  entries: FoodEntry[];
  calories: number;
  macros: MacroTotals;
};

function parseDateKey(value?: string) {
  if (!value) {
    return getDateKey();
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : getDateKey();
}

function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateKey: string, days: number) {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + days);
  return getDateKey(date);
}

function formatDetailDate(dateKey: string) {
  const today = getDateKey();
  const date = dateFromKey(dateKey);
  const formatted = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(date);

  return dateKey === today ? `Today, ${formatted}` : formatted;
}

function sumMacros(entries: FoodEntry[]): MacroTotals {
  return entries.reduce(
    (totals, entry) => ({
      protein: totals.protein + Number(entry.protein ?? 0),
      carbs: totals.carbs + Number(entry.carbs ?? 0),
      fat: totals.fat + Number(entry.fat ?? 0),
    }),
    { protein: 0, carbs: 0, fat: 0 },
  );
}

function getEntryHour(entry: FoodEntry) {
  const date = new Date(entry.createdAt);
  return Number.isFinite(date.getTime()) ? date.getHours() : 12;
}

const DEFAULT_MEAL_LABEL_ORDER = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Snack',
  'Meal 1',
  'Meal 2',
  'Meal 3',
  'Meal 4',
  'Pre-workout',
  'Post-workout',
  'Shake',
  'Before bed',
];

function getTimeBasedMealLabel(entry: FoodEntry) {
  const hour = getEntryHour(entry);

  if (hour >= 5 && hour < 11) {
    return 'Breakfast';
  }

  if (hour >= 11 && hour < 16) {
    return 'Lunch';
  }

  if (hour >= 16 && hour < 22) {
    return 'Dinner';
  }

  return 'Snack';
}

function normalizeMealLabel(label?: string | null) {
  const normalized = label?.trim();

  if (!normalized) {
    return null;
  }

  return normalized === 'Snacks' ? 'Snack' : normalized;
}

function getMealName(entry: FoodEntry) {
  const legacyMealType =
    'meal_type' in entry && typeof entry.meal_type === 'string' ? entry.meal_type : undefined;

  return normalizeMealLabel(entry.mealLabel) ?? normalizeMealLabel(legacyMealType) ?? getTimeBasedMealLabel(entry);
}

function groupMeals(entries: FoodEntry[]): MealSection[] {
  const groups = entries.reduce<Record<string, FoodEntry[]>>((accumulator, entry) => {
    const name = getMealName(entry);
    accumulator[name] = [...(accumulator[name] ?? []), entry];
    return accumulator;
  }, {});
  const customLabels = Object.keys(groups)
    .filter((name) => !DEFAULT_MEAL_LABEL_ORDER.includes(name))
    .sort((firstName, secondName) => {
      const firstEntry = groups[firstName][0];
      const secondEntry = groups[secondName][0];

      return firstEntry.createdAt.localeCompare(secondEntry.createdAt);
    });
  const order = [...DEFAULT_MEAL_LABEL_ORDER, ...customLabels];

  return order
    .filter((name) => groups[name]?.length)
    .map((name) => {
      const mealEntries = groups[name];
      return {
        id: name,
        title: name,
        entries: mealEntries,
        calories: mealEntries.reduce((total, entry) => total + entry.calories, 0),
        macros: sumMacros(mealEntries),
      };
    });
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export default function DailyNutritionDetailScreen() {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ date?: string }>();
  const { dailyGoal, getEntriesForDate, macroGoals, waterGoalGlasses } = useCalories();
  const [selectedDate, setSelectedDate] = useState(() => parseDateKey(params.date));
  const [waterEntries, setWaterEntries] = useState<WaterLogEntry[]>([]);

  const entries = getEntriesForDate(selectedDate);
  const calories = entries.reduce((total, entry) => total + entry.calories, 0);
  const remaining = dailyGoal - calories;
  const macros = useMemo(() => sumMacros(entries), [entries]);
  const meals = useMemo(() => groupMeals(entries), [entries]);
  const waterGlasses = waterEntries.reduce((total, entry) => total + entry.amountMl, 0) / WATER_GLASS_ML;

  useEffect(() => {
    let isMounted = true;

    loadWaterLog(selectedDate).then((log) => {
      if (isMounted) {
        setWaterEntries(log.entries);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedDate]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: theme.card },
            pressed && styles.pressed,
          ]}>
          <Ionicons color={theme.text} name="chevron-back" size={20} />
        </Pressable>
        <View style={styles.dateSwitcher}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedDate((date) => addDays(date, -1))}
            style={({ pressed }) => [styles.dateButton, pressed && styles.pressed]}>
            <Ionicons color={theme.mutedText} name="chevron-back" size={18} />
          </Pressable>
          <Text style={[styles.dateTitle, { color: theme.text }]}>{formatDetailDate(selectedDate)}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedDate((date) => addDays(date, 1))}
            style={({ pressed }) => [styles.dateButton, pressed && styles.pressed]}>
            <Ionicons color={theme.mutedText} name="chevron-forward" size={18} />
          </Pressable>
        </View>
        <View style={styles.iconButtonSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <DailyNutritionHero calories={calories} dailyGoal={dailyGoal} remaining={remaining} />

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('dailyDetail.macroBreakdown')}</Text>
          <MacroProgressCard
            color="#3B82F6"
            helper="Helps recovery and muscle maintenance."
            label={t('dailyDetail.protein')}
            value={macros.protein}
            goal={macroGoals.protein}
          />
          <MacroProgressCard
            color="#C77C2B"
            helper="Main energy source for daily activity."
            label={t('dailyDetail.carbs')}
            value={macros.carbs}
            goal={macroGoals.carbs}
          />
          <MacroProgressCard
            color="#B08921"
            helper="Supports hormones and nutrient absorption."
            label={t('dailyDetail.fat')}
            value={macros.fat}
            goal={macroGoals.fat}
          />
        </View>

        <View style={styles.metricsGrid}>
          <SecondaryMetricTile label={t('dailyDetail.fiber')} value={t('dailyDetail.notTracked')} goal={`${FIBER_GOAL}g goal`} tone="#5B8C72" />
          <SecondaryMetricTile label={t('dailyDetail.sugar')} value={t('dailyDetail.notTracked')} goal={t('dailyDetail.optional')} tone="#C08457" />
          <SecondaryMetricTile label={t('dailyDetail.sodium')} value={t('dailyDetail.notTracked')} goal={t('dailyDetail.optional')} tone="#8A7CC8" />
          <SecondaryMetricTile
            label={t('dailyDetail.water')}
            value={`${round(waterGlasses)} / ${waterGoalGlasses}`}
            goal={t('dailyDetail.glasses')}
            tone="#3B82F6"
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('dailyDetail.mealsToday')}</Text>
          {meals.length > 0 ? (
            meals.map((meal) => <MealTimelineSection key={meal.id} meal={meal} />)
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('dailyDetail.noFoodsLogged')}</Text>
              <Text style={[styles.emptyText, { color: theme.mutedText }]}>
                {t('dailyDetail.addFoodTimeline')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DailyNutritionHero({
  calories,
  dailyGoal,
  remaining,
}: {
  calories: number;
  dailyGoal: number;
  remaining: number;
}) {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const progress = dailyGoal > 0 ? Math.min(calories / dailyGoal, 1) : 0;
  const size = 216;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  useEffect(() => {
    animatedProgress.setValue(0);
    Animated.timing(animatedProgress, {
      duration: 850,
      toValue: progress,
      useNativeDriver: false,
    }).start();
  }, [animatedProgress, progress]);

  return (
    <View
      style={[
        styles.heroCard,
        { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: theme.shadow },
      ]}>
      <View style={styles.heroRingWrap}>
        <Svg height={size} width={size}>
          <Defs>
            <LinearGradient id="calorieGradient" x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor="#34D399" />
              <Stop offset="0.55" stopColor="#2F7D5C" />
              <Stop offset="1" stopColor="#D6A84F" />
            </LinearGradient>
          </Defs>
          <Circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke={theme.isDark ? '#23304A' : '#E7ECE6'}
            strokeWidth={strokeWidth}
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke="url(#calorieGradient)"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.heroCenter}>
          <Text style={[styles.heroCalories, { color: theme.text }]}>{calories}</Text>
          <Text style={[styles.heroGoal, { color: theme.mutedText }]}>/ {dailyGoal} cal</Text>
        </View>
      </View>
      <Text style={[styles.remainingText, { color: remaining >= 0 ? theme.success : theme.warning }]}>
        {remaining >= 0
          ? t('today.caloriesRemaining', { count: remaining })
          : t('today.caloriesOver', { count: Math.abs(remaining) })}
      </Text>
    </View>
  );
}

function MacroProgressCard({
  color,
  goal,
  helper,
  label,
  value,
}: {
  color: string;
  goal: number;
  helper: string;
  label: string;
  value: number;
}) {
  const theme = useAppTheme();
  const progress = goal > 0 ? Math.min(value / goal, 1) : 0;
  const animated = useRef(new Animated.Value(0)).current;
  const width = animated.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  useEffect(() => {
    Animated.timing(animated, {
      duration: 520,
      toValue: progress,
      useNativeDriver: false,
    }).start();
  }, [animated, progress]);

  return (
    <View style={[styles.macroCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <View style={styles.macroHeader}>
        <View style={[styles.macroIcon, { backgroundColor: `${color}1F` }]}>
          <Ionicons color={color} name="analytics-outline" size={17} />
        </View>
        <View style={styles.macroTitleGroup}>
          <Text style={[styles.macroTitle, { color: theme.text }]}>{label}</Text>
          <Text style={[styles.macroHelper, { color: theme.mutedText }]}>{helper}</Text>
        </View>
        <View style={styles.macroNumbers}>
          <Text style={[styles.macroValue, { color: theme.text }]}>
            {round(value)} / {goal}g
          </Text>
          <Text style={[styles.macroPercent, { color }]}>{Math.round(progress * 100)}%</Text>
        </View>
      </View>
      <View style={[styles.macroTrack, { backgroundColor: theme.isDark ? '#253047' : '#EEF1ED' }]}>
        <Animated.View style={[styles.macroFill, { backgroundColor: color, width }]} />
      </View>
    </View>
  );
}

function SecondaryMetricTile({
  goal,
  label,
  tone,
  value,
}: {
  goal: string;
  label: string;
  tone: string;
  value: string;
}) {
  const theme = useAppTheme();

  return (
    <View style={[styles.metricTile, { backgroundColor: theme.isDark ? theme.card : `${tone}12` }]}>
      <Text style={[styles.metricLabel, { color: theme.mutedText }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.metricGoal, { color: tone }]}>{goal}</Text>
    </View>
  );
}

function MealTimelineSection({ meal }: { meal: MealSection }) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(true);

  function toggleExpanded() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((value) => !value);
  }

  return (
    <View style={[styles.mealCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Pressable accessibilityRole="button" onPress={toggleExpanded} style={styles.mealHeader}>
        <View style={styles.mealTitleGroup}>
          <Text style={[styles.mealTitle, { color: theme.text }]}>{meal.title}</Text>
          <Text style={[styles.mealSubtitle, { color: theme.mutedText }]}>
            {meal.entries.length} item{meal.entries.length === 1 ? '' : 's'} · P {round(meal.macros.protein)}g / C{' '}
            {round(meal.macros.carbs)}g / F {round(meal.macros.fat)}g
          </Text>
        </View>
        <View style={styles.mealRight}>
          <Text style={[styles.mealCalories, { color: theme.success }]}>{meal.calories} cal</Text>
          <Ionicons color={theme.mutedText} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.foodList}>
          {meal.entries.map((entry) => (
            <View key={entry.id} style={[styles.foodRow, { borderTopColor: theme.cardBorder }]}>
              <View style={styles.foodTextGroup}>
                <Text style={[styles.foodName, { color: theme.text }]}>{entry.name}</Text>
                <Text style={[styles.foodMeta, { color: theme.mutedText }]}>
                  {entry.quantity ?? `${entry.quantityValue ?? 1}${entry.unit ? ` ${entry.unit}` : ''}`}
                </Text>
              </View>
              <View style={styles.foodRight}>
                <Text style={[styles.foodCalories, { color: theme.text }]}>{entry.calories} cal</Text>
                <Text style={[styles.foodMacros, { color: theme.mutedText }]}>
                  P {round(Number(entry.protein ?? 0))} / C {round(Number(entry.carbs ?? 0))} / F{' '}
                  {round(Number(entry.fat ?? 0))}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  iconButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  iconButtonSpacer: {
    width: 38,
  },
  dateSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateTitle: {
    minWidth: 112,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 140,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  heroCard: {
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 26,
    padding: 20,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
    elevation: 4,
  },
  heroRingWrap: {
    width: 216,
    height: 216,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  heroCalories: {
    fontSize: 42,
    fontWeight: '900',
  },
  heroGoal: {
    fontSize: 15,
    fontWeight: '800',
  },
  remainingText: {
    fontSize: 15,
    fontWeight: '900',
  },
  macroCard: {
    gap: 12,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
  },
  macroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  macroIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  macroTitleGroup: {
    flex: 1,
    gap: 2,
  },
  macroTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  macroHelper: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  macroNumbers: {
    alignItems: 'flex-end',
    gap: 2,
  },
  macroValue: {
    fontSize: 12,
    fontWeight: '900',
  },
  macroPercent: {
    fontSize: 12,
    fontWeight: '900',
  },
  macroTrack: {
    height: 9,
    overflow: 'hidden',
    borderRadius: 999,
  },
  macroFill: {
    height: '100%',
    borderRadius: 999,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricTile: {
    width: '47.8%',
    gap: 5,
    borderRadius: 18,
    padding: 13,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '900',
  },
  metricGoal: {
    fontSize: 11,
    fontWeight: '900',
  },
  mealCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 20,
  },
  mealHeader: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  mealTitleGroup: {
    flex: 1,
    gap: 4,
  },
  mealTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  mealSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  mealRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  mealCalories: {
    fontSize: 14,
    fontWeight: '900',
  },
  foodList: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  foodRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    paddingVertical: 10,
  },
  foodTextGroup: {
    flex: 1,
    gap: 3,
  },
  foodName: {
    fontSize: 14,
    fontWeight: '900',
  },
  foodMeta: {
    fontSize: 12,
    fontWeight: '700',
  },
  foodRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  foodCalories: {
    fontSize: 13,
    fontWeight: '900',
  },
  foodMacros: {
    fontSize: 11,
    fontWeight: '800',
  },
  emptyCard: {
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.78,
  },
});
