import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/src/components/PressableScale';
import { FoodDefinition } from '@/src/foods';
import { useAppTheme } from '@/src/theme/appTheme';

type FoodBrowseCardProps = {
  food: FoodDefinition;
  isFavorite: boolean;
  onPress: (food: FoodDefinition) => void;
  onToggleFavorite: (food: FoodDefinition) => void;
};

function getFoodIconName(category: string): React.ComponentProps<typeof Ionicons>['name'] {
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

function MacroPill({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <View style={[styles.macroPill, { backgroundColor: `${color}18` }]}>
      <Text style={[styles.macroPillText, { color }]}>
        {label} {value}g
      </Text>
    </View>
  );
}

export function FoodBrowseCard({
  food,
  isFavorite,
  onPress,
  onToggleFavorite,
}: FoodBrowseCardProps) {
  const theme = useAppTheme();
  const calorieColor = theme.success;
  const iconTint = theme.primarySoft;

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={() => onPress(food)}
      scaleTo={0.985}
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          shadowColor: theme.shadow,
        },
      ]}>
      <View style={[styles.iconTile, { backgroundColor: iconTint }]}>
        <Ionicons color={theme.primary} name={getFoodIconName(food.category)} size={23} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.name, { color: theme.text }]}>{food.name}</Text>
        <Text style={[styles.meta, { color: theme.mutedText }]}>
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
            style={[
              styles.favoriteButton,
              {
                backgroundColor: isFavorite ? theme.warningSoft : 'transparent',
                borderColor: isFavorite ? theme.warning : theme.cardBorder,
              },
            ]}>
            <Ionicons
              color={isFavorite ? theme.warning : theme.mutedText}
              name={isFavorite ? 'star' : 'star-outline'}
              size={18}
            />
          </PressableScale>

          <View
            style={[
              styles.addButton,
              {
                backgroundColor: theme.primary,
                shadowColor: theme.primary,
              },
            ]}>
            <Ionicons color="#FFFFFF" name="add" size={19} />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 1,
  },
  iconTile: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  content: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
  },
  meta: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  macroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  macroPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  macroPillText: {
    fontSize: 11,
    fontWeight: '900',
  },
  trailing: {
    width: 68,
    alignItems: 'flex-end',
    gap: 11,
  },
  calorieBlock: {
    alignItems: 'flex-end',
  },
  calories: {
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 25,
  },
  calorieLabel: {
    marginTop: -2,
    fontSize: 11,
    fontWeight: '900',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  favoriteButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 16,
  },
  addButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
  },
});
