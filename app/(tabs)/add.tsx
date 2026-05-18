import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '@/src/components/Screen';
import { useCalories } from '@/src/context/CalorieContext';

export default function AddFoodScreen() {
  const { addFood } = useCalories();
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [quantity, setQuantity] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const parsedCalories = Number(calories);
  const isValid = name.trim().length > 0 && Number.isFinite(parsedCalories) && parsedCalories > 0;

  async function handleSave() {
    if (!isValid || isSaving) {
      Alert.alert('Check food details', 'Enter a food name and calories greater than zero.');
      return;
    }

    setIsSaving(true);

    try {
      await addFood({
        name,
        calories: Math.round(parsedCalories),
        quantity,
      });
      setName('');
      setCalories('');
      setQuantity('');
      router.push('/');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.keyboardView}>
      <Screen>
        <View style={styles.card}>
          <Text style={styles.title}>Add food</Text>
          <Text style={styles.subtitle}>Save what you ate today.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Food name</Text>
            <TextInput
              autoCapitalize="words"
              onChangeText={setName}
              placeholder="Chicken salad"
              placeholderTextColor="#9A9FA6"
              style={styles.input}
              value={name}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Calories</Text>
            <TextInput
              inputMode="numeric"
              keyboardType="number-pad"
              onChangeText={setCalories}
              placeholder="420"
              placeholderTextColor="#9A9FA6"
              style={styles.input}
              value={calories}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Quantity</Text>
            <TextInput
              onChangeText={setQuantity}
              placeholder="1 bowl, 250g, 2 slices"
              placeholderTextColor="#9A9FA6"
              style={styles.input}
              value={quantity}
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
            <Text style={styles.buttonText}>{isSaving ? 'Saving...' : 'Save food'}</Text>
          </Pressable>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
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
