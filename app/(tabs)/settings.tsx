import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppConfirmSheet } from '@/src/components/AppConfirmSheet';
import { Screen } from '@/src/components/Screen';
import { PressableScale } from '@/src/components/PressableScale';
import { useCalories } from '@/src/context/CalorieContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { TokenTransaction, useTokens } from '@/src/context/TokenContext';
import { useToast } from '@/src/context/ToastContext';
import { APP_LANGUAGES, AppLanguage } from '@/src/i18n';
import { updateProfileNutrition } from '@/src/services/nutritionProfileDbService';
import { loadNutritionProfile, saveNutritionProfile } from '@/src/storage';
import { useAppTheme } from '@/src/theme/appTheme';
import {
  ActivityLevel,
  DEFAULT_NUTRITION_PROFILE,
  NutritionGoal,
  NutritionProfile,
  NutritionSex,
  NutritionStyle,
  TargetPace,
  estimateNutritionTargets,
  validateNutritionProfileNumber,
} from '@/src/utils/nutritionTargets';
import { validateNumberRange } from '@/src/utils/validation';

type SettingsPanel =
  | 'main'
  | 'appearance'
  | 'tokens'
  | 'dailyGoal'
  | 'nutritionProfile'
  | 'language'
  | 'sync'
  | 'about';
type NutritionProfileStep = 'goal' | 'style' | 'bodyInfo' | 'targets';
const WATER_UNLOCK_COST = 20;
const TEST_PROFILE_ID_KEY = 'testProfileId';
const LEGACY_TEST_PROFILE_ID_KEY = 'calorie-tracker.test-profile-id';

const GOAL_OPTIONS: Array<{ value: NutritionGoal; subtitleKey: string }> = [
  { value: 'maintain', subtitleKey: 'nutritionProfile.maintainSubtitle' },
  { value: 'build_muscle', subtitleKey: 'nutritionProfile.buildMuscleSubtitle' },
  { value: 'cut', subtitleKey: 'nutritionProfile.cutSubtitle' },
  { value: 'performance', subtitleKey: 'nutritionProfile.performanceSubtitle' },
  { value: 'eat_healthier', subtitleKey: 'nutritionProfile.eatHealthierSubtitle' },
  { value: 'custom', subtitleKey: 'nutritionProfile.customSubtitle' },
];

const STYLE_OPTIONS: Array<{ value: NutritionStyle; icon: string; descriptionKey: string }> = [
  { value: 'balanced', icon: '🍽️', descriptionKey: 'nutritionProfile.balancedDescription' },
  { value: 'high_protein', icon: '🥚', descriptionKey: 'nutritionProfile.highProteinDescription' },
  { value: 'low_carb', icon: '🥑', descriptionKey: 'nutritionProfile.lowCarbDescription' },
  { value: 'keto', icon: '🧀', descriptionKey: 'nutritionProfile.ketoDescription' },
  { value: 'mediterranean', icon: '🫒', descriptionKey: 'nutritionProfile.mediterraneanDescription' },
  { value: 'vegetarian', icon: '🌿', descriptionKey: 'nutritionProfile.vegetarianDescription' },
  { value: 'bulking', icon: '🏋️', descriptionKey: 'nutritionProfile.bulkingDescription' },
  { value: 'cutting', icon: '🎯', descriptionKey: 'nutritionProfile.cuttingDescription' },
  { value: 'custom', icon: '🎚️', descriptionKey: 'nutritionProfile.customStyleDescription' },
];

const SEX_OPTIONS: Array<{ value: NutritionSex; labelKey: string }> = [
  { value: 'male', labelKey: 'nutritionProfile.male' },
  { value: 'female', labelKey: 'nutritionProfile.female' },
  { value: 'unspecified', labelKey: 'nutritionProfile.preferNotToSay' },
];

const ACTIVITY_OPTIONS: Array<{ value: ActivityLevel; labelKey: string }> = [
  { value: 'sedentary', labelKey: 'nutritionProfile.sedentary' },
  { value: 'light', labelKey: 'nutritionProfile.lightlyActive' },
  { value: 'moderate', labelKey: 'nutritionProfile.moderatelyActive' },
  { value: 'very_active', labelKey: 'nutritionProfile.veryActive' },
  { value: 'athlete', labelKey: 'nutritionProfile.athlete' },
];

const PACE_OPTIONS: Array<{ value: TargetPace; labelKey: string }> = [
  { value: 'slow', labelKey: 'nutritionProfile.slow' },
  { value: 'moderate', labelKey: 'nutritionProfile.moderatePace' },
  { value: 'aggressive', labelKey: 'nutritionProfile.aggressive' },
];

async function loadTestProfileId() {
  try {
    return (
      (await AsyncStorage.getItem(TEST_PROFILE_ID_KEY)) ??
      (await AsyncStorage.getItem(LEGACY_TEST_PROFILE_ID_KEY))
    );
  } catch (error) {
    console.warn('Failed to load testProfileId for nutrition profile sync.', error);
    return null;
  }
}

export default function SettingsScreen() {
  const theme = useAppTheme();
  const { language, setLanguage, t } = useLanguage();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ panel?: string }>();
  const {
    dailyGoal,
    loggingStreak,
    macroGoals,
    todayDashboardStyle,
    updateDailyGoal,
    updateMacroGoals,
    updateTodayDashboardStyle,
    updateWaterGoalGlasses,
    updateWaterIntakeUnlocked,
    waterGoalGlasses,
    waterIntakeUnlocked,
  } = useCalories();
  const { addTokens, canSpendTokens, spendTokens, tokenBalance, transactions } = useTokens();
  const [activePanel, setActivePanel] = useState<SettingsPanel>('main');
  const [goal, setGoal] = useState(String(dailyGoal));
  const [waterGoal, setWaterGoal] = useState(String(waterGoalGlasses));
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingTokens, setIsAddingTokens] = useState(false);
  const [isUnlockingWater, setIsUnlockingWater] = useState(false);
  const [nutritionProfile, setNutritionProfile] = useState<NutritionProfile>(DEFAULT_NUTRITION_PROFILE);
  const [manualTargets, setManualTargets] = useState({
    calories: String(dailyGoal),
    protein: String(macroGoals.protein),
    carbs: String(macroGoals.carbs),
    fat: String(macroGoals.fat),
  });
  const [isEditingManualTargets, setIsEditingManualTargets] = useState(false);
  const [isSavingNutritionProfile, setIsSavingNutritionProfile] = useState(false);
  const [nutritionProfileStep, setNutritionProfileStep] = useState<NutritionProfileStep>('goal');
  const [isCustomTargetsConfirmVisible, setIsCustomTargetsConfirmVisible] = useState(false);
  const [isUpdateTargetsConfirmVisible, setIsUpdateTargetsConfirmVisible] = useState(false);
  const [hasSavedNutritionTargets, setHasSavedNutritionTargets] = useState(false);

  useEffect(() => {
    setGoal(String(dailyGoal));
  }, [dailyGoal]);

  useEffect(() => {
    setWaterGoal(String(waterGoalGlasses));
  }, [waterGoalGlasses]);

  useEffect(() => {
    let isMounted = true;

    loadNutritionProfile().then((storedProfile) => {
      if (!isMounted) {
        return;
      }

      const nextProfile = storedProfile ?? {
        ...DEFAULT_NUTRITION_PROFILE,
        targets: {
          calories: dailyGoal,
          protein: macroGoals.protein,
          carbs: macroGoals.carbs,
          fat: macroGoals.fat,
          explanation: [],
          warnings: [],
        },
      };

      setNutritionProfile(nextProfile);
      setHasSavedNutritionTargets(Boolean(storedProfile?.targets?.calories || storedProfile?.updatedAt));
      setManualTargets({
        calories: String(nextProfile.targets?.calories ?? dailyGoal),
        protein: String(nextProfile.targets?.protein ?? macroGoals.protein),
        carbs: String(nextProfile.targets?.carbs ?? macroGoals.carbs),
        fat: String(nextProfile.targets?.fat ?? macroGoals.fat),
      });
      setIsEditingManualTargets(nextProfile.goal === 'custom' || nextProfile.style === 'custom');
    });

    return () => {
      isMounted = false;
    };
  }, [dailyGoal, macroGoals.carbs, macroGoals.fat, macroGoals.protein]);

  useFocusEffect(
    useCallback(() => {
      setActivePanel(params.panel === 'goals' ? 'dailyGoal' : 'main');

      return () => {
        setActivePanel('main');
      };
    }, [params.panel]),
  );

  const parsedGoal = Number(goal);
  const goalError = validateNumberRange(goal, 'Daily goal', 500, 10000);
  const isGoalValid = !goalError;
  const parsedWaterGoal = Number(waterGoal);
  const waterGoalError = validateNumberRange(waterGoal, 'Water goal', 1, 20);
  const isWaterGoalValid = !waterGoalError;
  const ageText = nutritionProfile.age ? String(nutritionProfile.age) : '';
  const heightText = nutritionProfile.heightCm ? String(nutritionProfile.heightCm) : '';
  const weightText = nutritionProfile.weightKg ? String(nutritionProfile.weightKg) : '';
  const ageError = validateNutritionProfileNumber(ageText, t('nutritionProfile.age'), 13, 100);
  const heightError = validateNutritionProfileNumber(heightText, t('nutritionProfile.heightCm'), 100, 230);
  const weightError = validateNutritionProfileNumber(weightText, t('nutritionProfile.weightKg'), 30, 250);
  const estimatedTargets = useMemo(
    () => estimateNutritionTargets(nutritionProfile),
    [nutritionProfile],
  );
  const manualTargetErrors = {
    calories: validateNumberRange(manualTargets.calories, t('nutrition.calories'), 0, 10000, { inclusiveMin: false }),
    protein: validateNumberRange(manualTargets.protein, t('nutrition.protein'), 0, 1000),
    carbs: validateNumberRange(manualTargets.carbs, t('nutrition.carbs'), 0, 1000),
    fat: validateNumberRange(manualTargets.fat, t('nutrition.fat'), 0, 1000),
  };
  const hasManualTargetErrors = Object.values(manualTargetErrors).some(Boolean);
  const isManualTargetsMode = isEditingManualTargets || !estimatedTargets;
  const activeTargets = isManualTargetsMode
    ? {
        calories: Math.round(Number(manualTargets.calories)),
        protein: Math.round(Number(manualTargets.protein)),
        carbs: Math.round(Number(manualTargets.carbs)),
        fat: Math.round(Number(manualTargets.fat)),
        explanation: [t('nutritionProfile.manualTargetsExplanation')],
        warnings: [],
      }
    : estimatedTargets;
  const isNutritionProfileValid =
    !ageError &&
    !heightError &&
    !weightError &&
    Boolean(activeTargets) &&
    (!isManualTargetsMode || !hasManualTargetErrors);
  const isBodyInfoCompleteForEstimate = Boolean(estimatedTargets);
  const isCustomProfilePath = nutritionProfile.goal === 'custom' || nutritionProfile.style === 'custom';
  const canAdvanceBodyInfo =
    !ageError && !heightError && !weightError && (isBodyInfoCompleteForEstimate || isCustomProfilePath);
  const nutritionProfileSummary =
    hasSavedNutritionTargets && nutritionProfile.targets
      ? `${nutritionProfile.targets.calories} kcal · ${t(`nutritionProfile.${goalKeyToTranslation(nutritionProfile.goal)}`)}`
      : t('nutritionProfile.summaryNotSet');
  const nutritionStyleSummary = hasSavedNutritionTargets
    ? `${t(`nutritionProfile.${goalKeyToTranslation(nutritionProfile.goal)}`)} · ${t(`nutritionProfile.${styleKeyToTranslation(nutritionProfile.style)}`)}`
    : t('settings.nutritionProfileSubtitle');
  const currentLanguageLabel = APP_LANGUAGES.find((option) => option.code === language)?.label ?? 'English';
  const waterSummary = waterIntakeUnlocked
    ? t('settings.dailyGoalGlasses', { count: waterGoalGlasses })
    : t('settings.lockedFeature');
  const streakSummary =
    loggingStreak.currentStreak > 0
      ? `${loggingStreak.currentStreak} ${loggingStreak.currentStreak === 1 ? t('today.day') : t('today.days')} · ${t('today.best', {
          count: loggingStreak.longestStreak,
          unit: loggingStreak.longestStreak === 1 ? t('today.day') : t('today.days'),
        })}`
      : t('today.startStreak');

  function updateNutritionProfileField<Key extends keyof NutritionProfile>(
    key: Key,
    value: NutritionProfile[Key],
  ) {
    setNutritionProfile((currentProfile) => ({
      ...currentProfile,
      [key]: value,
    }));
  }

  function updateNutritionProfileNumber(key: 'age' | 'heightCm' | 'weightKg', value: string) {
    const parsedValue = value.trim() ? Number(value) : undefined;

    setNutritionProfile((currentProfile) => ({
      ...currentProfile,
      [key]: Number.isFinite(parsedValue) ? parsedValue : undefined,
    }));
  }

  function handleSelectNutritionGoal(nextGoal: NutritionGoal) {
    updateNutritionProfileField('goal', nextGoal);

    if (nextGoal === 'custom') {
      setIsEditingManualTargets(true);
    } else if (nutritionProfile.style !== 'custom') {
      setIsEditingManualTargets(false);
    }
  }

  function handleSelectNutritionStyle(nextStyle: NutritionStyle) {
    updateNutritionProfileField('style', nextStyle);

    if (nextStyle === 'custom') {
      setIsEditingManualTargets(true);
    } else if (nutritionProfile.goal !== 'custom') {
      setIsEditingManualTargets(false);
    }
  }

  function updateManualTarget(key: keyof typeof manualTargets, value: string) {
    setIsEditingManualTargets(true);
    setManualTargets((current) => ({ ...current, [key]: value }));
  }

  function openNutritionProfileStepper() {
    setNutritionProfileStep('goal');
    setActivePanel('nutritionProfile');
  }

  function handleOpenNutritionProfile() {
    if (hasSavedNutritionTargets) {
      setIsUpdateTargetsConfirmVisible(true);
      return;
    }

    openNutritionProfileStepper();
  }

  function handleConfirmUpdateTargets() {
    setIsUpdateTargetsConfirmVisible(false);
    openNutritionProfileStepper();
  }

  function handleToggleManualTargets() {
    if (isEditingManualTargets) {
      setIsEditingManualTargets(false);
      return;
    }

    setIsCustomTargetsConfirmVisible(true);
  }

  function handleConfirmManualTargets() {
    setIsCustomTargetsConfirmVisible(false);
    setIsEditingManualTargets(true);
    showToast({
      message: t('nutritionProfile.customTargetsEnabledMessage'),
      title: t('nutritionProfile.customTargetsEnabled'),
      type: 'info',
    });
  }

  async function handleSaveGoal() {
    if (!isGoalValid || isSaving) {
      Alert.alert('Check goal', 'Enter a daily goal between 500 and 10000 calories.');
      return;
    }

    setIsSaving(true);

    try {
      await updateDailyGoal(Math.round(parsedGoal));
      setActivePanel('main');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveWaterGoal() {
    if (!waterIntakeUnlocked || !isWaterGoalValid) {
      return;
    }

    await updateWaterGoalGlasses(Math.round(parsedWaterGoal));
  }

  async function handleApplyNutritionTargets() {
    if (!activeTargets || !isNutritionProfileValid || isSavingNutritionProfile) {
      Alert.alert(t('nutritionProfile.checkTargets'), t('nutritionProfile.completeProfileOrManualTargets'));
      return;
    }

    const nextTargets = {
      calories: Math.round(activeTargets.calories),
      protein: Math.round(activeTargets.protein),
      carbs: Math.round(activeTargets.carbs),
      fat: Math.round(activeTargets.fat),
      explanation: activeTargets.explanation,
      warnings: activeTargets.warnings,
    };
    const nextProfile: NutritionProfile = {
      ...nutritionProfile,
      targets: nextTargets,
      updatedAt: new Date().toISOString(),
    };

    setIsSavingNutritionProfile(true);

    try {
      setNutritionProfile(nextProfile);
      setManualTargets({
        calories: String(nextTargets.calories),
        protein: String(nextTargets.protein),
        carbs: String(nextTargets.carbs),
        fat: String(nextTargets.fat),
      });
      await saveNutritionProfile(nextProfile);
      await updateDailyGoal(nextTargets.calories);
      await updateMacroGoals({
        protein: nextTargets.protein,
        carbs: nextTargets.carbs,
        fat: nextTargets.fat,
      });

      const testProfileId = await loadTestProfileId();

      if (testProfileId) {
        await updateProfileNutrition(testProfileId, nextProfile);
      }

      setHasSavedNutritionTargets(true);
      showToast({
        message: t('nutritionProfile.targetsUpdatedMessage'),
        title: t('nutritionProfile.targetsUpdated'),
        type: 'success',
      });
      router.replace('/');
    } catch (error) {
      console.error('Nutrition profile apply error', error);
      showToast({
        message: 'Your nutrition targets were not updated. Try again.',
        title: 'Could not update targets',
        type: 'error',
      });
    } finally {
      setIsSavingNutritionProfile(false);
    }
  }

  async function handleUnlockWater() {
    if (waterIntakeUnlocked || isUnlockingWater) {
      return;
    }

    if (!canSpendTokens(WATER_UNLOCK_COST)) {
      Alert.alert('Not enough tokens', 'Add tokens to unlock water intake.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Get tokens', onPress: () => setActivePanel('tokens') },
      ]);
      return;
    }

    setIsUnlockingWater(true);

    try {
      const didSpend = await spendTokens(WATER_UNLOCK_COST, 'unlock_water_intake');

      if (!didSpend) {
        Alert.alert('Unlock failed', 'Token spend did not complete.');
        return;
      }

      await updateWaterIntakeUnlocked(true);
      Alert.alert('Water intake unlocked', 'Hydration tracking is now enabled.');
    } finally {
      setIsUnlockingWater(false);
    }
  }

  async function handleAddTestTokens(amount: number) {
    if (isAddingTokens || amount <= 0) {
      return;
    }

    setIsAddingTokens(true);

    try {
      await addTokens(amount);
    } finally {
      setIsAddingTokens(false);
    }
  }

  async function handleSelectLanguage(nextLanguage: AppLanguage) {
    await setLanguage(nextLanguage);
    showToast({
      title: t('toast.languageUpdated'),
      type: 'success',
    });
  }

  function renderHeader(title: string) {
    return (
      <View style={styles.headerRow}>
        {activePanel !== 'main' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setActivePanel('main')}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: theme.chipBackground },
              pressed && styles.buttonPressed,
            ]}>
            <Text style={[styles.backButtonText, { color: theme.primary }]}>{t('common.back')}</Text>
          </Pressable>
        ) : null}
        <Text style={[styles.screenTitle, { color: theme.text }]}>{title}</Text>
      </View>
    );
  }

  if (activePanel === 'appearance') {
    return (
      <Screen>
        {renderHeader(t('settings.appearance'))}
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('settings.theme')}</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            {t('settings.chooseVisualStyle')}
          </Text>
          <View style={[styles.segmentedControl, { backgroundColor: theme.chipBackground }]}>
            <DashboardStyleButton
              isSelected={todayDashboardStyle === 'classic'}
              label={t('settings.classic')}
              onPress={() => updateTodayDashboardStyle('classic')}
            />
            <DashboardStyleButton
              isSelected={todayDashboardStyle === 'premiumDark'}
              label={t('settings.premiumDark')}
              onPress={() => updateTodayDashboardStyle('premiumDark')}
            />
          </View>
        </SettingsCard>
      </Screen>
    );
  }

  if (activePanel === 'tokens') {
    return (
      <Screen>
        {renderHeader(t('settings.tokens'))}
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{tokenBalance} tokens</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>{t('settings.testModeNoPayment')}</Text>
          <View style={styles.planRow}>
            <TokenPlan
              amount={100}
              disabled={isAddingTokens}
              price="$3"
              onPress={() => handleAddTestTokens(100)}
            />
            <TokenPlan
              amount={200}
              disabled={isAddingTokens}
              price="$5"
              onPress={() => handleAddTestTokens(200)}
            />
          </View>
        </SettingsCard>
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('settings.recentTransactions')}</Text>
          {transactions.slice(0, 8).map((transaction) => (
            <View
              key={transaction.id}
              style={[styles.transactionRow, { backgroundColor: theme.cardAlt }]}>
              <Text style={[styles.transactionReason, { color: theme.text }]}>
                {formatTransactionReason(transaction)}
              </Text>
              <Text
                style={[
                  styles.transactionAmount,
                  { color: transaction.amount > 0 ? theme.success : theme.warning },
                ]}>
                {transaction.amount > 0 ? '+' : ''}
                {transaction.amount}
              </Text>
            </View>
          ))}
        </SettingsCard>
      </Screen>
    );
  }

  if (activePanel === 'dailyGoal') {
    return (
      <Screen>
        {renderHeader(t('settings.goals'))}
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('settings.dailyCalories')}</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            {t('settings.setCalorieTarget')}
          </Text>
          <View style={styles.field}>
            <TextInput
              inputMode="numeric"
              keyboardType="number-pad"
              onChangeText={setGoal}
              placeholder="2000"
              placeholderTextColor={theme.mutedText}
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBackground,
                  borderColor: goalError ? theme.warning : theme.cardBorder,
                  color: theme.text,
                },
              ]}
              value={goal}
            />
            {goalError ? <Text style={[styles.errorText, { color: theme.warning }]}>{goalError}</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={!isGoalValid || isSaving}
            onPress={handleSaveGoal}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.success },
              (!isGoalValid || isSaving) && styles.buttonDisabled,
              pressed && isGoalValid ? styles.buttonPressed : null,
            ]}>
            <Text style={styles.buttonText}>{isSaving ? t('common.saving') : t('settings.saveGoal')}</Text>
          </Pressable>
        </SettingsCard>
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('settings.waterIntake')}</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            {t('settings.trackDailyWater')}
          </Text>
          {waterIntakeUnlocked ? (
            <>
              <Text style={[styles.statusText, { color: theme.success }]}>{t('common.enabled')}</Text>
              <Text style={[styles.subtitle, { color: theme.mutedText }]}>
                {t('settings.dailyGoalGlasses', { count: waterGoalGlasses })}
              </Text>
              <View style={styles.field}>
                <TextInput
                  inputMode="numeric"
                  keyboardType="number-pad"
                  onChangeText={setWaterGoal}
                  placeholder="8"
                  placeholderTextColor={theme.mutedText}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.inputBackground,
                      borderColor: waterGoalError ? theme.warning : theme.cardBorder,
                      color: theme.text,
                    },
                  ]}
                  value={waterGoal}
                />
                {waterGoalError ? (
                  <Text style={[styles.errorText, { color: theme.warning }]}>{waterGoalError}</Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={!isWaterGoalValid}
                onPress={handleSaveWaterGoal}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.success },
                  !isWaterGoalValid && styles.buttonDisabled,
                  pressed && isWaterGoalValid ? styles.buttonPressed : null,
                ]}>
                <Text style={styles.buttonText}>{t('settings.saveWaterGoal')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.statusText, { color: theme.warning }]}>{t('settings.lockedFeature')}</Text>
              <Text style={[styles.subtitle, { color: theme.mutedText }]}>
                {t('settings.unlockForTokens', { count: WATER_UNLOCK_COST })}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={isUnlockingWater}
                onPress={handleUnlockWater}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.primary },
                  isUnlockingWater && styles.buttonDisabled,
                  pressed && !isUnlockingWater ? styles.buttonPressed : null,
                ]}>
                <Text style={styles.buttonText}>
                  {isUnlockingWater ? t('settings.unlocking') : t('settings.unlockWithTokens', { count: WATER_UNLOCK_COST })}
                </Text>
              </Pressable>
            </>
          )}
        </SettingsCard>
      </Screen>
    );
  }

  if (activePanel === 'nutritionProfile') {
    const isUnder18 = typeof nutritionProfile.age === 'number' && nutritionProfile.age < 18;
    const stepOrder: NutritionProfileStep[] = ['goal', 'style', 'bodyInfo', 'targets'];
    const currentStepIndex = stepOrder.indexOf(nutritionProfileStep);
    const isFirstStep = currentStepIndex === 0;
    const isLastStep = nutritionProfileStep === 'targets';
    const stepLabels = {
      goal: t('nutritionProfile.stepGoal'),
      style: t('nutritionProfile.stepStyle'),
      bodyInfo: t('nutritionProfile.stepBodyInfo'),
      targets: t('nutritionProfile.stepTargets'),
    };
    const canGoNext =
      nutritionProfileStep === 'goal'
        ? Boolean(nutritionProfile.goal)
        : nutritionProfileStep === 'style'
          ? Boolean(nutritionProfile.style)
          : nutritionProfileStep === 'bodyInfo'
            ? canAdvanceBodyInfo
            : isNutritionProfileValid;

    function goToNextNutritionStep() {
      if (!canGoNext || isLastStep) {
        return;
      }

      setNutritionProfileStep(stepOrder[currentStepIndex + 1]);
    }

    function goToPreviousNutritionStep() {
      if (isFirstStep) {
        setActivePanel('main');
        return;
      }

      setNutritionProfileStep(stepOrder[currentStepIndex - 1]);
    }

    function renderNutritionStep() {
      if (nutritionProfileStep === 'goal') {
        return (
          <SettingsCard>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('nutritionProfile.goal')}</Text>
            <Text style={[styles.subtitle, { color: theme.mutedText }]}>
              {t('nutritionProfile.goalSubtitle')}
            </Text>
            <View style={styles.optionList}>
              {GOAL_OPTIONS.map((option) => (
                <SelectionOption
                  isSelected={nutritionProfile.goal === option.value}
                  key={option.value}
                  onPress={() => handleSelectNutritionGoal(option.value)}
                  subtitle={t(option.subtitleKey)}
                  title={t(`nutritionProfile.${goalKeyToTranslation(option.value)}`)}
                />
              ))}
            </View>
          </SettingsCard>
        );
      }

      if (nutritionProfileStep === 'style') {
        return (
          <SettingsCard>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('nutritionProfile.style')}</Text>
            <Text style={[styles.subtitle, { color: theme.mutedText }]}>
              {t('nutritionProfile.styleSubtitle')}
            </Text>
            <View style={styles.styleList}>
              {STYLE_OPTIONS.map((option) => (
                <NutritionStyleCard
                  description={t(option.descriptionKey)}
                  icon={option.icon}
                  isSelected={nutritionProfile.style === option.value}
                  key={option.value}
                  onPress={() => handleSelectNutritionStyle(option.value)}
                  title={t(`nutritionProfile.${styleKeyToTranslation(option.value)}`)}
                />
              ))}
            </View>
          </SettingsCard>
        );
      }

      if (nutritionProfileStep === 'bodyInfo') {
        return (
          <SettingsCard>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('nutritionProfile.bodyInfo')}</Text>
            <Text style={[styles.subtitle, { color: theme.mutedText }]}>
              {t('nutritionProfile.bodyInfoSubtitle')}
            </Text>
            <View style={styles.twoColumnRow}>
              <ProfileNumberField
                error={ageError}
                label={t('nutritionProfile.age')}
                onChangeText={(value) => updateNutritionProfileNumber('age', value)}
                placeholder="28"
                value={ageText}
              />
              <ProfileNumberField
                error={heightError}
                label={t('nutritionProfile.heightCm')}
                onChangeText={(value) => updateNutritionProfileNumber('heightCm', value)}
                placeholder="175"
                value={heightText}
              />
            </View>
            <ProfileNumberField
              error={weightError}
              label={t('nutritionProfile.weightKg')}
              onChangeText={(value) => updateNutritionProfileNumber('weightKg', value)}
              placeholder="75"
              value={weightText}
            />

            <Text style={[styles.fieldLabel, { color: theme.text }]}>{t('nutritionProfile.sex')}</Text>
            <View style={styles.chipWrap}>
              {SEX_OPTIONS.map((option) => (
                <SmallChip
                  isSelected={(nutritionProfile.sex ?? 'unspecified') === option.value}
                  key={option.value}
                  label={t(option.labelKey)}
                  onPress={() => updateNutritionProfileField('sex', option.value)}
                />
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.text }]}>{t('nutritionProfile.activityLevel')}</Text>
            <View style={styles.chipWrap}>
              {ACTIVITY_OPTIONS.map((option) => (
                <SmallChip
                  isSelected={(nutritionProfile.activityLevel ?? 'moderate') === option.value}
                  key={option.value}
                  label={t(option.labelKey)}
                  onPress={() => updateNutritionProfileField('activityLevel', option.value)}
                />
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.text }]}>{t('nutritionProfile.targetPace')}</Text>
            <View style={styles.chipWrap}>
              {PACE_OPTIONS.map((option) => {
                const isDisabled = isUnder18 && option.value === 'aggressive';

                return (
                  <SmallChip
                    disabled={isDisabled}
                    isSelected={(nutritionProfile.targetPace ?? 'moderate') === option.value}
                    key={option.value}
                    label={t(option.labelKey)}
                    onPress={() => updateNutritionProfileField('targetPace', option.value)}
                  />
                );
              })}
            </View>

            {!canAdvanceBodyInfo ? (
              <Text style={[styles.warningNote, { backgroundColor: theme.chipBackground, color: theme.mutedText }]}>
                {t('nutritionProfile.addBodyInfo')}
              </Text>
            ) : null}
            {isUnder18 ? (
              <Text style={[styles.warningNote, { backgroundColor: theme.chipBackground, color: theme.warning }]}>
                {t('nutritionProfile.under18Note')}
              </Text>
            ) : null}
          </SettingsCard>
        );
      }

      return (
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t('nutritionProfile.estimatedTargets')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            {t('nutritionProfile.targetsEstimatedFromInfo')}
          </Text>

          {!isEditingManualTargets && estimatedTargets ? (
            <View style={styles.targetGrid}>
              <TargetTile label={t('nutrition.calories')} unit={t('nutritionProfile.perDay')} value={estimatedTargets.calories} />
              <TargetTile label={t('nutrition.protein')} unit="g" value={estimatedTargets.protein} />
              <TargetTile label={t('nutrition.carbs')} unit="g" value={estimatedTargets.carbs} />
              <TargetTile label={t('nutrition.fat')} unit="g" value={estimatedTargets.fat} />
            </View>
          ) : null}

          <Text style={[styles.detailLine, { color: theme.mutedText }]}>
            {t('nutritionProfile.targetsEstimateNote')}
          </Text>

          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: isEditingManualTargets }}
            onPress={handleToggleManualTargets}
            style={({ pressed }) => [
              styles.manualCustomizeRow,
              {
                backgroundColor: theme.cardAlt,
                borderColor: isEditingManualTargets ? theme.primary : theme.cardBorder,
              },
              pressed && styles.buttonPressed,
            ]}>
            <View style={styles.rowText}>
              <Text style={[styles.manualRowTitle, { color: theme.text }]}>
                {t('nutritionProfile.customizeTargets')}
              </Text>
              <Text style={[styles.manualRowSubtitle, { color: theme.mutedText }]}>
                {t('nutritionProfile.adjustManually')}
              </Text>
            </View>
            <View
              style={[
                styles.toggleTrack,
                { backgroundColor: isEditingManualTargets ? theme.primary : theme.cardBorder },
              ]}>
              <View
                style={[
                  styles.toggleThumb,
                  {
                    backgroundColor: '#FFFFFF',
                    transform: [{ translateX: isEditingManualTargets ? 18 : 0 }],
                  },
                ]}
              />
            </View>
          </Pressable>

          {isEditingManualTargets || !estimatedTargets ? (
            <>
              <View style={styles.twoColumnRow}>
                <TargetInput
                  error={manualTargetErrors.calories}
                  label={t('nutrition.calories')}
                  onChangeText={(value) => updateManualTarget('calories', value)}
                  suffix="kcal"
                  value={manualTargets.calories}
                />
                <TargetInput
                  error={manualTargetErrors.protein}
                  label={t('nutrition.protein')}
                  onChangeText={(value) => updateManualTarget('protein', value)}
                  suffix="g"
                  value={manualTargets.protein}
                />
              </View>
              <View style={styles.twoColumnRow}>
                <TargetInput
                  error={manualTargetErrors.carbs}
                  label={t('nutrition.carbs')}
                  onChangeText={(value) => updateManualTarget('carbs', value)}
                  suffix="g"
                  value={manualTargets.carbs}
                />
                <TargetInput
                  error={manualTargetErrors.fat}
                  label={t('nutrition.fat')}
                  onChangeText={(value) => updateManualTarget('fat', value)}
                  suffix="g"
                  value={manualTargets.fat}
                />
              </View>
            </>
          ) : null}

          {activeTargets?.warnings.map((line) => (
            <Text key={line} style={[styles.warningNote, { backgroundColor: theme.chipBackground, color: theme.warning }]}>
              {line}
            </Text>
          ))}
          <Text style={[styles.detailLine, { color: theme.mutedText }]}>
            {t('nutritionProfile.targetsAreEstimates')}
          </Text>
        </SettingsCard>
      );
    }

    return (
      <Screen>
        {renderHeader(t('nutritionProfile.title'))}
        <View style={styles.stepperHeader}>
          <Text style={[styles.stepCounter, { color: theme.mutedText }]}>
            {t('nutritionProfile.stepCount', { current: currentStepIndex + 1, total: stepOrder.length })}
          </Text>
          <Text style={[styles.stepTitle, { color: theme.text }]}>{stepLabels[nutritionProfileStep]}</Text>
          <View style={styles.stepDots}>
            {stepOrder.map((step, index) => (
              <View
                key={step}
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: index <= currentStepIndex ? theme.primary : theme.cardBorder,
                    flex: index === currentStepIndex ? 1.5 : 1,
                  },
                ]}
              />
            ))}
          </View>
        </View>
        {renderNutritionStep()}
        <AppConfirmSheet
          cancelLabel={t('nutritionProfile.keepEstimate')}
          confirmLabel={t('nutritionProfile.confirmManualEdit')}
          message={t('nutritionProfile.useCustomTargetsBody')}
          onCancel={() => setIsCustomTargetsConfirmVisible(false)}
          onConfirm={handleConfirmManualTargets}
          title={t('nutritionProfile.useCustomTargetsTitle')}
          type="warning"
          visible={isCustomTargetsConfirmVisible}
        />
        <View style={styles.wizardFooter}>
          <Pressable
            accessibilityRole="button"
            onPress={goToPreviousNutritionStep}
            style={({ pressed }) => [
              styles.secondaryButton,
              { backgroundColor: theme.chipBackground, borderColor: theme.cardBorder },
              pressed && styles.buttonPressed,
            ]}>
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>{t('common.back')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!canGoNext || isSavingNutritionProfile}
            onPress={isLastStep ? handleApplyNutritionTargets : goToNextNutritionStep}
            style={({ pressed }) => [
              styles.wizardPrimaryButton,
              { backgroundColor: isLastStep ? theme.success : theme.primary },
              (!canGoNext || isSavingNutritionProfile) && styles.buttonDisabled,
              pressed && canGoNext ? styles.buttonPressed : null,
            ]}>
            <Text style={styles.buttonText}>
              {isSavingNutritionProfile
                ? t('common.saving')
                : isLastStep
                  ? t('nutritionProfile.applyTargets')
                  : t('nutritionProfile.next')}
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (activePanel === 'sync') {
    return (
      <Screen>
        {renderHeader(t('settings.databaseSync'))}
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('settings.offlineFirstSync')}</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            {t('settings.syncDescription')}
          </Text>
        </SettingsCard>
      </Screen>
    );
  }

  if (activePanel === 'language') {
    return (
      <Screen>
        {renderHeader(t('settings.language'))}
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('settings.language')}</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            {t('settings.chooseLanguage')}
          </Text>
          <View style={styles.languageList}>
            {APP_LANGUAGES.map((option) => {
              const isSelected = language === option.code;

              return (
                <PressableScale
                  accessibilityRole="button"
                  key={option.code}
                  onPress={() => handleSelectLanguage(option.code)}
                  style={[
                    styles.languageOption,
                    {
                      backgroundColor: isSelected ? theme.chipBackground : theme.cardAlt,
                      borderColor: isSelected ? theme.primary : theme.cardBorder,
                    },
                  ]}>
                  <Text style={[styles.languageName, { color: theme.text }]}>{option.label}</Text>
                  <Text style={[styles.languageCheck, { color: isSelected ? theme.primary : theme.mutedText }]}>
                    {isSelected ? '✓' : ''}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            {t('settings.rtlTodo')}
          </Text>
        </SettingsCard>
      </Screen>
    );
  }

  if (activePanel === 'about') {
    return (
      <Screen>
        {renderHeader(t('settings.aboutTestMode'))}
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('settings.appName')}</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            {t('settings.testModeDescription')}
          </Text>
        </SettingsCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.mainHeader}>
        <View style={styles.headerSpacer} />
        <Text style={[styles.mainHeaderTitle, { color: theme.text }]}>{t('settings.title')}</Text>
        <Text style={[styles.headerIcon, { color: theme.mutedText }]}>⚙</Text>
      </View>

      <PressableScale
        accessibilityRole="button"
        onPress={handleOpenNutritionProfile}
        style={[styles.profileHeader, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Text style={styles.avatarText}>YP</Text>
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.profileName, { color: theme.text }]}>{t('settings.yourProfile')}</Text>
          <Text style={[styles.profileSubtitle, { color: theme.mutedText }]}>{nutritionStyleSummary}</Text>
        </View>
        <Text style={[styles.profileEdit, { color: theme.primary }]}>✎</Text>
      </PressableScale>

      <PressableScale
        accessibilityRole="button"
        onPress={handleOpenNutritionProfile}
        style={[styles.insightCard, { backgroundColor: theme.isDark ? '#13243A' : '#EAF3FF', shadowColor: theme.shadow }]}>
        <View style={styles.rowText}>
          <Text style={[styles.insightTitle, { color: theme.text }]}>{t('settings.yourNutritionSetup')}</Text>
          <Text style={[styles.insightSubtitle, { color: theme.mutedText }]}>
            {t('settings.nutritionSetupDescription')}
          </Text>
          <View style={[styles.insightButton, { backgroundColor: theme.primary }]}>
            <Text style={styles.insightButtonText}>{t('settings.updateProfile')}</Text>
          </View>
        </View>
        <View style={[styles.insightGlyph, { backgroundColor: theme.isDark ? 'rgba(56,189,248,0.18)' : 'rgba(37,99,235,0.12)' }]}>
          <Text style={[styles.insightGlyphText, { color: theme.primary }]}>◎</Text>
        </View>
      </PressableScale>

      <SettingsSection title={t('settings.account')}>
        <SettingsRow icon="◉" onPress={handleOpenNutritionProfile} subtitle={nutritionStyleSummary} title={t('settings.manageProfile')} />
        <SettingsRow icon="◍" onPress={handleOpenNutritionProfile} subtitle={nutritionProfileSummary} title={t('settings.nutritionProfile')} />
        <SettingsRow icon="◇" onPress={() => setActivePanel('tokens')} subtitle={t('settings.tokensAvailable', { count: tokenBalance })} title={t('settings.tokens')} />
      </SettingsSection>

      <SettingsSection title={t('settings.preferences')}>
        <SettingsRow icon="A" onPress={() => setActivePanel('language')} subtitle={currentLanguageLabel} title={t('settings.language')} />
        <SettingsRow icon="◐" onPress={() => setActivePanel('appearance')} subtitle={todayDashboardStyle === 'premiumDark' ? t('settings.premiumDarkTheme') : t('settings.classicTheme')} title={t('settings.appearance')} />
      </SettingsSection>

      <SettingsSection title={t('settings.tracking')}>
        <SettingsRow icon="◎" onPress={() => setActivePanel('dailyGoal')} subtitle={t('settings.goalsSubtitle')} title={t('settings.goals')} />
        <SettingsRow icon="◌" onPress={() => setActivePanel('dailyGoal')} subtitle={waterSummary} title={t('settings.waterIntake')} />
        <SettingsRow icon="◇" subtitle={streakSummary} title={t('settings.dailyStreak')} />
      </SettingsSection>

      <SettingsSection title={t('settings.supportAbout')}>
        <SettingsRow icon="?" subtitle={t('settings.aboutSubtitle')} title={t('settings.contactSupport')} />
        <SettingsRow icon="i" onPress={() => setActivePanel('about')} subtitle={t('settings.aboutSubtitle')} title={t('settings.aboutTestMode')} />
        <SettingsRow icon="§" subtitle={t('settings.aboutSubtitle')} title={t('settings.termsConditions')} />
        <SettingsRow icon="◫" subtitle={t('settings.aboutSubtitle')} title={t('settings.privacy')} />
      </SettingsSection>

      <SettingsSection title={t('settings.developerTestMode')}>
        <SettingsRow icon="↻" onPress={() => setActivePanel('sync')} subtitle={t('settings.syncSubtitle')} title={t('settings.databaseSync')} />
        <SettingsRow icon="+" onPress={() => setActivePanel('tokens')} subtitle={t('settings.testModeNoPayment')} title={t('settings.tokens')} />
      </SettingsSection>

      <AppConfirmSheet
        cancelLabel={t('nutritionProfile.keepCurrent')}
        confirmLabel={t('nutritionProfile.updateTargets')}
        message={t('nutritionProfile.updateTargetsBody')}
        onCancel={() => setIsUpdateTargetsConfirmVisible(false)}
        onConfirm={handleConfirmUpdateTargets}
        title={t('nutritionProfile.updateTargetsTitle')}
        type="warning"
        visible={isUpdateTargetsConfirmVisible}
      />
    </Screen>
  );
}

function goalKeyToTranslation(goal: NutritionGoal) {
  const keys: Record<NutritionGoal, string> = {
    maintain: 'maintain',
    build_muscle: 'buildMuscle',
    cut: 'cut',
    performance: 'performance',
    eat_healthier: 'eatHealthier',
    custom: 'custom',
  };

  return keys[goal];
}

function styleKeyToTranslation(style: NutritionStyle) {
  const keys: Record<NutritionStyle, string> = {
    balanced: 'balanced',
    high_protein: 'highProtein',
    low_carb: 'lowCarb',
    keto: 'keto',
    mediterranean: 'mediterranean',
    vegetarian: 'vegetarian',
    bulking: 'bulking',
    cutting: 'cutting',
    custom: 'custom',
  };

  return keys[style];
}

function SettingsCard({ children }: { children: ReactNode }) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: theme.shadow },
      ]}>
      {children}
    </View>
  );
}

function SelectionOption({
  isSelected,
  onPress,
  subtitle,
  title,
}: {
  isSelected: boolean;
  onPress: () => void;
  subtitle: string;
  title: string;
}) {
  const theme = useAppTheme();

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.selectionOption,
        {
          backgroundColor: isSelected ? theme.chipBackground : theme.cardAlt,
          borderColor: isSelected ? theme.primary : theme.cardBorder,
        },
      ]}>
      <View style={styles.rowText}>
        <Text style={[styles.optionTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.optionSubtitle, { color: theme.mutedText }]}>{subtitle}</Text>
      </View>
      <Text style={[styles.optionCheck, { color: isSelected ? theme.primary : theme.mutedText }]}>
        {isSelected ? '✓' : ''}
      </Text>
    </PressableScale>
  );
}

function NutritionStyleCard({
  description,
  icon,
  isSelected,
  onPress,
  title,
}: {
  description: string;
  icon: string;
  isSelected: boolean;
  onPress: () => void;
  title: string;
}) {
  const theme = useAppTheme();

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.styleCard,
        {
          backgroundColor: isSelected ? theme.chipBackground : theme.cardAlt,
          borderColor: isSelected ? theme.primary : theme.cardBorder,
        },
      ]}>
      <View style={[styles.styleIcon, { backgroundColor: theme.inputBackground }]}>
        <Text style={styles.styleIconText}>{icon}</Text>
      </View>
      <View style={styles.styleText}>
        <Text style={[styles.styleTitle, { color: theme.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[styles.styleDescription, { color: theme.mutedText }]}>
          {description}
        </Text>
      </View>
      <Text style={[styles.optionCheck, { color: isSelected ? theme.primary : theme.mutedText }]}>
        {isSelected ? '✓' : ''}
      </Text>
    </PressableScale>
  );
}

function SmallChip({
  disabled,
  isSelected,
  label,
  onPress,
}: {
  disabled?: boolean;
  isSelected: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallChip,
        {
          backgroundColor: isSelected ? theme.primary : theme.chipBackground,
          borderColor: isSelected ? theme.primary : theme.cardBorder,
          opacity: disabled ? 0.45 : 1,
        },
        pressed && !disabled ? styles.buttonPressed : null,
      ]}>
      <Text style={[styles.smallChipText, { color: isSelected ? '#FFFFFF' : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function ProfileNumberField({
  error,
  label,
  onChangeText,
  placeholder,
  value,
}: {
  error: string | null;
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const theme = useAppTheme();

  return (
    <View style={[styles.field, styles.flexField]}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <TextInput
        inputMode="numeric"
        keyboardType="number-pad"
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedText}
        style={[
          styles.input,
          {
            backgroundColor: theme.inputBackground,
            borderColor: error ? theme.warning : theme.cardBorder,
            color: theme.text,
          },
        ]}
        value={value}
      />
      {error ? <Text style={[styles.errorText, { color: theme.warning }]}>{error}</Text> : null}
    </View>
  );
}

function TargetInput({
  error,
  label,
  onChangeText,
  suffix,
  value,
}: {
  error: string | null;
  label: string;
  onChangeText: (value: string) => void;
  suffix: string;
  value: string;
}) {
  const theme = useAppTheme();

  return (
    <View style={[styles.field, styles.flexField]}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <View
        style={[
          styles.suffixedInput,
          {
            backgroundColor: theme.inputBackground,
            borderColor: error ? theme.warning : theme.cardBorder,
          },
        ]}>
        <TextInput
          inputMode="decimal"
          keyboardType="decimal-pad"
          onChangeText={onChangeText}
          placeholder="0"
          placeholderTextColor={theme.mutedText}
          style={[styles.suffixedTextInput, { color: theme.text }]}
          value={value}
        />
        <Text style={[styles.suffixText, { color: theme.mutedText }]}>{suffix}</Text>
      </View>
      {error ? <Text style={[styles.errorText, { color: theme.warning }]}>{error}</Text> : null}
    </View>
  );
}

function TargetTile({ label, unit, value }: { label: string; unit: string; value: number }) {
  const theme = useAppTheme();

  return (
    <View style={[styles.targetTile, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}>
      <Text style={[styles.targetValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.targetLabel, { color: theme.mutedText }]}>
        {label} {unit}
      </Text>
    </View>
  );
}

function SettingsSection({ children, title }: { children: ReactNode; title: string }) {
  const theme = useAppTheme();

  return (
    <View style={styles.settingsSection}>
      <Text style={[styles.settingsSectionTitle, { color: theme.mutedText }]}>{title}</Text>
      <View
        style={[
          styles.settingsGroup,
          {
            backgroundColor: theme.card,
            borderColor: theme.cardBorder,
            shadowColor: theme.shadow,
          },
        ]}>
        {children}
      </View>
    </View>
  );
}

function SettingsRow({
  icon,
  onPress,
  subtitle,
  title,
}: {
  icon?: string;
  onPress?: () => void;
  subtitle: string;
  title: string;
}) {
  const theme = useAppTheme();
  const content = (
    <>
      <View style={[styles.settingsIconBubble, { backgroundColor: theme.chipBackground }]}>
        <Text style={[styles.settingsIconText, { color: theme.primary }]}>{icon ?? '•'}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.rowSubtitle, { color: theme.mutedText }]}>{subtitle}</Text>
      </View>
      {onPress ? <Text style={[styles.chevron, { color: theme.mutedText }]}>›</Text> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.settingsRow}>{content}</View>;
  }

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={styles.settingsRow}>
      {content}
    </PressableScale>
  );
}

function DashboardStyleButton({
  isSelected,
  label,
  onPress,
}: {
  isSelected: boolean;
  label: string;
  onPress: () => Promise<void>;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentButton,
        isSelected && { backgroundColor: theme.primary },
        pressed && styles.buttonPressed,
      ]}>
      <Text style={[styles.segmentButtonText, { color: isSelected ? '#FFFFFF' : theme.mutedText }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function TokenPlan({
  amount,
  disabled,
  onPress,
  price,
}: {
  amount: number;
  disabled?: boolean;
  onPress: () => void;
  price: string;
}) {
  const theme = useAppTheme();

  return (
    <View style={[styles.planCard, { backgroundColor: theme.cardAlt }]}>
      <Text style={[styles.planTitle, { color: theme.text }]}>{amount} tokens</Text>
      <Text style={[styles.planPrice, { color: theme.success }]}>{price}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.planButton,
          { backgroundColor: theme.success },
          disabled && styles.buttonDisabled,
          pressed && !disabled ? styles.buttonPressed : null,
        ]}>
        <Text style={styles.buttonText}>Add test tokens</Text>
      </Pressable>
    </View>
  );
}

function formatTransactionReason(transaction: TokenTransaction) {
  if (transaction.type === 'initial') {
    return transaction.reason || 'Free starter tokens';
  }

  if (transaction.type === 'purchase_test') {
    return 'Test purchase';
  }

  return transaction.reason;
}

const styles = StyleSheet.create({
  headerRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '900',
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '900',
  },
  mainHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSpacer: {
    width: 32,
  },
  mainHeaderTitle: {
    fontSize: 20,
    fontWeight: '900',
  },
  headerIcon: {
    width: 32,
    textAlign: 'right',
    fontSize: 18,
    fontWeight: '900',
  },
  profileHeader: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    padding: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 2,
  },
  avatar: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '900',
  },
  profileSubtitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  profileEdit: {
    fontSize: 20,
    fontWeight: '900',
  },
  insightCard: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    overflow: 'hidden',
    borderRadius: 24,
    padding: 18,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 2,
  },
  insightTitle: {
    fontSize: 20,
    fontWeight: '900',
  },
  insightSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  insightButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  insightButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  insightGlyph: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  insightGlyphText: {
    fontSize: 34,
    fontWeight: '900',
  },
  settingsSection: {
    gap: 10,
  },
  settingsSectionTitle: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  settingsGroup: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.045,
    shadowRadius: 18,
    elevation: 1,
  },
  settingsRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  settingsIconBubble: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  settingsIconText: {
    fontSize: 15,
    fontWeight: '900',
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  rowSubtitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 28,
    fontWeight: '700',
  },
  card: {
    gap: 18,
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.045,
    shadowRadius: 20,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: -10,
    fontSize: 15,
    lineHeight: 22,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '900',
  },
  stepperHeader: {
    gap: 8,
    borderRadius: 16,
    paddingVertical: 6,
  },
  stepCounter: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  stepDots: {
    height: 6,
    flexDirection: 'row',
    gap: 6,
  },
  stepDot: {
    height: 6,
    borderRadius: 999,
  },
  wizardFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 8,
  },
  secondaryButton: {
    minHeight: 52,
    flex: 0.42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '900',
  },
  wizardPrimaryButton: {
    minHeight: 52,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 10,
    padding: 4,
  },
  languageList: {
    gap: 10,
  },
  languageOption: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '900',
  },
  languageCheck: {
    minWidth: 20,
    textAlign: 'right',
    fontSize: 18,
    fontWeight: '900',
  },
  optionList: {
    gap: 10,
  },
  selectionOption: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  optionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  optionCheck: {
    minWidth: 22,
    textAlign: 'right',
    fontSize: 18,
    fontWeight: '900',
  },
  styleList: {
    gap: 12,
  },
  styleCard: {
    width: '100%',
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  styleIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  styleIconText: {
    fontSize: 22,
  },
  styleText: {
    flex: 1,
    minWidth: 0,
  },
  styleTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  styleDescription: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  flexField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '900',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallChip: {
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  smallChipText: {
    fontSize: 13,
    fontWeight: '900',
  },
  warningNote: {
    overflow: 'hidden',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
  },
  detailLine: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  targetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  targetTile: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  targetValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  targetLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
  },
  manualToggle: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  manualOverrideCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  manualCustomizeRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  manualRowTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  manualRowSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  toggleTrack: {
    width: 42,
    height: 24,
    justifyContent: 'center',
    borderRadius: 999,
    padding: 3,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 999,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 2,
  },
  manualIconBubble: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  manualIconText: {
    fontSize: 18,
  },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 8,
  },
  checkboxCheck: {
    fontSize: 14,
    fontWeight: '900',
  },
  suffixedInput: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
  },
  suffixedTextInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    paddingVertical: 0,
  },
  suffixText: {
    fontSize: 13,
    fontWeight: '900',
  },
  segmentButton: {
    minHeight: 42,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentButtonText: {
    fontSize: 14,
    fontWeight: '900',
  },
  planRow: {
    flexDirection: 'row',
    gap: 12,
  },
  planCard: {
    flex: 1,
    gap: 10,
    borderRadius: 10,
    padding: 14,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  planPrice: {
    fontSize: 15,
    fontWeight: '900',
  },
  planButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  transactionRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  transactionReason: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '900',
  },
  field: {
    gap: 8,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '800',
  },
  button: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
});
