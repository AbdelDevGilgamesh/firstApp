import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/src/components/Screen';
import { useCalories } from '@/src/context/CalorieContext';

export default function SettingsScreen() {
  const { dailyGoal, updateDailyGoal } = useCalories();
  const [goal, setGoal] = useState(String(dailyGoal));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setGoal(String(dailyGoal));
  }, [dailyGoal]);

  const parsedGoal = Number(goal);
  const isValid = Number.isFinite(parsedGoal) && parsedGoal > 0;

  async function handleSave() {
    if (!isValid || isSaving) {
      Alert.alert('Check goal', 'Enter a daily goal greater than zero.');
      return;
    }

    setIsSaving(true);

    try {
      await updateDailyGoal(Math.round(parsedGoal));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Screen>
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
            style={styles.input}
            value={goal}
          />
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
