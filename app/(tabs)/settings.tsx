import { useCallback, useEffect, useState } from 'react';
import { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/src/components/Screen';
import { useCalories } from '@/src/context/CalorieContext';
import { TokenTransaction, useTokens } from '@/src/context/TokenContext';
import { useAppTheme } from '@/src/theme/appTheme';
import { validateNumberRange } from '@/src/utils/validation';

type SettingsPanel = 'main' | 'appearance' | 'tokens' | 'dailyGoal' | 'sync' | 'about';
const WATER_UNLOCK_COST = 20;

export default function SettingsScreen() {
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ panel?: string }>();
  const {
    dailyGoal,
    todayDashboardStyle,
    updateDailyGoal,
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

  useEffect(() => {
    setGoal(String(dailyGoal));
  }, [dailyGoal]);

  useEffect(() => {
    setWaterGoal(String(waterGoalGlasses));
  }, [waterGoalGlasses]);

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
            <Text style={[styles.backButtonText, { color: theme.primary }]}>Back</Text>
          </Pressable>
        ) : null}
        <Text style={[styles.screenTitle, { color: theme.text }]}>{title}</Text>
      </View>
    );
  }

  if (activePanel === 'appearance') {
    return (
      <Screen>
        {renderHeader('Appearance')}
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Theme</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            Choose the app-wide visual style.
          </Text>
          <View style={[styles.segmentedControl, { backgroundColor: theme.chipBackground }]}>
            <DashboardStyleButton
              isSelected={todayDashboardStyle === 'classic'}
              label="Classic"
              onPress={() => updateTodayDashboardStyle('classic')}
            />
            <DashboardStyleButton
              isSelected={todayDashboardStyle === 'premiumDark'}
              label="Premium Dark"
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
        {renderHeader('Tokens')}
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{tokenBalance} tokens</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            Test mode: no real payment yet.
          </Text>
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
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent transactions</Text>
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
        {renderHeader('Goals')}
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Daily calories</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            Set the calorie target used across the app.
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
            <Text style={styles.buttonText}>{isSaving ? 'Saving...' : 'Save goal'}</Text>
          </Pressable>
        </SettingsCard>
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Water intake</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            Track daily water glasses.
          </Text>
          {waterIntakeUnlocked ? (
            <>
              <Text style={[styles.statusText, { color: theme.success }]}>Enabled</Text>
              <Text style={[styles.subtitle, { color: theme.mutedText }]}>
                Daily goal: {waterGoalGlasses} glasses
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
                <Text style={styles.buttonText}>Save water goal</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.statusText, { color: theme.warning }]}>Locked feature</Text>
              <Text style={[styles.subtitle, { color: theme.mutedText }]}>
                Unlock for {WATER_UNLOCK_COST} tokens.
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
                  {isUnlockingWater ? 'Unlocking...' : `Unlock with ${WATER_UNLOCK_COST} tokens`}
                </Text>
              </Pressable>
            </>
          )}
        </SettingsCard>
      </Screen>
    );
  }

  if (activePanel === 'sync') {
    return (
      <Screen>
        {renderHeader('Database / Sync')}
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Offline-first sync</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            Food entries and tokens use Supabase when available and keep AsyncStorage as the local fallback.
          </Text>
        </SettingsCard>
      </Screen>
    );
  }

  if (activePanel === 'about') {
    return (
      <Screen>
        {renderHeader('About')}
        <SettingsCard>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Calorie Tracker</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>
            MVP test mode. Token purchases are simulated locally.
          </Text>
        </SettingsCard>
      </Screen>
    );
  }

  return (
    <Screen>
      {renderHeader('Settings')}
      <SettingsRow
        onPress={() => setActivePanel('appearance')}
        subtitle={todayDashboardStyle === 'premiumDark' ? 'Premium Dark theme' : 'Classic theme'}
        title="Appearance"
      />
      <SettingsRow
        onPress={() => setActivePanel('tokens')}
        subtitle={`${tokenBalance} tokens available`}
        title="Tokens"
      />
      <SettingsRow
        onPress={() => setActivePanel('dailyGoal')}
        subtitle="Calories, water, and daily targets"
        title="Goals"
      />
      <SettingsRow
        onPress={() => setActivePanel('sync')}
        subtitle="Supabase with local cache"
        title="Database / Sync"
      />
      <SettingsRow
        onPress={() => setActivePanel('about')}
        subtitle="Test mode details"
        title="About / Test mode"
      />
    </Screen>
  );
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

function SettingsRow({
  onPress,
  subtitle,
  title,
}: {
  onPress: () => void;
  subtitle: string;
  title: string;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingsRow,
        { backgroundColor: theme.card, borderColor: theme.cardBorder },
        pressed && styles.buttonPressed,
      ]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.rowSubtitle, { color: theme.mutedText }]}>{subtitle}</Text>
      </View>
      <Text style={[styles.chevron, { color: theme.mutedText }]}>›</Text>
    </Pressable>
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
  settingsRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
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
    borderRadius: 12,
    padding: 20,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
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
  segmentedControl: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 10,
    padding: 4,
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
