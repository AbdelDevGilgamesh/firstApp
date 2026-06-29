import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/src/components/Screen';
import { useCalories } from '@/src/context/CalorieContext';
import { TokenTransaction, useTokens } from '@/src/context/TokenContext';
import { validateNumberRange } from '@/src/utils/validation';

export default function SettingsScreen() {
  const { dailyGoal, updateDailyGoal } = useCalories();
  const { addTokens, tokenBalance, transactions } = useTokens();
  const [goal, setGoal] = useState(String(dailyGoal));
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingTokens, setIsAddingTokens] = useState(false);

  useEffect(() => {
    setGoal(String(dailyGoal));
  }, [dailyGoal]);

  const parsedGoal = Number(goal);
  const goalError = validateNumberRange(goal, 'Daily goal', 500, 10000);
  const isValid = !goalError;

  async function handleSave() {
    if (!isValid || isSaving) {
      Alert.alert('Check goal', 'Enter a daily goal between 500 and 10000 calories.');
      return;
    }

    setIsSaving(true);

    try {
      await updateDailyGoal(Math.round(parsedGoal));
    } finally {
      setIsSaving(false);
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

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.title}>Tokens</Text>
        <Text style={styles.subtitle}>Tokens: {tokenBalance}</Text>
        <Text style={styles.note}>Test mode: no real payment yet.</Text>

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

        <View style={styles.transactions}>
          <Text style={styles.sectionTitle}>Recent transactions</Text>
          {transactions.slice(0, 8).map((transaction) => (
            <View key={transaction.id} style={styles.transactionRow}>
              <Text style={styles.transactionReason}>{formatTransactionReason(transaction)}</Text>
              <Text
                style={[
                  styles.transactionAmount,
                  transaction.amount > 0 ? styles.positiveAmount : styles.negativeAmount,
                ]}>
                {transaction.amount > 0 ? '+' : ''}
                {transaction.amount}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Daily goal</Text>
        <Text style={styles.subtitle}>Set the calorie target used on the Today screen.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Calories per day</Text>
          <TextInput
            inputMode="numeric"
            keyboardType="number-pad"
            onChangeText={setGoal}
            placeholder="2000"
            placeholderTextColor="#9A9FA6"
            style={[styles.input, goalError && styles.inputError]}
            value={goal}
          />
          {goalError ? <Text style={styles.errorText}>{goalError}</Text> : null}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!isValid || isSaving}
          onPress={handleSave}
          style={({ pressed }) => [
            styles.button,
            (!isValid || isSaving) && styles.buttonDisabled,
            pressed && isValid ? styles.buttonPressed : null,
          ]}>
          <Text style={styles.buttonText}>{isSaving ? 'Saving...' : 'Save goal'}</Text>
        </Pressable>
      </View>
    </Screen>
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
  return (
    <View style={styles.planCard}>
      <Text style={styles.planTitle}>{amount} tokens</Text>
      <Text style={styles.planPrice}>{price}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.planButton,
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
  card: {
    gap: 18,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 20,
    shadowColor: '#1E1F24',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  title: {
    color: '#1E1F24',
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: -12,
    color: '#6B6F76',
    fontSize: 15,
    lineHeight: 22,
  },
  note: {
    color: '#6B6F76',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#1E1F24',
    fontSize: 18,
    fontWeight: '900',
  },
  planRow: {
    flexDirection: 'row',
    gap: 12,
  },
  planCard: {
    flex: 1,
    gap: 10,
    borderRadius: 8,
    backgroundColor: '#F7F7F2',
    padding: 14,
  },
  planTitle: {
    color: '#1E1F24',
    fontSize: 16,
    fontWeight: '900',
  },
  planPrice: {
    color: '#2E7D57',
    fontSize: 15,
    fontWeight: '900',
  },
  planButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2E7D57',
  },
  transactions: {
    gap: 10,
  },
  transactionRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    backgroundColor: '#FAFAF7',
    paddingHorizontal: 12,
  },
  transactionReason: {
    color: '#1E1F24',
    fontSize: 14,
    fontWeight: '800',
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '900',
  },
  positiveAmount: {
    color: '#2E7D57',
  },
  negativeAmount: {
    color: '#B95C3A',
  },
  field: {
    gap: 8,
  },
  label: {
    color: '#3E4249',
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#DADDD4',
    borderRadius: 8,
    backgroundColor: '#FAFAF7',
    color: '#1E1F24',
    paddingHorizontal: 14,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#B95C3A',
    backgroundColor: '#FFF7F4',
  },
  errorText: {
    color: '#B95C3A',
    fontSize: 12,
    fontWeight: '800',
  },
  button: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2E7D57',
  },
  buttonDisabled: {
    backgroundColor: '#AAB8AF',
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
