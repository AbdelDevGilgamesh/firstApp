import { StyleSheet, Text, View } from 'react-native';

import { FoodEntry } from '@/src/types';

type FoodRowProps = {
  entry: FoodEntry;
};

export function FoodRow({ entry }: FoodRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.nameGroup}>
        <Text style={styles.name}>{entry.name}</Text>
        {entry.quantity ? <Text style={styles.quantity}>{entry.quantity}</Text> : null}
      </View>
      <Text style={styles.calories}>{entry.calories} cal</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
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
  calories: {
    color: '#2E7D57',
    fontSize: 16,
    fontWeight: '800',
  },
});
