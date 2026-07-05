import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/src/components/PressableScale';
import { useAppTheme } from '@/src/theme/appTheme';
import {
  ProductHealthFood,
  ProductHealthRating,
  describeProductNutrition,
  rateProductHealth,
} from '@/src/utils/productHealthRating';

type ProductRatingFood = ProductHealthFood & {
  name: string;
  baseCalories?: number;
  baseQuantity?: number;
  unit?: string;
  source?: string;
};

type ProductRatingCardProps = {
  food: ProductRatingFood;
  onAddToToday: () => void;
  onDismiss: () => void;
};

type NutrientCardProps = {
  label: string;
  maxValue: number;
  tone?: 'success' | 'warning' | 'neutral';
  value: number;
};

function getRatingColor(rating: ProductHealthRating, theme: ReturnType<typeof useAppTheme>) {
  if (rating.colorType === 'success') {
    return theme.success;
  }

  if (rating.colorType === 'warning') {
    return theme.warning;
  }

  return '#EF4444';
}

function getDataQualityLabel(food: ProductRatingFood) {
  const hasCoreData =
    Number.isFinite(food.calories) &&
    Number.isFinite(food.protein) &&
    Number.isFinite(food.carbs) &&
    Number.isFinite(food.fat);

  if (food.source === 'custom' || food.source === 'manual') {
    return 'Custom estimate';
  }

  if ((food.source === 'barcode' || food.source === 'local') && hasCoreData) {
    return typeof food.sugar === 'number' || typeof food.salt === 'number'
      ? 'Verified data'
      : 'Limited data';
  }

  return 'Limited data';
}

function formatValue(value: number) {
  return Math.round(value * 10) / 10;
}

export function ProductRatingCard({ food, onAddToToday, onDismiss }: ProductRatingCardProps) {
  const theme = useAppTheme();
  const rating = rateProductHealth(food);
  const description = describeProductNutrition(food, rating);
  const ratingColor = getRatingColor(rating, theme);
  const dataQualityLabel = getDataQualityLabel(food);
  const baseQuantity = food.baseQuantity ?? 100;
  const unit = food.unit ?? 'g';

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
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: theme.chipBackground }]}>
          <Text style={[styles.badgeText, { color: theme.primary }]}>Nutrition Review</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: theme.chipBackground }]}>
          <Text style={[styles.badgeText, { color: theme.mutedText }]}>{dataQualityLabel}</Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryText}>
          <Text style={[styles.name, { color: theme.text }]}>{food.name}</Text>
          <Text style={[styles.meta, { color: theme.mutedText }]}>
            {food.baseCalories ?? food.calories} kcal - per {baseQuantity}
            {unit}
          </Text>
        </View>
        <View style={[styles.scoreBadge, { borderColor: ratingColor, backgroundColor: theme.cardAlt }]}>
          <Text style={[styles.score, { color: ratingColor }]}>{rating.score}</Text>
          <Text style={[styles.scoreLabel, { color: theme.mutedText }]}>/ 100</Text>
          <Text style={[styles.scoreRating, { color: ratingColor }]}>{rating.label}</Text>
        </View>
      </View>

      <View
        style={[
          styles.conclusion,
          {
            backgroundColor: theme.cardAlt,
            borderColor: ratingColor,
          },
        ]}>
        <Text style={[styles.conclusionTitle, { color: ratingColor }]}>{description.headline}</Text>
        <Text style={[styles.conclusionText, { color: theme.text }]}>{description.subtitle}</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Macronutrient profile</Text>
        <View style={styles.nutrientGrid}>
          <NutrientCard label="Protein" maxValue={30} tone="success" value={food.protein} />
          <NutrientCard label="Carbohydrates" maxValue={80} value={food.carbs} />
          <NutrientCard label="Fat" maxValue={45} tone={food.fat > 25 ? 'warning' : 'neutral'} value={food.fat} />
          {typeof food.sugar === 'number' ? (
            <NutrientCard label="Sugars" maxValue={35} tone={food.sugar > 15 ? 'warning' : 'neutral'} value={food.sugar} />
          ) : null}
          {typeof food.salt === 'number' ? (
            <NutrientCard label="Salt" maxValue={4} tone={food.salt > 1.5 ? 'warning' : 'neutral'} value={food.salt} />
          ) : null}
          {typeof food.saturatedFat === 'number' ? (
            <NutrientCard
              label="Saturated fat"
              maxValue={20}
              tone={food.saturatedFat > 5 ? 'warning' : 'neutral'}
              value={food.saturatedFat}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Nutrition findings</Text>
        <View style={styles.findingList}>
          {description.findings.map((finding) => {
            const markerColor =
              finding.type === 'positive'
                ? theme.success
                : finding.type === 'warning'
                  ? theme.warning
                  : theme.primary;

            return (
              <View key={`${finding.title}-${finding.description}`} style={styles.findingRow}>
                <View style={[styles.findingMarker, { backgroundColor: markerColor }]} />
                <View style={styles.findingText}>
                  <Text style={[styles.findingTitle, { color: theme.text }]}>{finding.title}</Text>
                  <Text style={[styles.findingDescription, { color: theme.mutedText }]}>
                    {finding.description}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.dataBox, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}>
        <Text style={[styles.dataTitle, { color: theme.text }]}>Based on available nutrition data</Text>
        <Text style={[styles.dataText, { color: theme.mutedText }]}>
          {description.availableDataLabels.join(', ')}
        </Text>
      </View>

      <Text style={[styles.disclaimer, { color: theme.mutedText }]}>
        Simple estimate based on available nutrition values. Not medical advice. Values are usually per 100g unless stated.
      </Text>

      <View style={styles.actions}>
        <PressableScale
          accessibilityRole="button"
          onPress={onAddToToday}
          style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Add to today</Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          onPress={onDismiss}
          style={[
            styles.secondaryButton,
            { backgroundColor: theme.chipBackground },
          ]}>
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Not now</Text>
        </PressableScale>
      </View>
    </View>
  );
}

function NutrientCard({ label, maxValue, tone = 'neutral', value }: NutrientCardProps) {
  const theme = useAppTheme();
  const progress = `${Math.min((value / maxValue) * 100, 100)}%` as const;
  const color =
    tone === 'success'
      ? theme.success
      : tone === 'warning'
        ? theme.warning
        : theme.primary;

  return (
    <View style={[styles.nutrientCard, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}>
      <Text style={[styles.nutrientValue, { color: theme.text }]}>{formatValue(value)}g</Text>
      <Text style={[styles.nutrientLabel, { color: theme.mutedText }]}>{label}</Text>
      <View style={[styles.nutrientTrack, { backgroundColor: theme.chipBackground }]}>
        <View style={[styles.nutrientFill, { backgroundColor: color, width: progress }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  summaryText: {
    flex: 1,
    gap: 5,
  },
  name: {
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 29,
  },
  meta: {
    fontSize: 14,
    fontWeight: '800',
  },
  scoreBadge: {
    width: 96,
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 18,
    padding: 8,
  },
  score: {
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  scoreLabel: {
    fontSize: 11,
    fontWeight: '900',
  },
  scoreRating: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '900',
  },
  conclusion: {
    gap: 5,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 13,
  },
  conclusionTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  conclusionText: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  nutrientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  nutrientCard: {
    minWidth: '47%',
    flex: 1,
    gap: 7,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  nutrientValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  nutrientLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  nutrientTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: 6,
  },
  nutrientFill: {
    height: '100%',
    borderRadius: 6,
  },
  findingList: {
    gap: 10,
  },
  findingRow: {
    flexDirection: 'row',
    gap: 10,
  },
  findingMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  findingText: {
    flex: 1,
    gap: 2,
  },
  findingTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  findingDescription: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  dataBox: {
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  dataTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  dataText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  disclaimer: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    minHeight: 50,
    flex: 1,
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
  secondaryButton: {
    minHeight: 50,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '900',
  },
});
