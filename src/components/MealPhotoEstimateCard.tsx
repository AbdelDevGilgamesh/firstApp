import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppTheme } from '@/src/theme/appTheme';
import { MealPhotoEstimate } from '@/src/utils/mealPhotoEstimate';

type MealPhotoEstimateCardProps = {
  estimate: MealPhotoEstimate;
  imageUri: string;
  canSave: boolean;
  onCancel: () => void;
  onEdit: () => void;
  onEstimateChange?: (estimate: MealPhotoEstimate) => void;
  onGetTokens: () => void;
  onRetake: () => void;
  onSave: () => void;
};

export function MealPhotoEstimateCard({
  canSave,
  estimate,
  imageUri,
  onCancel,
  onEdit,
  onEstimateChange,
  onGetTokens,
  onRetake,
  onSave,
}: MealPhotoEstimateCardProps) {
  const theme = useAppTheme();
  const providerLabel = estimate.isDemo
    ? 'Demo estimate - for testing only'
    : `AI estimate - ${estimate.provider === 'gemini' ? 'Gemini' : 'Vision'}`;

  function updateEstimate(patch: Partial<MealPhotoEstimate>) {
    onEstimateChange?.({ ...estimate, ...patch });
  }

  function updateItem(index: number, patch: Partial<NonNullable<MealPhotoEstimate['items']>[number]>) {
    const items = estimate.items ?? [];
    const nextItems = items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
    const totals = nextItems.reduce(
      (sum, item) => ({
        calories: sum.calories + item.calories,
        protein: sum.protein + item.protein,
        carbs: sum.carbs + item.carbs,
        fat: sum.fat + item.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );

    updateEstimate({
      items: nextItems,
      calories: Math.round(totals.calories),
      protein: round(totals.protein),
      carbs: round(totals.carbs),
      fat: round(totals.fat),
    });
  }

  function removeItem(index: number) {
    const items = (estimate.items ?? []).filter((_, itemIndex) => itemIndex !== index);
    const totals = items.reduce(
      (sum, item) => ({
        calories: sum.calories + item.calories,
        protein: sum.protein + item.protein,
        carbs: sum.carbs + item.carbs,
        fat: sum.fat + item.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );

    updateEstimate({
      items,
      calories: Math.round(totals.calories),
      protein: round(totals.protein),
      carbs: round(totals.carbs),
      fat: round(totals.fat),
    });
  }

  function addItem() {
    const items = estimate.items ?? [];
    updateEstimate({
      items: [
        ...items,
        {
          id: `manual-${Date.now()}`,
          name: 'Food item',
          estimatedQuantity: '1 serving',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          confidence: 'low',
          notes: [],
        },
      ],
    });
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          shadowColor: theme.shadow,
        },
      ]}>
      <Image source={{ uri: imageUri }} style={styles.image} />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>{providerLabel}</Text>
          <TextInput
            value={estimate.name}
            onChangeText={(value) => updateEstimate({ name: value })}
            placeholder="Meal name"
            placeholderTextColor={theme.mutedText}
            style={[styles.titleInput, { color: theme.text }]}
          />
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>Review and edit before saving.</Text>
        </View>
        <View style={[styles.calorieBadge, { backgroundColor: theme.successSoft, borderColor: theme.cardBorder }]}>
          <Text style={[styles.calories, { color: theme.text }]}>{estimate.calories}</Text>
          <Text style={[styles.calorieLabel, { color: theme.mutedText }]}>cal</Text>
        </View>
      </View>

      <View style={styles.macroRow}>
        <MacroPill label="Protein" value={`${estimate.protein}g`} />
        <MacroPill label="Carbs" value={`${estimate.carbs}g`} />
        <MacroPill label="Fat" value={`${estimate.fat}g`} />
      </View>

      <View style={[styles.notice, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}>
        <Text style={[styles.noticeTitle, { color: theme.text }]}>{estimate.confidence}</Text>
        <Text style={[styles.noticeText, { color: theme.mutedText }]}>{estimate.explanation}</Text>
      </View>

      <View style={styles.itemsSection}>
        <View style={styles.itemsHeader}>
          <Text style={[styles.itemsTitle, { color: theme.text }]}>Detected items</Text>
          <Pressable accessibilityRole="button" onPress={addItem} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={[styles.addItemText, { color: theme.primary }]}>Add item</Text>
          </Pressable>
        </View>
        {(estimate.items ?? []).map((item, index) => (
          <View key={item.id} style={[styles.itemCard, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}>
            <View style={styles.itemTopRow}>
              <TextInput
                value={item.name}
                onChangeText={(value) => updateItem(index, { name: value })}
                placeholder="Food name"
                placeholderTextColor={theme.mutedText}
                style={[styles.itemNameInput, { color: theme.text }]}
              />
              <Pressable
                accessibilityLabel={`Remove ${item.name}`}
                accessibilityRole="button"
                onPress={() => removeItem(index)}
                style={({ pressed }) => [styles.removeButton, { backgroundColor: theme.dangerSoft }, pressed && styles.pressed]}>
                <Text style={[styles.removeButtonText, { color: theme.danger }]}>Remove</Text>
              </Pressable>
            </View>
            <TextInput
              value={item.estimatedQuantity}
              onChangeText={(value) => updateItem(index, { estimatedQuantity: value })}
              placeholder="Quantity"
              placeholderTextColor={theme.mutedText}
              style={[styles.quantityInput, { backgroundColor: theme.inputBackground, borderColor: theme.cardBorder, color: theme.text }]}
            />
            <View style={styles.nutritionGrid}>
              <NutritionInput label="Cal" value={item.calories} onChange={(value) => updateItem(index, { calories: value })} />
              <NutritionInput label="P" value={item.protein} onChange={(value) => updateItem(index, { protein: value })} />
              <NutritionInput label="C" value={item.carbs} onChange={(value) => updateItem(index, { carbs: value })} />
              <NutritionInput label="F" value={item.fat} onChange={(value) => updateItem(index, { fat: value })} />
            </View>
          </View>
        ))}
      </View>

      {!canSave ? (
        <View style={[styles.notice, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}>
          <Text style={[styles.noticeTitle, { color: theme.warning }]}>Not enough tokens</Text>
          <Text style={[styles.noticeText, { color: theme.mutedText }]}>Meal photo estimates cost 5 tokens.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onGetTokens}
            style={({ pressed }) => [styles.secondaryButton, { backgroundColor: theme.chipBackground }, pressed && styles.pressed]}>
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Get tokens</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={!canSave}
          onPress={onSave}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: theme.primary,
              shadowColor: theme.primary,
            },
            !canSave && styles.disabledButton,
            pressed && canSave ? styles.pressed : null,
          ]}>
          <Text style={styles.primaryButtonText}>Save to Today</Text>
        </Pressable>
        <View style={styles.secondaryRow}>
          <Pressable
            accessibilityRole="button"
            onPress={onEdit}
            style={({ pressed }) => [styles.secondaryButton, { backgroundColor: theme.chipBackground }, pressed && styles.pressed]}>
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Edit photo</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onRetake}
            style={({ pressed }) => [styles.secondaryButton, { backgroundColor: theme.chipBackground }, pressed && styles.pressed]}>
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Retake photo</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={[styles.cancelText, { color: theme.mutedText }]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function parseNumberInput(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function MacroPill({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();

  return (
    <View style={[styles.macroPill, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}>
      <Text style={[styles.macroValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.macroLabel, { color: theme.mutedText }]}>{label}</Text>
    </View>
  );
}

function NutritionInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  const theme = useAppTheme();

  return (
    <View style={styles.nutritionInputWrap}>
      <Text style={[styles.nutritionLabel, { color: theme.mutedText }]}>{label}</Text>
      <TextInput
        keyboardType="decimal-pad"
        onChangeText={(text) => onChange(parseNumberInput(text))}
        style={[styles.nutritionInput, { backgroundColor: theme.inputBackground, borderColor: theme.cardBorder, color: theme.text }]}
        value={String(value)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 2,
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 20,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
  },
  titleInput: {
    margin: 0,
    padding: 0,
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  calorieBadge: {
    minWidth: 86,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    padding: 11,
  },
  calories: {
    fontSize: 28,
    fontWeight: '900',
  },
  calorieLabel: {
    fontSize: 12,
    fontWeight: '900',
  },
  macroRow: {
    flexDirection: 'row',
    gap: 10,
  },
  macroPill: {
    flex: 1,
    gap: 3,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  macroValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  macroLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  notice: {
    gap: 7,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  noticeText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  itemsSection: {
    gap: 10,
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemsTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  addItemText: {
    fontSize: 13,
    fontWeight: '900',
  },
  itemCard: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemNameInput: {
    flex: 1,
    margin: 0,
    padding: 0,
    fontSize: 16,
    fontWeight: '900',
  },
  removeButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: '900',
  },
  quantityInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '800',
  },
  nutritionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  nutritionInputWrap: {
    flex: 1,
    gap: 5,
  },
  nutritionLabel: {
    fontSize: 11,
    fontWeight: '900',
  },
  nutritionInput: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '900',
  },
  actions: {
    gap: 10,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#2E7D57',
    paddingHorizontal: 12,
    shadowColor: '#2E7D57',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 2,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    paddingHorizontal: 10,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  cancelText: {
    paddingVertical: 8,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.82,
  },
});
