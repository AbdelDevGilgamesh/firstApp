import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FoodEntry } from '@/src/types';

type FoodRowProps = {
  entry: FoodEntry;
  onDelete?: (entry: FoodEntry) => void;
  onEdit?: (entry: FoodEntry) => void;
};

export function FoodRow({ entry, onDelete, onEdit }: FoodRowProps) {
  const showActions = Boolean(onDelete || onEdit);
  const quantityLabel =
    entry.quantity ?? (entry.quantityValue && entry.unit ? `${entry.quantityValue} ${entry.unit}` : undefined);
  const hasMacros =
    typeof entry.protein === 'number' || typeof entry.carbs === 'number' || typeof entry.fat === 'number';

  return (
    <View style={styles.row}>
      <View style={styles.nameGroup}>
        <Text style={styles.name}>{entry.name}</Text>
        {quantityLabel ? <Text style={styles.quantity}>Quantity: {quantityLabel}</Text> : null}
        {hasMacros ? (
          <Text style={styles.macros}>
            P {entry.protein ?? 0}g / C {entry.carbs ?? 0}g / F {entry.fat ?? 0}g
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        <Text style={styles.calories}>{entry.calories} cal</Text>
        {showActions ? (
          <View style={styles.actions}>
            {onEdit ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onEdit(entry)}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}>
                <Text style={styles.editText}>Edit</Text>
              </Pressable>
            ) : null}
            {onDelete ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onDelete(entry)}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#1E1F24',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  nameGroup: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: '#1E1F24',
    fontSize: 16,
    fontWeight: '700',
  },
  quantity: {
    color: '#6B6F76',
    fontSize: 13,
  },
  macros: {
    color: '#6B6F76',
    fontSize: 13,
    fontWeight: '700',
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 8,
  },
  calories: {
    color: '#2E7D57',
    fontSize: 16,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    minHeight: 30,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F1F3EF',
    paddingHorizontal: 10,
  },
  actionPressed: {
    opacity: 0.72,
  },
  editText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '900',
  },
  deleteText: {
    color: '#B95C3A',
    fontSize: 12,
    fontWeight: '900',
  },
});
