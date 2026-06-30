import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/src/theme/appTheme';
import { MealPhotoEstimate } from '@/src/utils/mealPhotoEstimate';

type MealPhotoEstimateCardProps = {
  estimate: MealPhotoEstimate;
  imageUri: string;
  canSave: boolean;
  onCancel: () => void;
  onEdit: () => void;
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
  onGetTokens,
  onRetake,
  onSave,
}: MealPhotoEstimateCardProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Image source={{ uri: imageUri }} style={styles.image} />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>Review before saving</Text>
          <Text style={[styles.title, { color: theme.text }]}>Estimated meal</Text>
          <Text style={[styles.subtitle, { color: theme.mutedText }]}>Approximate portion estimate</Text>
        </View>
        <View style={[styles.calorieBadge, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}>
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
            !canSave && styles.disabledButton,
            pressed && canSave ? styles.pressed : null,
          ]}>
          <Text style={styles.primaryButtonText}>Save to Today - 5 tokens</Text>
        </Pressable>
        <View style={styles.secondaryRow}>
          <Pressable
            accessibilityRole="button"
            onPress={onEdit}
            style={({ pressed }) => [styles.secondaryButton, { backgroundColor: theme.chipBackground }, pressed && styles.pressed]}>
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Edit estimate</Text>
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

function MacroPill({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();

  return (
    <View style={[styles.macroPill, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}>
      <Text style={[styles.macroValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.macroLabel, { color: theme.mutedText }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 12,
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
  subtitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  calorieBadge: {
    minWidth: 86,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
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
    borderRadius: 12,
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
    borderRadius: 12,
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
  actions: {
    gap: 10,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#2E7D57',
    paddingHorizontal: 12,
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
    borderRadius: 10,
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
