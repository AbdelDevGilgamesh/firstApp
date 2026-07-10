import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import { FoodActionSheet } from "@/src/components/FoodActionSheet";
import { FoodRow } from "@/src/components/FoodRow";
import { useCalories } from "@/src/context/CalorieContext";
import { useLanguage } from "@/src/context/LanguageContext";
import { useTokens } from "@/src/context/TokenContext";
import { getDateKey } from "@/src/date";
import { LoggingStreak } from "@/src/services/streakService";
import { loadWaterLog, saveWaterLog } from "@/src/storage";
import { useAppTheme } from "@/src/theme/appTheme";
import { FoodEntry, WaterLogEntry } from "@/src/types";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const STREAK_BANNER_DISMISSED_DATE_KEY = "streakBanner.dismissedDate";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type MacroTotals = {
  protein: number;
  carbs: number;
  fat: number;
};

type WaterStats = {
  glasses: number;
  goalMl: number;
  progress: number;
  progressPercent: number;
  totalMl: number;
};

export default function HomeScreen() {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const {
    addFood,
    dailyGoal,
    deleteFood,
    getEntriesForDate,
    getTotalForDate,
    isLoading,
    loggingStreak,
    macroGoals,
    waterGoalGlasses,
    waterIntakeUnlocked,
  } = useCalories();
  const { tokenBalance } = useTokens();
  const today = getDateKey();
  const entries = getEntriesForDate(today);
  const totalCalories = getTotalForDate(today);
  const remainingCalories = dailyGoal - totalCalories;
  const macros = useMemo(() => getMacroTotals(entries), [entries]);
  const tip = getNutritionTip(totalCalories, dailyGoal, macros);
  const [pageIndex, setPageIndex] = useState(0);
  const [actionEntry, setActionEntry] = useState<FoodEntry | null>(null);
  const [deletedEntry, setDeletedEntry] = useState<FoodEntry | null>(null);
  const [showUndoSnackbar, setShowUndoSnackbar] = useState(false);
  const [streakBannerVisible, setStreakBannerVisible] = useState(false);
  const [waterEntries, setWaterEntries] = useState<WaterLogEntry[]>([]);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waterStats = useMemo(
    () => getWaterStats(waterEntries, waterGoalGlasses),
    [waterEntries, waterGoalGlasses],
  );

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(STREAK_BANNER_DISMISSED_DATE_KEY)
      .then((dismissedDate) => {
        if (isMounted) {
          setStreakBannerVisible(dismissedDate !== today);
        }
      })
      .catch((error) => {
        console.warn("Failed to load streak banner dismissal state.", error);

        if (isMounted) {
          setStreakBannerVisible(true);
        }
      });

    loadWaterLog(today).then((log) => {
      if (isMounted) {
        setWaterEntries(log.entries);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [today]);

  async function dismissStreakBanner() {
    setStreakBannerVisible(false);

    try {
      await AsyncStorage.setItem(STREAK_BANNER_DISMISSED_DATE_KEY, today);
    } catch (error) {
      console.warn("Failed to save streak banner dismissal state.", error);
    }
  }

  useEffect(
    () => () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    },
    [],
  );

  function handleEdit(entry: FoodEntry) {
    router.push({ pathname: "/add", params: { entryId: entry.id } });
  }

  function handleDelete(entry: FoodEntry) {
    deleteFood(entry.id);
  }

  function configureFoodLayoutAnimation() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }

  function entryToFoodInput(entry: FoodEntry) {
    return {
      name: entry.name,
      foodKey: entry.foodKey,
      source: entry.source,
      calories: entry.calories,
      quantity: entry.quantity,
      quantityValue: entry.quantityValue,
      unit: entry.unit,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      baseQuantity: entry.baseQuantity,
      baseCalories: entry.baseCalories,
      baseProtein: entry.baseProtein,
      baseCarbs: entry.baseCarbs,
      baseFat: entry.baseFat,
      mealLabel: entry.mealLabel,
    };
  }

  async function handleActionDelete(entry: FoodEntry) {
    setActionEntry(null);
    configureFoodLayoutAnimation();
    await deleteFood(entry.id);
    setDeletedEntry(entry);
    setShowUndoSnackbar(true);

    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }

    undoTimeoutRef.current = setTimeout(() => {
      setShowUndoSnackbar(false);
      setDeletedEntry(null);
    }, 4500);
  }

  async function handleUndoDelete() {
    if (!deletedEntry) {
      return;
    }

    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }

    configureFoodLayoutAnimation();
    await addFood(entryToFoodInput(deletedEntry));
    setDeletedEntry(null);
    setShowUndoSnackbar(false);
  }

  async function handleDuplicate(entry: FoodEntry) {
    setActionEntry(null);
    configureFoodLayoutAnimation();
    await addFood(entryToFoodInput(entry));
  }

  async function persistWaterEntries(nextEntries: WaterLogEntry[]) {
    setWaterEntries(nextEntries);
    await saveWaterLog({ date: today, entries: nextEntries });
  }

  async function addWater(amountMl: number) {
    const now = new Date();
    const nextEntry: WaterLogEntry = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      amountMl,
      createdAt: now.toISOString(),
    };

    await persistWaterEntries([nextEntry, ...waterEntries]);
  }

  async function undoLastWater() {
    if (waterEntries.length === 0) {
      return;
    }

    await persistWaterEntries(waterEntries.slice(1));
  }

  function openWaterPage() {
    pagerRef.current?.scrollTo({ animated: true, x: width, y: 0 });
    setPageIndex(1);
  }

  function handlePagerScrollEnd(
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) {
    setPageIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  return (
    <SafeAreaView
      style={[darkStyles.safeArea, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <View style={darkStyles.header}>
        <Text style={[darkStyles.headerLabel, { color: theme.text }]}>
          {t("today.title")}
        </Text>
        <View style={darkStyles.headerRight}>
          {!isLoading && !streakBannerVisible ? (
            <CompactStreakPill
              onPress={() => setStreakBannerVisible(true)}
              streak={loggingStreak}
            />
          ) : null}
          <TokenPill isDark={theme.isDark} tokenBalance={tokenBalance} />
        </View>
      </View>
      {isLoading ? (
        <View style={darkStyles.headerStatsRow}>
          <StreakBannerSkeleton />
        </View>
      ) : streakBannerVisible ? (
        <View style={darkStyles.headerStatsRow}>
          <LoggingStreakBanner onDismiss={dismissStreakBanner} streak={loggingStreak} />
        </View>
      ) : null}

      <ScrollView
        horizontal
        pagingEnabled
        ref={pagerRef}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handlePagerScrollEnd}
        style={darkStyles.pager}
      >
        <ScrollView
          contentContainerStyle={[darkStyles.content, { width }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/daily-nutrition-detail", params: { date: today } })}
            style={({ pressed }) => [
              darkStyles.mainCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                shadowColor: theme.shadow,
              },
              pressed && darkStyles.quickPressed,
            ]}
          >
            <View style={darkStyles.calorieHeader}>
              <View style={darkStyles.calorieNumberRow}>
                <Text style={[darkStyles.bigCalories, { color: theme.text }]}>
                  {totalCalories}
                </Text>
                <Text
                  style={[darkStyles.goalSlash, { color: theme.mutedText }]}
                >
                  / {dailyGoal}
                </Text>
              </View>
              <Text
                style={[
                  darkStyles.remainingText,
                  {
                    color:
                      remainingCalories < 0 ? theme.warning : theme.success,
                  },
                ]}
              >
                {remainingCalories >= 0
                  ? t("today.caloriesRemaining", { count: remainingCalories })
                  : t("today.caloriesOver", { count: Math.abs(remainingCalories) })}
              </Text>
            </View>

            <View style={darkStyles.ringAndMacros}>
              <CalorieRing
                dailyGoal={dailyGoal}
                isDark={theme.isDark}
                isOverGoal={remainingCalories < 0}
                size={128}
                totalCalories={totalCalories}
              />
              <View style={darkStyles.macroPanel}>
                <MacroProgressBar
                  color="#60A5FA"
                  goal={macroGoals.protein}
                  label="Protein"
                  value={macros.protein}
                />
                <MacroProgressBar
                  color="#34D399"
                  goal={macroGoals.carbs}
                  label="Carbs"
                  value={macros.carbs}
                />
                <MacroProgressBar
                  color="#FBBF24"
                  goal={macroGoals.fat}
                  label="Fat"
                  value={macros.fat}
                />
              </View>
            </View>
          </Pressable>

          <View style={darkStyles.summaryGrid}>
            <DarkSummaryCard label={t("today.eaten")} value={`${totalCalories}`} />
            <DarkSummaryCard
              label={remainingCalories >= 0 ? t("today.remaining") : t("today.overGoal")}
              tone={remainingCalories >= 0 ? "good" : "warning"}
              value={`${Math.abs(remainingCalories)}`}
            />
            <DarkSummaryCard label={t("today.netCalories")} value={`${totalCalories}`} />
          </View>

          <View
            style={[
              darkStyles.tipCard,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={[darkStyles.cardLabel, { color: theme.primary }]}>
              {t("today.insight")}
            </Text>
            <Text style={[darkStyles.tipText, { color: theme.text }]}>
              {tip}
            </Text>
          </View>

          <WaterPreview
            isUnlocked={waterIntakeUnlocked}
            onOpen={openWaterPage}
            stats={waterStats}
          />

          <View
            style={[
              darkStyles.quickCard,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={[darkStyles.cardTitle, { color: theme.text }]}>
              {t("today.quickAdd")}
            </Text>
            <View style={darkStyles.quickGrid}>
              <QuickAction
                label={t("today.scanFood")}
                onPress={() =>
                  router.push({ pathname: "/add", params: { mode: "scan" } })
                }
              />
              <QuickAction
                label={t("today.recent")}
                onPress={() =>
                  router.push({ pathname: "/add", params: { mode: "find" } })
                }
              />
              <QuickAction
                label={t("today.favorites")}
                onPress={() =>
                  router.push({ pathname: "/add", params: { mode: "find" } })
                }
              />
              <QuickAction
                label={t("today.prepareMeal")}
                onPress={() =>
                  router.push({ pathname: "/add", params: { mode: "meal" } })
                }
              />
            </View>
          </View>

          <View style={darkStyles.foodsHeader}>
            <Text style={[darkStyles.cardTitle, { color: theme.text }]}>
              Foods today
            </Text>
            <Text
              style={[
                darkStyles.foodCount,
                { backgroundColor: theme.chipBackground, color: theme.primary },
              ]}
            >
              {entries.length}
            </Text>
          </View>

          {isLoading ? (
            <DarkEmptyState
              title={t("today.loadingFoods")}
              message={t("today.savedEntriesAppear")}
            />
          ) : entries.length === 0 ? (
            <DarkEmptyState
              title={t("today.noFoodsYet")}
              message={t("today.addFirstFood")}
            />
          ) : (
            entries.map((entry) => (
              <FoodRow
                deleteMode="actions"
                key={entry.id}
                entry={entry}
                onEdit={handleEdit}
                onOpenActions={setActionEntry}
                variant={theme.isDark ? "dark" : "light"}
              />
            ))
          )}
        </ScrollView>

        <ScrollView
          contentContainerStyle={[darkStyles.content, { width }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <WaterTracker
            entries={waterEntries}
            goal={waterGoalGlasses}
            isUnlocked={waterIntakeUnlocked}
            onAddWater={addWater}
            onUndoLastWater={undoLastWater}
            stats={waterStats}
          />
        </ScrollView>
      </ScrollView>

      <View style={darkStyles.pageDots}>
        <View
          style={[
            darkStyles.pageDot,
            {
              backgroundColor:
                pageIndex === 0 ? theme.primary : theme.chipBackground,
            },
          ]}
        />
        <View
          style={[
            darkStyles.pageDot,
            {
              backgroundColor:
                pageIndex === 1 ? theme.primary : theme.chipBackground,
            },
          ]}
        />
      </View>

      <FoodActionSheet
        entry={actionEntry}
        onCancel={() => setActionEntry(null)}
        onDelete={handleActionDelete}
        onDuplicate={handleDuplicate}
        onEdit={(entry) => {
          setActionEntry(null);
          handleEdit(entry);
        }}
        visible={Boolean(actionEntry)}
      />

      {showUndoSnackbar ? (
        <View
          style={[
            darkStyles.undoSnackbar,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
        >
          <Text style={[darkStyles.undoSnackbarText, { color: theme.text }]}>
            Food deleted
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleUndoDelete}
            style={({ pressed }) => [darkStyles.undoSnackbarButton, pressed && darkStyles.quickPressed]}
          >
            <Text style={[darkStyles.undoSnackbarButtonText, { color: theme.primary }]}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function LoggingStreakBanner({
  onDismiss,
  streak,
}: {
  onDismiss: () => void;
  streak: LoggingStreak;
}) {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const pulse = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const previousKey = useRef(`${streak.currentStreak}-${streak.isActiveToday}-${streak.lastLoggedDate ?? ""}`);
  const dayLabel = t(streak.currentStreak === 1 ? "today.day" : "today.days");
  const bestDayLabel = t(streak.longestStreak === 1 ? "today.day" : "today.days");
  const statusTitle =
    streak.currentStreak > 0
      ? t("today.streak", { count: streak.currentStreak, unit: dayLabel })
      : t("today.startStreak");
  const subtitle = t("today.best", { count: streak.longestStreak, unit: bestDayLabel });
  const badgeText = streak.isActiveToday ? t("today.active") : streak.currentStreak > 0 ? t("today.atRisk") : t("today.start");
  const badgeColor = streak.isActiveToday ? theme.success : streak.isAtRiskToday ? theme.warning : theme.mutedText;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_event, gesture) => {
        translateX.setValue(gesture.dx);
        opacity.setValue(Math.max(0.35, 1 - Math.abs(gesture.dx) / 180));
      },
      onPanResponderRelease: (_event, gesture) => {
        const shouldDismiss = Math.abs(gesture.dx) > 90 || Math.abs(gesture.vx) > 0.8;

        if (shouldDismiss) {
          Animated.parallel([
            Animated.timing(translateX, {
              duration: 180,
              toValue: gesture.dx >= 0 ? 420 : -420,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              duration: 180,
              toValue: 0,
              useNativeDriver: true,
            }),
          ]).start(onDismiss);
          return;
        }

        Animated.parallel([
          Animated.spring(translateX, {
            friction: 7,
            tension: 120,
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.spring(opacity, {
            friction: 7,
            tension: 120,
            toValue: 1,
            useNativeDriver: true,
          }),
        ]).start();
      },
    }),
  ).current;

  useEffect(() => {
    const nextKey = `${streak.currentStreak}-${streak.isActiveToday}-${streak.lastLoggedDate ?? ""}`;

    if (previousKey.current === nextKey) {
      return;
    }

    previousKey.current = nextKey;
    Animated.sequence([
      Animated.spring(pulse, {
        friction: 5,
        tension: 160,
        toValue: 1.06,
        useNativeDriver: true,
      }),
      Animated.spring(pulse, {
        friction: 7,
        tension: 140,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [pulse, streak.currentStreak, streak.isActiveToday, streak.lastLoggedDate]);

  function dismissWithAnimation() {
    Animated.parallel([
      Animated.timing(translateX, {
        duration: 180,
        toValue: 420,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        duration: 180,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start(onDismiss);
  }

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        darkStyles.streakCard,
        {
          backgroundColor: theme.card,
          borderColor: streak.isActiveToday
            ? theme.success
            : streak.isAtRiskToday
              ? theme.warning
              : theme.cardBorder,
          shadowColor: theme.shadow,
          opacity,
          transform: [{ translateX }, { scale: pulse }],
        },
      ]}
    >
      <View
        style={[
          darkStyles.streakIcon,
          { backgroundColor: theme.isDark ? "#2D1B12" : "#FFF0DA" },
        ]}
      >
        <Text style={darkStyles.streakIconText}>🔥</Text>
      </View>
      <View style={darkStyles.streakContent}>
        <Text style={[darkStyles.streakTitle, { color: theme.text }]}>
          {statusTitle}
        </Text>
        <Text style={[darkStyles.streakSubtitle, { color: theme.mutedText }]}>
          {subtitle}
        </Text>
      </View>
      <View style={darkStyles.streakActionRow}>
        <View
          style={[
            darkStyles.streakBadge,
            {
              backgroundColor: theme.isDark ? `${badgeColor}24` : `${badgeColor}18`,
              borderColor: `${badgeColor}55`,
            },
          ]}
        >
          <Text style={[darkStyles.streakBadgeText, { color: badgeColor }]}>
            {badgeText}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Dismiss streak banner"
          accessibilityRole="button"
          hitSlop={8}
          onPress={dismissWithAnimation}
          style={({ pressed }) => [
            darkStyles.streakDismissButton,
            { backgroundColor: theme.chipBackground },
            pressed && darkStyles.quickPressed,
          ]}
        >
          <Text style={[darkStyles.streakDismissText, { color: theme.mutedText }]}>×</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function StreakBannerSkeleton() {
  const theme = useAppTheme();
  const shimmer = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          duration: 850,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          duration: 850,
          toValue: 0.55,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [shimmer]);

  return (
    <Animated.View
      style={[
        darkStyles.streakSkeletonCard,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          opacity: shimmer,
          shadowColor: theme.shadow,
        },
      ]}
    >
      <View style={[darkStyles.streakSkeletonIcon, { backgroundColor: theme.chipBackground }]} />
      <View style={darkStyles.streakSkeletonTextGroup}>
        <View style={[darkStyles.streakSkeletonLine, { backgroundColor: theme.chipBackground, width: "62%" }]} />
        <View style={[darkStyles.streakSkeletonLineSmall, { backgroundColor: theme.chipBackground, width: "42%" }]} />
      </View>
      <View style={darkStyles.streakSkeletonActions}>
        <View style={[darkStyles.streakSkeletonPill, { backgroundColor: theme.chipBackground }]} />
        <View style={[darkStyles.streakSkeletonClose, { backgroundColor: theme.chipBackground }]} />
      </View>
    </Animated.View>
  );
}

function CompactStreakPill({
  onPress,
  streak,
}: {
  onPress: () => void;
  streak: LoggingStreak;
}) {
  const theme = useAppTheme();
  const shouldHide = streak.currentStreak === 0 && !streak.isAtRiskToday && !streak.isActiveToday;
  const color = streak.isActiveToday ? theme.success : streak.isAtRiskToday ? theme.warning : theme.mutedText;

  if (shouldHide) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel="Show streak details"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        darkStyles.compactStreakPill,
        {
          backgroundColor: theme.chipBackground,
          borderColor: streak.isActiveToday || streak.isAtRiskToday ? color : theme.cardBorder,
        },
        pressed && darkStyles.quickPressed,
      ]}
    >
      <Text style={darkStyles.compactStreakIcon}>🔥</Text>
      <Text style={[darkStyles.compactStreakText, { color }]}>
        {streak.currentStreak}
      </Text>
    </Pressable>
  );
}

function TokenPill({
  isDark = false,
  tokenBalance,
}: {
  isDark?: boolean;
  tokenBalance: number;
}) {
  const { t } = useLanguage();
  const pulse = useRef(new Animated.Value(1)).current;
  const previousBalance = useRef(tokenBalance);

  useEffect(() => {
    if (previousBalance.current === tokenBalance) {
      return;
    }

    previousBalance.current = tokenBalance;
    Animated.sequence([
      Animated.spring(pulse, {
        friction: 5,
        tension: 180,
        toValue: 1.08,
        useNativeDriver: true,
      }),
      Animated.spring(pulse, {
        friction: 6,
        tension: 160,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [pulse, tokenBalance]);

  return (
    <Pressable
      accessibilityLabel={`Buy tokens. Current balance ${tokenBalance} tokens.`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/settings", params: { panel: "tokens" } })}
      style={({ pressed }) => [pressed && styles.tokenPillPressed]}
    >
      <Animated.View style={[styles.tokenBar, isDark && darkStyles.tokenBar, { transform: [{ scale: pulse }] }]}>
      <Text style={[styles.tokenText, isDark && darkStyles.tokenText]}>
        {t("today.tokens", { count: tokenBalance })}
      </Text>
      <View style={styles.tokenButton}>
        <Text style={styles.tokenButtonText}>+</Text>
      </View>
      </Animated.View>
    </Pressable>
  );
}

function CalorieRing({
  dailyGoal,
  isDark,
  isOverGoal,
  size = 152,
  totalCalories,
}: {
  dailyGoal: number;
  isDark: boolean;
  isOverGoal: boolean;
  size?: number;
  totalCalories: number;
}) {
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const strokeWidth = isDark ? 13 : 14;
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
    <View style={[styles.ringWrap, { height: size, width: size }]}>
      <Svg height={size} width={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={isDark ? "#23304A" : "#E5E7EB"}
          strokeWidth={strokeWidth}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={isOverGoal ? "#F97316" : isDark ? "#38BDF8" : "#2563eb"}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.ringCalories, isDark && darkStyles.ringCalories]}>
          {totalCalories}
        </Text>
        <Text style={[styles.ringLabel, isDark && darkStyles.ringLabel]}>
          calories
        </Text>
      </View>
    </View>
  );
}

function MacroProgressBar({
  color,
  goal,
  label,
  value,
}: {
  color: string;
  goal: number;
  label: string;
  value: number;
}) {
  const theme = useAppTheme();
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const progress = goal > 0 ? Math.min(value / goal, 1) : 0;
  const progressWidth = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  useEffect(() => {
    Animated.timing(animatedProgress, {
      duration: 420,
      toValue: progress,
      useNativeDriver: false,
    }).start();
  }, [animatedProgress, progress]);

  return (
    <View style={darkStyles.macroRow}>
      <View style={darkStyles.macroHeader}>
        <Text style={[darkStyles.macroLabel, { color: theme.text }]}>
          {label}
        </Text>
        <Text style={[darkStyles.macroValue, { color: theme.mutedText }]}>
          {round(value)} / {goal}g
        </Text>
      </View>
      <View
        style={[
          darkStyles.macroTrack,
          { backgroundColor: theme.isDark ? "#243047" : "#E5E7EB" },
        ]}
      >
        <Animated.View
          style={[
            darkStyles.macroFill,
            { backgroundColor: color, width: progressWidth },
          ]}
        />
      </View>
    </View>
  );
}

function DarkSummaryCard({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "good" | "warning";
  value: string;
}) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        darkStyles.summaryCard,
        { backgroundColor: theme.card, borderColor: theme.cardBorder },
      ]}
    >
      <Text style={[darkStyles.summaryLabel, { color: theme.mutedText }]}>
        {label}
      </Text>
      <Text
        style={[
          darkStyles.summaryValue,
          { color: theme.text },
          tone === "good" && { color: theme.success },
          tone === "warning" && { color: theme.warning },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function WaterPreview({
  isUnlocked,
  onOpen,
  stats,
}: {
  isUnlocked: boolean;
  onOpen: () => void;
  stats: WaterStats;
}) {
  const theme = useAppTheme();
  const { t } = useLanguage();

  if (!isUnlocked) {
    return (
      <View
        style={[
          darkStyles.waterPreviewCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <View style={darkStyles.waterPreviewTextGroup}>
          <Text style={[darkStyles.cardTitle, { color: theme.text }]}>
            {t("today.waterIntake")}
          </Text>
          <Text style={[darkStyles.waterText, { color: theme.mutedText }]}>
            {t("today.unlockHydration")}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: "/settings", params: { panel: "goals" } })
          }
          style={({ pressed }) => [
            darkStyles.previewActionButton,
            { backgroundColor: theme.primary },
            pressed && darkStyles.quickPressed,
          ]}
        >
          <Text style={darkStyles.previewActionText}>{t("today.unlock")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [
        darkStyles.waterPreviewCard,
        { backgroundColor: theme.card, borderColor: theme.cardBorder },
        pressed && darkStyles.quickPressed,
      ]}
    >
      <View style={darkStyles.waterPreviewTextGroup}>
        <Text style={[darkStyles.cardTitle, { color: theme.text }]}>
          {t("today.waterIntake")}
        </Text>
        <Text style={[darkStyles.waterPreviewAmount, { color: theme.text }]}>
          {Math.round(stats.totalMl)} / {stats.goalMl} ml
        </Text>
        <Text style={[darkStyles.waterText, { color: theme.mutedText }]}>
          {round(stats.glasses)} of {Math.round(stats.goalMl / 250)} glasses
        </Text>
      </View>
      <View style={darkStyles.previewChevronGroup}>
        <Text style={[darkStyles.swipeHint, { color: theme.mutedText }]}>
          {t("today.swipeLeftToView")}
        </Text>
        <Text style={[darkStyles.previewChevron, { color: theme.primary }]}>
          ›
        </Text>
      </View>
    </Pressable>
  );
}

function WaterTracker({
  entries,
  goal,
  isUnlocked,
  onAddWater,
  onUndoLastWater,
  stats,
}: {
  entries: WaterLogEntry[];
  goal: number;
  isUnlocked: boolean;
  onAddWater: (amountMl: number) => void;
  onUndoLastWater: () => void;
  stats: WaterStats;
}) {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const [unit, setUnit] = useState<"ml" | "fl oz" | "glasses">("ml");
  const hydrationTip = getHydrationTip(stats.progress);

  if (!isUnlocked) {
    return (
      <View
        style={[
          darkStyles.waterCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <View style={darkStyles.cardHeaderRow}>
          <Text style={[darkStyles.cardTitle, { color: theme.text }]}>
            {t("today.waterIntake")}
          </Text>
          <Text style={[darkStyles.waterText, { color: theme.warning }]}>
            {t("today.locked")}
          </Text>
        </View>
        <Text style={[darkStyles.emptyMessage, { color: theme.mutedText }]}>
          {t("today.unlockWaterDescription")}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: "/settings", params: { panel: "goals" } })
          }
          style={({ pressed }) => [
            darkStyles.unlockButton,
            { backgroundColor: theme.primary },
            pressed && darkStyles.quickPressed,
          ]}
        >
          <Text style={darkStyles.unlockButtonText}>{t("today.unlock")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        darkStyles.waterCard,
        { backgroundColor: theme.card, borderColor: theme.cardBorder },
      ]}
    >
      <View style={darkStyles.cardHeaderRow}>
        <Text style={[darkStyles.cardTitle, { color: theme.text }]}>
          {t("today.waterIntake")}
        </Text>
        <Text style={[darkStyles.waterText, { color: theme.mutedText }]}>
          {t("today.goalGlasses", { count: goal })}
        </Text>
      </View>
      <View style={darkStyles.hydrationSummary}>
        <Text style={[darkStyles.waterAmount, { color: theme.text }]}>
          {formatWaterAmount(stats.totalMl, unit)}
        </Text>
        <Text style={[darkStyles.waterText, { color: theme.mutedText }]}>
          {round(stats.glasses)} of {goal} glasses - {stats.progressPercent}%
        </Text>
      </View>
      <View
        style={[
          darkStyles.hydrationTrack,
          { backgroundColor: theme.chipBackground },
        ]}
      >
        <View
          style={[
            darkStyles.hydrationFill,
            {
              backgroundColor: theme.primary,
              width: `${stats.progressPercent}%` as const,
            },
          ]}
        />
      </View>
      <View style={darkStyles.unitRow}>
        {(["ml", "fl oz", "glasses"] as const).map((nextUnit) => {
          const isSelected = unit === nextUnit;

          return (
            <Pressable
              accessibilityRole="button"
              key={nextUnit}
              onPress={() => setUnit(nextUnit)}
              style={({ pressed }) => [
                darkStyles.unitButton,
                {
                  backgroundColor: isSelected
                    ? theme.primary
                    : theme.chipBackground,
                },
                pressed && darkStyles.quickPressed,
              ]}
            >
              <Text
                style={[
                  darkStyles.unitButtonText,
                  { color: isSelected ? "#FFFFFF" : theme.text },
                ]}
              >
                {nextUnit}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={darkStyles.quickWaterRow}>
        <WaterQuickButton label="250 ml" onPress={() => onAddWater(250)} />
        <WaterQuickButton label="500 ml" onPress={() => onAddWater(500)} />
        <WaterQuickButton label="1 glass" onPress={() => onAddWater(250)} />
      </View>
      <View style={darkStyles.cardHeaderRow}>
        <Text style={[darkStyles.waterTip, { color: theme.mutedText }]}>
          {hydrationTip}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={entries.length === 0}
          onPress={onUndoLastWater}
          style={({ pressed }) => [
            darkStyles.undoButton,
            { backgroundColor: theme.chipBackground },
            entries.length === 0 && { opacity: 0.5 },
            pressed && entries.length > 0 ? darkStyles.quickPressed : null,
          ]}
        >
          <Text style={[darkStyles.undoButtonText, { color: theme.primary }]}>
            Undo
          </Text>
        </Pressable>
      </View>
      {entries.length > 0 ? (
        <View style={darkStyles.waterLogList}>
          {entries.slice(0, 8).map((entry) => (
            <View key={entry.id} style={darkStyles.waterLogRow}>
              <Text
                style={[darkStyles.waterLogTime, { color: theme.mutedText }]}
              >
                {formatWaterTime(entry.createdAt)}
              </Text>
              <Text style={[darkStyles.waterLogAmount, { color: theme.text }]}>
                {entry.amountMl} ml
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[darkStyles.emptyMessage, { color: theme.mutedText }]}>
          No water logged yet today.
        </Text>
      )}
    </View>
  );
}

function WaterQuickButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        darkStyles.waterQuickButton,
        { backgroundColor: theme.chipBackground },
        pressed && darkStyles.quickPressed,
      ]}
    >
      <Text style={[darkStyles.waterQuickButtonText, { color: theme.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatWaterAmount(totalMl: number, unit: "ml" | "fl oz" | "glasses") {
  if (unit === "fl oz") {
    return `${round(totalMl / 29.5735)} fl oz`;
  }

  if (unit === "glasses") {
    return `${round(totalMl / 250)} glasses`;
  }

  return `${Math.round(totalMl)} ml`;
}

function formatWaterTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getHydrationTip(progress: number) {
  if (progress >= 1) {
    return "Great hydration today.";
  }

  if (progress >= 0.75) {
    return "Almost there.";
  }

  if (progress >= 0.4) {
    return "You're on track.";
  }

  return "You're a bit behind. Drink a glass now.";
}

function QuickAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        darkStyles.quickButton,
        { backgroundColor: theme.chipBackground },
        pressed && darkStyles.quickPressed,
      ]}
    >
      <Text style={[darkStyles.quickButtonText, { color: theme.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DarkEmptyState({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        darkStyles.emptyCard,
        { backgroundColor: theme.card, borderColor: theme.cardBorder },
      ]}
    >
      <Text style={[darkStyles.emptyTitle, { color: theme.text }]}>
        {title}
      </Text>
      <Text style={[darkStyles.emptyMessage, { color: theme.mutedText }]}>
        {message}
      </Text>
    </View>
  );
}

function getMacroTotals(entries: FoodEntry[]): MacroTotals {
  return entries.reduce(
    (totals, entry) => ({
      protein: totals.protein + Number(entry.protein ?? 0),
      carbs: totals.carbs + Number(entry.carbs ?? 0),
      fat: totals.fat + Number(entry.fat ?? 0),
    }),
    { protein: 0, carbs: 0, fat: 0 },
  );
}

function getWaterStats(
  entries: WaterLogEntry[],
  goalGlasses: number,
): WaterStats {
  const totalMl = entries.reduce((total, entry) => total + entry.amountMl, 0);
  const goalMl = Math.max(goalGlasses, 1) * 250;
  const progress = goalMl > 0 ? Math.min(totalMl / goalMl, 1) : 0;

  return {
    glasses: totalMl / 250,
    goalMl,
    progress,
    progressPercent: Math.round(progress * 100),
    totalMl,
  };
}

function getNutritionTip(
  totalCalories: number,
  dailyGoal: number,
  macros: MacroTotals,
) {
  if (dailyGoal > 0 && totalCalories > dailyGoal) {
    return "You are over your calorie goal.";
  }

  if (macros.protein >= 120) {
    return "Great protein day!";
  }

  if (macros.protein < 120 * 0.35) {
    return "Add more protein today.";
  }

  if (macros.fat < 70 * 0.2) {
    return "Low fat intake today.";
  }

  if (macros.carbs < 250 * 0.25) {
    return "Add more carbs if you need energy.";
  }

  return "Your nutrition balance looks steady today.";
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

const cardShadow = {
  shadowColor: "#020617",
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.25,
  shadowRadius: 24,
  elevation: 4,
};

const darkStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0A1020",
  },
  content: {
    flexGrow: 1,
    gap: 12,
    padding: 16,
    paddingBottom: 140,
  },
  pager: {
    flex: 1,
  },
  header: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  headerStatsRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pageDots: {
    position: "absolute",
    right: 0,
    bottom: 92,
    left: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
    pointerEvents: "none",
  },
  pageDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  undoSnackbar: {
    position: "absolute",
    right: 18,
    bottom: 112,
    left: 18,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    shadowColor: "#020617",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  undoSnackbarText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
  },
  undoSnackbarButton: {
    minHeight: 38,
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  undoSnackbarButtonText: {
    fontSize: 14,
    fontWeight: "900",
  },
  headerLabel: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  tokenBar: {
    borderColor: "#26324A",
    backgroundColor: "#111827",
  },
  tokenText: {
    color: "#E5E7EB",
  },
  mainCard: {
    ...cardShadow,
    gap: 14,
    borderWidth: 1,
    borderColor: "#1F2A44",
    borderRadius: 16,
    backgroundColor: "#101827",
    padding: 15,
  },
  calorieHeader: {
    gap: 4,
  },
  calorieNumberRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  bigCalories: {
    color: "#F8FAFC",
    fontSize: 46,
    fontWeight: "900",
  },
  goalSlash: {
    marginBottom: 6,
    color: "#94A3B8",
    fontSize: 19,
    fontWeight: "900",
  },
  remainingText: {
    color: "#86EFAC",
    fontSize: 14,
    fontWeight: "800",
  },
  overText: {
    color: "#FDBA74",
  },
  ringAndMacros: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ringCalories: {
    color: "#F8FAFC",
    fontSize: 32,
  },
  ringLabel: {
    color: "#94A3B8",
  },
  macroPanel: {
    flex: 1,
    gap: 10,
  },
  macroRow: {
    gap: 6,
  },
  macroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  macroLabel: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "900",
  },
  macroValue: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
  },
  macroTrack: {
    height: 7,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#243047",
  },
  macroFill: {
    height: "100%",
    borderRadius: 8,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    gap: 4,
    borderWidth: 1,
    borderColor: "#1F2A44",
    borderRadius: 13,
    backgroundColor: "#111827",
    padding: 10,
  },
  summaryLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
  },
  summaryValue: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "900",
  },
  summaryGood: {
    color: "#86EFAC",
  },
  summaryWarning: {
    color: "#FDBA74",
  },
  streakCard: {
    ...cardShadow,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  streakIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  streakIconText: {
    fontSize: 17,
  },
  streakContent: {
    flex: 1,
    gap: 2,
  },
  streakActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  streakTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  streakSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  streakBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  streakBadgeText: {
    fontSize: 10,
    fontWeight: "900",
  },
  streakDismissButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  streakDismissText: {
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 22,
  },
  streakSkeletonCard: {
    ...cardShadow,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  streakSkeletonIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
  },
  streakSkeletonTextGroup: {
    flex: 1,
    gap: 7,
  },
  streakSkeletonLine: {
    height: 12,
    borderRadius: 999,
  },
  streakSkeletonLineSmall: {
    height: 9,
    borderRadius: 999,
  },
  streakSkeletonActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  streakSkeletonPill: {
    width: 58,
    height: 25,
    borderRadius: 999,
  },
  streakSkeletonClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  compactStreakPill: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
  },
  compactStreakIcon: {
    fontSize: 14,
    lineHeight: 16,
  },
  compactStreakText: {
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
  },
  tipCard: {
    gap: 6,
    borderWidth: 1,
    borderColor: "#1F2A44",
    borderRadius: 14,
    backgroundColor: "#101827",
    padding: 13,
  },
  cardLabel: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  tipText: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },
  waterCard: {
    gap: 14,
    borderWidth: 1,
    borderColor: "#1F2A44",
    borderRadius: 16,
    backgroundColor: "#101827",
    padding: 16,
  },
  waterPreviewCard: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    borderWidth: 1,
    borderColor: "#1F2A44",
    borderRadius: 16,
    backgroundColor: "#101827",
    padding: 16,
  },
  waterPreviewTextGroup: {
    flex: 1,
    gap: 5,
  },
  waterPreviewAmount: {
    fontSize: 20,
    fontWeight: "900",
  },
  previewActionButton: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  previewActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  previewChevronGroup: {
    maxWidth: 104,
    alignItems: "flex-end",
    gap: 2,
  },
  swipeHint: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  previewChevron: {
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 30,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "900",
  },
  waterText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "800",
  },
  hydrationSummary: {
    gap: 3,
  },
  waterAmount: {
    color: "#F8FAFC",
    fontSize: 34,
    fontWeight: "900",
  },
  hydrationTrack: {
    height: 10,
    overflow: "hidden",
    borderRadius: 10,
    backgroundColor: "#243047",
  },
  hydrationFill: {
    height: "100%",
    borderRadius: 10,
  },
  unitRow: {
    flexDirection: "row",
    gap: 8,
  },
  unitButton: {
    minHeight: 34,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    paddingHorizontal: 8,
  },
  unitButtonText: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  quickWaterRow: {
    flexDirection: "row",
    gap: 8,
  },
  waterQuickButton: {
    minHeight: 42,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  waterQuickButtonText: {
    fontSize: 13,
    fontWeight: "900",
  },
  waterTip: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  undoButton: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    paddingHorizontal: 12,
  },
  undoButtonText: {
    fontSize: 13,
    fontWeight: "900",
  },
  waterLogList: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#243047",
    paddingTop: 10,
  },
  waterLogRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  waterLogTime: {
    fontSize: 13,
    fontWeight: "700",
  },
  waterLogAmount: {
    fontSize: 13,
    fontWeight: "900",
  },
  waterDots: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  waterDot: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    backgroundColor: "#172033",
  },
  waterDotFilled: {
    borderColor: "#38BDF8",
    backgroundColor: "#38BDF8",
  },
  quickCard: {
    gap: 12,
    borderWidth: 1,
    borderColor: "#1F2A44",
    borderRadius: 16,
    backgroundColor: "#101827",
    padding: 16,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickButton: {
    minHeight: 44,
    flexGrow: 1,
    flexBasis: "47%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#1E293B",
    paddingHorizontal: 12,
  },
  quickPressed: {
    opacity: 0.78,
  },
  unlockButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  unlockButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  quickButtonText: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "900",
  },
  foodsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  foodCount: {
    minWidth: 32,
    borderRadius: 16,
    backgroundColor: "#1E293B",
    color: "#38BDF8",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "900",
  },
  emptyCard: {
    gap: 6,
    borderWidth: 1,
    borderColor: "#1F2A44",
    borderRadius: 16,
    backgroundColor: "#101827",
    padding: 18,
  },
  emptyTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "900",
  },
  emptyMessage: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 20,
  },
});

const styles = StyleSheet.create({
  tokenBar: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderColor: "#DADDD4",
    borderRadius: 18,
    backgroundColor: "#F7FAFF",
    paddingLeft: 12,
    paddingRight: 4,
  },
  tokenPillPressed: {
    opacity: 0.85,
  },
  tokenText: {
    color: "#1E1F24",
    fontSize: 13,
    fontWeight: "900",
  },
  tokenButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#2563eb",
  },
  tokenButtonPressed: {
    opacity: 0.82,
  },
  tokenButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 20,
  },
  hero: {
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 20,
    shadowColor: "#1E1F24",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: {
    color: "#2E7D57",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    marginTop: 8,
    color: "#1E1F24",
    fontSize: 36,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 6,
    color: "#6B6F76",
    fontSize: 15,
  },
  ringSection: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  ringWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenter: {
    position: "absolute",
    alignItems: "center",
  },
  ringCalories: {
    color: "#1E1F24",
    fontSize: 34,
    fontWeight: "900",
  },
  ringLabel: {
    color: "#6B6F76",
    fontSize: 13,
    fontWeight: "800",
  },
  goalDetails: {
    flex: 1,
    gap: 4,
  },
  goalLabel: {
    color: "#6B6F76",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  goalValue: {
    color: "#1E1F24",
    fontSize: 22,
    fontWeight: "900",
  },
  overGoalText: {
    color: "#B95C3A",
    fontSize: 14,
    fontWeight: "900",
  },
  status: {
    marginTop: 10,
    color: "#2E7D57",
    fontSize: 15,
    fontWeight: "800",
  },
  statusOver: {
    color: "#B95C3A",
  },
  stats: {
    flexDirection: "row",
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: "#1E1F24",
    fontSize: 20,
    fontWeight: "900",
  },
  count: {
    minWidth: 32,
    borderRadius: 16,
    backgroundColor: "#E6F1EA",
    color: "#2E7D57",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
  },
});
