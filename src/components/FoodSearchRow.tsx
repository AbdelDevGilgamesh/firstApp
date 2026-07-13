import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/src/components/PressableScale';
import { FoodDefinition } from '@/src/foods';
import { useAppTheme } from '@/src/theme/appTheme';

type FoodSearchRowProps = {
  food: FoodDefinition;
  isFavorite: boolean;
  onPress: (food: FoodDefinition) => void;
  onToggleFavorite: (food: FoodDefinition) => void;
};

function getIconName(category: string): React.ComponentProps<typeof Ionicons>['name'] {
  const normalized = category.toLowerCase();

  if (normalized.includes('meat') || normalized.includes('seafood')) {
    return 'restaurant-outline';
  }

  if (normalized.includes('grain') || normalized.includes('bakery')) {
    return 'leaf-outline';
  }

  if (normalized.includes('drink') || normalized.includes('dairy')) {
    return 'cafe-outline';
  }

  if (normalized.includes('fruit') || normalized.includes('vegetable')) {
    return 'nutrition-outline';
  }

  return 'sparkles-outline';
}

function MacroPill({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={[styles.macroPill, { backgroundColor: `${color}14` }]}>
      <Text style={[styles.macroText, { color }]}>
        {label} {value}g
      </Text>
    </View>
  );
}

export function FoodSearchRow({ food, isFavorite, onPress, onToggleFavorite }: FoodSearchRowProps) {
  const theme = useAppTheme();
  const calorieColor = theme.success;

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={() => onPress(food)}
      scaleTo={0.99}
      style={[
        styles.row,
        {
          backgroundColor: theme.card,
          borderBottomColor: theme.cardBorder,
        },
      ]}>
      <View style={[styles.iconTile, { backgroundColor: theme.primarySoft }]}>
        <Ionicons color={theme.primary} name={getIconName(food.category)} size={19} />
      </View>

      <View style={styles.content}>
        <Text numberOfLines={2} style={[styles.name, { color: theme.text }]}>
          {food.name}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: theme.mutedText }]}>
          {food.category} - per {food.baseQuantity}
          {food.unit}
        </Text>
        <View style={styles.macroRow}>
          <MacroPill color={theme.primary} label="P" value={food.protein} />
          <MacroPill color={theme.warning} label="C" value={food.carbs} />
          <MacroPill color={theme.successDark} label="F" value={food.fat} />
        </View>
      </View>

      <View style={styles.trailing}>
        <View style={styles.calorieBlock}>
          <Text style={[styles.calories, { color: calorieColor }]}>{food.baseCalories}</Text>
          <Text style={[styles.calorieLabel, { color: theme.mutedText }]}>cal</Text>
        </View>
        <View style={styles.actionRow}>
          <PressableScale
            accessibilityLabel={isFavorite ? 'Remove favorite' : 'Add favorite'}
            accessibilityRole="button"
            hitSlop={8}
            onPress={(event) => {
              event.stopPropagation();
              onToggleFavorite(food);
            }}
            scaleTo={0.9}
            style={styles.starButton}>
            <Ionicons
              color={isFavorite ? theme.warning : theme.mutedText}
              name={isFavorite ? 'star' : 'star-outline'}
              size={18}
            />
          </PressableScale>
          <View style={[styles.addButton, { backgroundColor: theme.primary }]}>
            <Ionicons color="#FFFFFF" name="add" size={16} />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    paddingHorizontal: 2,
    paddingVertical: 9,
  },
  iconTile: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  content: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 17,
  },
  meta: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
  },
  macroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  macroPill: {
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  macroText: {
    fontSize: 10,
    fontWeight: '900',
  },
  trailing: {
    width: 64,
    alignItems: 'flex-end',
    gap: 6,
  },
  calorieBlock: {
    alignItems: 'flex-end',
  },
  calories: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  calorieLabel: {
    marginTop: -2,
    fontSize: 10,
    fontWeight: '900',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  starButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
});
